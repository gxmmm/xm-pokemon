"""纯代码绘制的喷火龙动作研究；不读取或拼贴现有图片，不接正式资源。"""
from pathlib import Path
import json
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'art-source' / 'flame-wing-code-v1'
INK = '#302e37'
ORANGE = '#e87f38'
LIGHT = '#ffb052'
SHADE = '#b94e32'
CREAM = '#f6db99'
TEAL = '#367f87'
DARK_TEAL = '#255662'
SIZE = 128

# 头颈伸缩、下颚开合、翼端与手肘分别变化，足部不参加插值。
POSES = [
    dict(head_x=37, head_y=38, jaw=1, wing=0, arm=0),
    dict(head_x=44, head_y=34, jaw=1, wing=-6, arm=-8),
    dict(head_x=29, head_y=41, jaw=8, wing=5, arm=5),
    dict(head_x=41, head_y=37, jaw=4, wing=2, arm=-2),
]
NAMES = ['idle', 'charge', 'release', 'recover']


def render(pose):
    im = Image.new('RGBA', (SIZE, SIZE))
    d = ImageDraw.Draw(im)

    def poly(points, color, outline=INK):
        xy = [(round(x), round(y)) for x, y in points]
        d.polygon(xy, fill=color)
        if outline:
            d.line(xy + [xy[0]], fill=outline, width=1)

    def line(points, color=INK, width=1):
        d.line([(round(x), round(y)) for x, y in points], fill=color, width=width)

    w, a = pose['wing'], pose['arm']
    hx, hy, jaw = pose['head_x'], pose['head_y'], pose['jaw']
    # 远翼：有骨架的蝠翼，翼膜按关节展开，轮廓不是整图旋转。
    poly([(58,77),(42,49),(25,25+w),(17,29+w),(7,62+w/2),(20,55),
          (31,59),(43,76),(51,85)], SHADE)
    poly([(47,70),(27,31+w),(20,33+w),(12,54+w/2),(22,49),
          (32,54),(42,70)], DARK_TEAL)
    line([(25,29+w),(30,52),(42,70)], ORANGE, 2)
    # 尾巴在身体后面，固定尾根与火焰基点。
    poly([(76,89),(89,97),(101,96),(108,88),(110,75),(114,73),
          (116,88),(111,101),(103,108),(91,110),(76,102)], ORANGE)
    poly([(80,98),(94,104),(105,102),(113,92),(109,103),(102,108),
          (91,110),(77,102)], SHADE, None)
    poly([(112,77),(105,69),(107,62),(110,66),(113,53),(118,59),
          (117,65),(122,63),(122,70),(117,77)], '#ee5938')
    poly([(112,75),(109,69),(114,61),(115,67),(119,66),(118,72),(115,76)], '#ffb641', None)
    poly([(113,75),(112,70),(115,67),(117,71),(115,75)], '#fff1a4', None)
    # 近翼：外缘、翼指、两块膜的明暗分区。
    poly([(63,77),(69,53),(85,20+w),(92,21+w),(109,29+w),
          (121,69+w/2),(108,60),(98,66),(84,82),(73,88)], ORANGE)
    poly([(72,73),(88,27+w),(105,33+w),(115,59+w/2),(106,53),
          (95,61),(81,77)], TEAL)
    poly([(88,27+w),(87,55),(81,77),(95,61),(106,53)], DARK_TEAL, None)
    line([(89,27+w),(88,53),(81,77)], ORANGE, 2)
    line([(89,27+w),(103,39),(114,59+w/2)], LIGHT)
    poly([(86,23+w),(88,16+w),(91,21+w)], CREAM)
    # 远手臂。
    poly([(74,67),(82,69),(89,79+a/2),(94,80+a),(96,86+a),
          (90,89+a),(83,82+a/2),(76,79)], SHADE)
    for x, y in [(91,87+a),(95,84+a)]:
        poly([(x-2,y-2),(x+2,y+2),(x+3,y-2)], CREAM)
    # 腰腹、胸口。
    poly([(54,60),(66,60),(76,67),(84,80),(86,95),(79,105),
          (64,108),(51,103),(45,92),(46,77)], ORANGE)
    poly([(75,72),(82,83),(83,96),(76,104),(63,106),(75,97),(78,85)], SHADE, None)
    poly([(55,68),(64,67),(70,74),(75,86),(75,97),(68,102),
          (58,101),(51,94),(50,83)], CREAM)
    poly([(52,83),(54,94),(61,99),(69,98),(67,103),(58,101),(51,94)], '#dcb97e', None)
    # 颈部连接胸口与可移动的头，外侧与腹侧同时重绘。
    poly([(51,80),(44,68),(hx+8,hy+17),(hx+17,hy+13),
          (hx+20,hy+24),(61,65),(67,76),(62,85)], ORANGE)
    poly([(51,80),(47,67),(hx+8,hy+23),(hx+11,hy+24),
          (54,67),(60,77),(60,82)], CREAM, None)
    line([(hx+18,hy+24),(59,63),(64,73)], LIGHT)
    # 两条腿与脚固定：轮廓、脚底及每只脚的三枚爪尖保持一致。
    poly([(77,89),(85,93),(88,104),(85,110),(94,112),(95,116),
          (75,116),(71,112),(74,102),(71,96)], ORANGE)
    poly([(83,96),(85,105),(81,111),(90,113),(77,114),(75,110)], SHADE, None)
    poly([(53,88),(61,94),(59,103),(54,110),(57,115),(53,116),
          (34,116),(33,113),(42,109),(43,98),(47,91)], ORANGE)
    poly([(47,99),(47,109),(39,113),(51,113),(55,109),(59,102),(58,96)], SHADE, None)
    for x in [34,40,47,76,83,90]:
        poly([(x+1,112),(x-1,116),(x+4,116)], CREAM)
    # 头部与上下颚，保持双角和相同的眼睛/鼻子。
    def head(points, color, outline=INK):
        poly([(hx+x, hy+y) for x,y in points], color, outline)

    head([(9,5),(8,-8),(5,-3),(3,6)], SHADE)
    head([(15,5),(21,-11),(21,1),(19,10)], ORANGE)
    head([(17,3),(20,-5),(20,1)], LIGHT, None)
    head([(0,5),(5,0),(14,1),(20,7),(19,16),(13,23),(2,22),
          (-12,20),(-17,16),(-15,11),(-7,9)], ORANGE)
    head([(0,5),(5,1),(13,2),(16,6),(8,5),(1,8),(-8,12),(-15,13),(-13,10),(-7,9)], LIGHT, None)
    # 口腔和可活动下颚，张嘴时不是仅画一条黑线。
    head([(-16,19),(-5,20),(10,18),(7,20+jaw),(-4,21+jaw),(-12,19+jaw)], '#633043')
    head([(-12,19+jaw),(-4,21+jaw),(7,20+jaw),(11,18),(12,22),
          (5,24+jaw),(-5,24+jaw),(-13,21+jaw)], ORANGE)
    if jaw > 3:
        head([(-7,20+jaw),(0,19+jaw),(5,20+jaw),(-3,22+jaw)], '#d77d7f', None)
        head([(-10,20),(-7,20),(-8,23)], CREAM)
        head([(4,18),(7,18),(5,22)], CREAM)
    head([(-1,7),(7,6),(4,11),(0,11)], '#fff8d7')
    head([(0,8),(2,8),(2,11),(0,11)], '#3c667b', None)
    line([(hx-1,hy+7),(hx+7,hy+5)], INK)
    line([(hx-12,hy+13),(hx-10,hy+13)], INK)
    head([(14,9),(17,9),(15,15),(12,17),(10,14)], SHADE, None)
    # 近侧手臂：蓄力收肘，释放时撑开，不随身体一起缩放。
    poly([(54,68),(57,74),(51,83+a/2),(44,86+a/2),(36,81+a),
          (31,82+a),(28,78+a),(32,74+a),(37,75+a),(44,79+a/2),(48,69)], ORANGE)
    line([(53,75),(48,82+a/2),(44,83+a/2),(35,78+a)], SHADE, 2)
    for x, y in [(28,78+a),(32,80+a),(36,79+a)]:
        poly([(x,y-2),(x-2,y+2),(x+2,y+1)], CREAM)
    return im, {'muzzle': [round(hx-15), round(hy+19+jaw/2)], 'feet': [[45,116],[84,116]]}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    keys, anchors = zip(*(render(p) for p in POSES))
    sheet = Image.new('RGBA', (SIZE*4, SIZE))
    for i, (name, frame) in enumerate(zip(NAMES, keys)):
        frame.save(OUT / f'{name}.png')
        sheet.paste(frame, (i*SIZE, 0))
    sheet.save(OUT / 'keyframes.png')
    # 演示有意放慢；此处时间不参与游戏 cue 或伤害结算。
    frames = []
    for left, right, count in [(0,0,9),(0,1,6),(1,1,4),(1,2,4),(2,2,7),(2,3,5),(3,0,7)]:
        for step in range(count):
            t = (step+1)/count
            t = t*t*(3-2*t)
            p = {k: POSES[left][k] + (POSES[right][k]-POSES[left][k])*t for k in POSES[left]}
            frame, _ = render(p)
            canvas = Image.new('RGBA', frame.size, '#182a31')
            canvas.alpha_composite(frame)
            frames.append(canvas.convert('RGB').resize((384,384), Image.Resampling.NEAREST))
    frames[0].save(OUT / 'motion-preview.gif', save_all=True, append_images=frames[1:], duration=80, loop=0)
    preview = Image.new('RGBA', sheet.size, '#182a31')
    preview.alpha_composite(sheet)
    preview.resize((1536,384), Image.Resampling.NEAREST).save(OUT / 'keyframes-preview.png')
    (OUT / 'study.json').write_text(json.dumps({'status':'study-only','frameSize':[SIZE,SIZE],
        'drawing':'手工轮廓坐标与部件插值；未读取、裁切或拼贴原图',
        'frames':dict(zip(NAMES,anchors)), 'gameIntegrated':False}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'已生成 {OUT}')


if __name__ == '__main__':
    main()
