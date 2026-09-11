"""固定上游版本，保留像素/时长/署名，转换 PMD 动作为项目序列帧。"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import argparse
import hashlib
import json
import math
import urllib.request
import xml.etree.ElementTree as ET
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
REVISION = '1f201ba3f969dd0eb4447744dffaeaaef26f5ae7'
BASE = f'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/{REVISION}/'
CACHE = ROOT / 'art-source' / 'pmd-source-v1'
OUT = ROOT / 'apps/web/public/sprites/pmd-v1'


def download(path):
    dest = CACHE / path.removeprefix('sprite/')
    if dest.exists():
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(BASE + path, timeout=30) as response:
                data = response.read()
            dest.write_bytes(data)
            return dest
        except Exception:
            if attempt == 2:
                raise


def marker(im, target):
    for y in range(im.height):
        for x in range(im.width):
            r,g,b,a = im.getpixel((x,y))
            if a and (r,g,b) == target:
                return x,y
    return None


def convert(species):
    key = f'{species:04d}'
    xml_path = download(f'sprite/{key}/AnimData.xml')
    animations = {a.findtext('Name'): a for a in ET.parse(xml_path).getroot().findall('./Anims/Anim')}

    def resolve(name, seen=()):
        if name in seen:
            raise ValueError(f'{key}: 动作别名循环 {name}')
        node = animations[name]
        return resolve(node.findtext('CopyOf'), seen+(name,)) if node.findtext('CopyOf') else node

    casting_name = next(name for name in ['Shoot','Dance','SpAttack','Attack'] if name in animations)
    logical = {'idle':'Idle','locomotion':'Walk','attack':'Attack','cast':casting_name,'hit':'Hurt',
               'faint':'Faint' if 'Faint' in animations else 'Hurt'}
    resolved = {name: resolve(source) for name, source in logical.items()}
    source_names = {node.findtext('Name') for node in resolved.values()}
    sheets = {name: {part:Image.open(download(f'sprite/{key}/{name}-{part}.png')).convert('RGBA')
                     for part in ['Anim','Offsets','Shadow']} for name in source_names}
    credits = download(f'sprite/{key}/credits.txt').read_text(encoding='utf-8')
    target = OUT / key
    target.mkdir(parents=True, exist_ok=True)
    (target/'credits.txt').write_text(credits, encoding='utf-8')
    source_record = {'revision':REVISION,'species':species,'url':BASE+f'sprite/{key}/',
                     'castingSource':casting_name,'faintFallback':'Faint' not in animations,
                     'changes':'裁切方向、按源影子中心对齐画布、拆分施法阶段；保留像素与1/60秒帧时长',
                     'xmlSha256':hashlib.sha256(xml_path.read_bytes()).hexdigest()}
    (target/'source.json').write_text(json.dumps(source_record,ensure_ascii=False,indent=2),encoding='utf-8')
    for side, direction, facing in [('front',7,-1),('back',3,1)]:
        cells = []
        source_indices = {}
        timing = {}
        for name in sorted(source_names):
            node = resolve(name)
            fw,fh = int(node.findtext('FrameWidth')),int(node.findtext('FrameHeight'))
            durations = [int(d.text) for d in node.findall('./Durations/Duration')]
            ims = sheets[name]
            rows = ims['Anim'].height//fh
            assert rows in (1,8), (key,name,rows)
            assert ims['Anim'].width == fw*len(durations), (key,name,'列数不符')
            row = direction if rows == 8 else 0
            source_indices[name] = []
            timing[name] = durations
            for i in range(len(durations)):
                box=(i*fw,row*fh,(i+1)*fw,(row+1)*fh)
                frame=ims['Anim'].crop(box)
                offsets=ims['Offsets'].crop(box)
                shadow=ims['Shadow'].crop(box)
                ground=marker(shadow,(255,255,255))
                if ground is None:
                    raise ValueError(f'{key} {name} {i}: 缺失源影子原点')
                body=marker(offsets,(0,255,0)) or (fw//2,fh//2)
                head=marker(offsets,(0,0,0)) or body
                # 黑色标记是头部；在头朝向的一侧取嘴部近似点，供逐类验收校准。
                muzzle=(head[0]+facing*3,head[1]+2)
                # 舞动施法使用源手部标记；选择朝向目标的一只手。
                if name == 'Dance':
                    hands=[point for color in [(255,0,0),(0,0,255)] if (point:=marker(offsets,color))]
                    if hands:
                        muzzle=max(hands,key=lambda point: point[0]*facing)
                anchors={'ground':(0,0),'root':(0,0),'head':(head[0]-ground[0],head[1]-ground[1]),
                         'muzzle':(muzzle[0]-ground[0],muzzle[1]-ground[1]),
                         'body':(body[0]-ground[0],body[1]-ground[1]),
                         'center':(body[0]-ground[0],body[1]-ground[1])}
                source_indices[name].append(len(cells))
                cells.append((frame,ground,anchors))
        boxes=[(b[0]-g[0],b[1]-g[1],b[2]-g[0],b[3]-g[1])
               for frame,g,_ in cells if (b:=frame.getbbox())]
        left=min(b[0] for b in boxes)-3; top=min(b[1] for b in boxes)-3
        right=max(b[2] for b in boxes)+3; bottom=max(b[3] for b in boxes)+3
        width=math.ceil((right-left)/8)*8; height=math.ceil((bottom-top)/8)*8
        pivot=(-left,-top)
        columns=8
        atlas=Image.new('RGBA',(width*columns,height*math.ceil(len(cells)/columns)))
        frame_anchors=[]
        for index,(frame,ground,anchors) in enumerate(cells):
            x,y=pivot[0]-ground[0],pivot[1]-ground[1]
            cell=Image.new('RGBA',(width,height))
            cell.paste(frame,(x,y))
            atlas.paste(cell,((index%columns)*width,(index//columns)*height))
            frame_anchors.append({name:{'x':v[0]+pivot[0],'y':v[1]+pivot[1]} for name,v in anchors.items()})
        clips={}

        def clip(name, source, start=0, end=None, loop=False, hold=False):
            ids=source_indices[source]; end=len(ids) if end is None else end
            chosen=list(range(max(0,start),min(len(ids),end)))
            if not chosen: chosen=[min(len(ids)-1,max(0,start))]
            # 使用重复的图集索引保留源逐帧时长，不重复PNG像素。
            frames=[ids[i] for i in chosen for _ in range(timing[source][i])]
            clips[name]={'frames':frames,'loop':loop,**({'holdLastFrame':True} if hold else {})}

        idle=resolved['idle'].findtext('Name')
        shoot=resolved['cast'].findtext('Name')
        attack=resolved['attack'].findtext('Name')
        hit=int(resolved['cast'].findtext('HitFrame') or 0)
        ret=int(resolved['cast'].findtext('ReturnFrame') or len(source_indices[shoot])-1)
        ret=max(hit+1,ret)
        clip('idle',idle,loop=True)
        clip('locomotion',resolved['locomotion'].findtext('Name'),loop=True)
        clip('charge',shoot,0,max(1,hit),loop=True,hold=True)
        clip('cast',shoot,hit,ret)
        clip('channel',shoot,hit,ret,loop=True,hold=True)
        clip('recover',shoot,ret)
        clip('attack',attack)
        clip('hit',resolved['hit'].findtext('Name'))
        clip('faint',resolved['faint'].findtext('Name'))
        clip('enter',idle)
        clip('exit',resolved['faint'].findtext('Name'))
        metadata={'schemaVersion':1,'frameWidth':width,'frameHeight':height,'columns':columns,'fps':60,
                  'pixelScale':2.5,'pivot':{'x':pivot[0]/width,'y':pivot[1]/height},
                  'frameAnchors':frame_anchors,'clips':clips,'transitions':[]}
        atlas.save(target/f'{side}.png',optimize=True)
        (target/f'{side}.json').write_text(json.dumps(metadata,separators=(',',':')),encoding='utf-8')
        icon=cells[source_indices[idle][0]][0]
        icon=icon.crop(icon.getbbox())
        icon.save(target/f'{side}-idle.png')
    return {'id':species, 'castingSource':casting_name,'faintFallback':'Faint' not in animations}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--species',default=','.join(str(i) for i in range(1,152)))
    args=parser.parse_args()
    ids=[int(i) for i in args.species.split(',')]
    OUT.mkdir(parents=True,exist_ok=True)
    for filename in ['LICENSE.md','credit_names.txt','README.md']:
        (OUT/('UPSTREAM-'+filename)).write_bytes(download(filename).read_bytes())
    report_path=OUT/'import-report.json'
    results={row['id']:row for row in json.loads(report_path.read_text(encoding='utf-8'))['species']} if report_path.exists() else {}
    completed=0
    with ThreadPoolExecutor(max_workers=8) as pool:
        pending={pool.submit(convert,i):i for i in ids}
        for future in as_completed(pending):
            result=future.result()
            results[result['id']]=result
            completed+=1
            if completed%10==0 or completed==len(ids):
                print(f'转换 {completed}/{len(ids)}',flush=True)
    report_path.write_text(json.dumps({'revision':REVISION,'species':sorted(results.values(),key=lambda r:r['id'])},ensure_ascii=False,indent=2),encoding='utf-8')
    write_config()


def write_config():
    sizes={}
    for path in sorted(OUT.glob('[0-9][0-9][0-9][0-9]/front.json')):
        metadata=json.loads(path.read_text(encoding='utf-8'))
        sizes[int(path.parent.name)]={'width':metadata['frameWidth'],'height':metadata['frameHeight']}
    text='// 由 scripts/import-pmd-battle-assets.py 生成；源版本 '+REVISION+'。\n'
    text+='export const PMD_BATTLE_FRAME_SIZES: Readonly<Record<number, { width: number; height: number }>> = '
    text+=json.dumps(sizes,indent=2)+';\n'
    (ROOT/'packages/config/src/pmd-battle.generated.ts').write_text(text,encoding='utf-8')


if __name__=='__main__':
    main()
