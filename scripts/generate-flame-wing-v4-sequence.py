#!/usr/bin/env python3
"""从项目已下载的 PokeAPI #006 静态 sprite 生成无损序列帧封装。

该脚本不重绘、修饰、缩放或覆盖原图；每个输出帧都是对应现有前/后视
sprite 的逐像素副本。战斗中的待机、攻击、施法、蓄力、受击和倒下运动
仍由通用 BattleArtProfile motion pose 与 Pixi 补间负责。

输出只能经由 battle-art manifest 与 profile 进入 Pixi；不能把 Canvas
重新接入正式路径。v1/v2/v3 候选保持不变。
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'apps' / 'web' / 'public' / 'sprites' / 'battle' / 'flame-wing-v4'
SOURCES = {
    'front': ROOT / 'apps' / 'web' / 'public' / 'sprites' / 'pokemon' / '6.png',
    'back': ROOT / 'apps' / 'web' / 'public' / 'sprites' / 'pokemon' / 'back' / '6.png',
}
SHEET_COLUMNS = 8
FPS = 12
CLIPS: dict[str, tuple[int, bool]] = {
    'idle': (4, True), 'attack': (5, False), 'cast': (4, False),
    'charge': (4, True), 'channel': (4, True), 'hit': (3, False), 'faint': (5, False),
}
TRANSITIONS = [
    {'from': 'idle', 'to': 'attack', 'durationMs': 120, 'easing': 'cubic-in-out'},
    {'from': 'attack', 'to': 'idle', 'durationMs': 160, 'easing': 'cubic-in-out'},
    {'from': 'idle', 'to': 'cast', 'durationMs': 140, 'easing': 'cubic-in-out'},
    {'from': 'cast', 'to': 'idle', 'durationMs': 160, 'easing': 'cubic-in-out'},
    {'from': 'idle', 'to': 'charge', 'durationMs': 180, 'easing': 'cubic-in-out'},
    {'from': 'charge', 'to': 'channel', 'durationMs': 120, 'easing': 'cubic-in-out'},
    {'from': 'channel', 'to': 'idle', 'durationMs': 180, 'easing': 'cubic-in-out'},
    {'from': 'idle', 'to': 'hit', 'durationMs': 70, 'easing': 'cubic-in-out'},
    {'from': 'hit', 'to': 'idle', 'durationMs': 140, 'easing': 'cubic-in-out'},
]


def make_sheet(facing: str) -> tuple[Image.Image, dict[str, object]]:
    source = Image.open(SOURCES[facing]).convert('RGBA')
    width, height = source.size
    cursor = 0
    clips: dict[str, dict[str, object]] = {}
    frames: list[Image.Image] = []
    for clip, (count, loop) in CLIPS.items():
        clips[clip] = {'frames': list(range(cursor, cursor + count)), 'loop': loop}
        # copy() makes the identity guarantee explicit: no transform, no paint,
        # no interpolation and no modification to the upstream sprite pixels.
        frames.extend(source.copy() for _ in range(count))
        cursor += count
    rows = (len(frames) + SHEET_COLUMNS - 1) // SHEET_COLUMNS
    sheet = Image.new('RGBA', (SHEET_COLUMNS * width, rows * height), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, ((index % SHEET_COLUMNS) * width, (index // SHEET_COLUMNS) * height))
    return sheet, {
        'schemaVersion': 1,
        'frameWidth': width,
        'frameHeight': height,
        'columns': SHEET_COLUMNS,
        'fps': FPS,
        'clips': clips,
        'transitions': TRANSITIONS,
    }


def write_asset(facing: str) -> tuple[Path, Path, str]:
    sheet, metadata = make_sheet(facing)
    png = OUTPUT / f'{facing}-sheet.png'
    meta = OUTPUT / f'{facing}-sheet.json'
    sheet.save(png, optimize=True)
    meta.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return png, meta, hashlib.sha256(png.read_bytes()).hexdigest()


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for facing in ('front', 'back'):
        png, meta, digest = write_asset(facing)
        print(f'{png.relative_to(ROOT)} sha256={digest}')
        print(meta.relative_to(ROOT))


if __name__ == '__main__':
    main()
