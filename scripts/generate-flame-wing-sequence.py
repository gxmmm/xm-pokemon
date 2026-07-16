#!/usr/bin/env python3
"""生成 #006 火翼飞龙的代码原创像素序列帧资产。

该脚本是离线资产生产工具，不参与浏览器或战斗运行时。它输出的 PNG 和
JSON 只能通过 BattleAssetManifestEntry 引用；不得将 Canvas 重新接入正式路径。
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'apps' / 'web' / 'public' / 'sprites' / 'battle' / 'flame-wing'
FRAME = 64
SCALE = 4
SHEET_COLUMNS = 8
FPS = 12
CLIPS: dict[str, tuple[int, bool]] = {
    'idle': (4, True),
    'attack': (5, False),
    'cast': (4, False),
    'charge': (4, True),
    'channel': (4, True),
    'hit': (3, False),
    'faint': (5, False),
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

OUTLINE = '#351b26'
ORANGE_DARK = '#a53f2c'
ORANGE = '#e26d35'
ORANGE_LIGHT = '#ff9e4b'
CREAM = '#f7d692'
CREAM_SHADOW = '#d69c65'
BLUE_DARK = '#315b83'
BLUE = '#5d9cd2'
EMBER = '#ffcf56'
FIRE = '#ff6b35'
WHITE = '#fff3d0'


def polygon(draw: ImageDraw.ImageDraw, points: Iterable[tuple[int, int]], fill: str, width: int = 1) -> None:
    points = list(points)
    draw.polygon(points, fill=fill)
    draw.line(points + [points[0]], fill=OUTLINE, width=width, joint='curve')


def ellipse(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], fill: str, width: int = 1) -> None:
    x0, y0, x1, y1 = box
    draw.ellipse((min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)), fill=fill, outline=OUTLINE, width=width)


def line(draw: ImageDraw.ImageDraw, points: Iterable[tuple[int, int]], fill: str, width: int = 1) -> None:
    draw.line(list(points), fill=fill, width=width, joint='curve')


def flame(draw: ImageDraw.ImageDraw, x: int, y: int, flicker: int, facing: str) -> None:
    direction = 1 if facing == 'front' else -1
    polygon(draw, [(x, y), (x + direction * (6 + flicker), y - 3), (x + direction * (8 + flicker), y - 9), (x + direction * 2, y - 6), (x + direction * (1 + flicker), y - 13), (x - direction * 3, y - 6)], FIRE)
    polygon(draw, [(x + direction, y - 2), (x + direction * (5 + flicker), y - 5), (x + direction * (4 + flicker), y - 9), (x, y - 6)], EMBER)


def dragon_frame(facing: str, clip: str, phase: int, count: int) -> Image.Image:
    image = Image.new('RGBA', (FRAME, FRAME), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    t = 0 if count <= 1 else phase / (count - 1)
    bob = 0
    lean = 0
    wing = 0
    mouth_open = False
    glow = 0
    recoil = 0
    collapse = 0
    if clip == 'idle':
        bob = [0, -1, 0, 1][phase % 4]
        wing = [0, 1, 0, -1][phase % 4]
    elif clip == 'attack':
        lean = int([0, 2, 6, 4, 0][phase])
        bob = int([0, -1, -2, 0, 1][phase])
        wing = int([0, -1, -3, -2, 0][phase])
        mouth_open = phase in (2, 3)
    elif clip == 'cast':
        lean = int([0, 1, 2, 0][phase])
        bob = int([0, -2, -3, -1][phase])
        wing = int([0, 1, 2, 1][phase])
        mouth_open = phase >= 2
        glow = phase
    elif clip == 'charge':
        bob = [0, -1, -2, -1][phase]
        wing = [0, 1, 2, 1][phase]
        glow = phase + 1
    elif clip == 'channel':
        bob = [-1, -2, -1, 0][phase]
        wing = [1, 2, 1, 0][phase]
        mouth_open = True
        glow = 3
    elif clip == 'hit':
        recoil = [0, -4, -1][phase]
        wing = [0, 2, 1][phase]
    elif clip == 'faint':
        collapse = int([0, 2, 5, 9, 13][phase])
        recoil = int([0, -1, -2, -3, -4][phase])
        wing = int([0, 1, 2, 3, 4][phase])

    direction = 1 if facing == 'front' else -1
    cx = 31 + lean + recoil
    cy = 31 + bob + collapse

    # Ember aura is part of the authored character asset, distinct from generic GPU aura layers.
    if glow:
        aura = 6 + glow * 2
        ellipse(draw, (cx - aura, cy - aura - 3, cx + aura, cy + aura - 3), '#7a392e', 1)
        ellipse(draw, (cx - aura + 2, cy - aura + 2 - 3, cx + aura - 2, cy + aura - 2 - 3), '#d85a32', 1)

    # Far wing, tail and flame: draw behind body for readable layered silhouette.
    far_wing = [(cx - direction * 4, cy - 6), (cx - direction * (18 + wing), cy - 19), (cx - direction * (23 + wing), cy - 7), (cx - direction * (14 + wing), cy + 7), (cx - direction * 3, cy + 8)]
    polygon(draw, far_wing, ORANGE_DARK)
    inner_far = [(cx - direction * 6, cy - 6), (cx - direction * (17 + wing), cy - 16), (cx - direction * (19 + wing), cy - 7), (cx - direction * (12 + wing), cy + 4)]
    polygon(draw, inner_far, BLUE_DARK)
    line(draw, [(cx - direction * 6, cy - 5), (cx - direction * (15 + wing), cy - 8)], BLUE, 1)

    tail_points = [(cx - direction * 8, cy + 9), (cx - direction * 18, cy + 11), (cx - direction * 24, cy + 18), (cx - direction * 20, cy + 21), (cx - direction * 11, cy + 15), (cx - direction * 2, cy + 12)]
    polygon(draw, tail_points, ORANGE_DARK)
    flame(draw, cx - direction * 22, cy + 19, (phase + glow) % 3, facing)

    # Legs/body/belly.
    polygon(draw, [(cx - 10, cy + 6), (cx - 13, cy + 17 - collapse // 2), (cx - 5, cy + 19 - collapse // 2), (cx - 1, cy + 11), (cx + 6, cy + 18 - collapse // 2), (cx + 13, cy + 16 - collapse // 2), (cx + 10, cy + 5)], ORANGE)
    polygon(draw, [(cx - 10, cy - 3), (cx - 6, cy - 13), (cx + 5, cy - 15), (cx + 12, cy - 7), (cx + 10, cy + 9), (cx + 4, cy + 13), (cx - 7, cy + 11), (cx - 12, cy + 4)], ORANGE)
    polygon(draw, [(cx - 4, cy - 8), (cx + 4, cy - 10), (cx + 7, cy + 8), (cx + 2, cy + 11), (cx - 4, cy + 8)], CREAM)
    line(draw, [(cx - 3, cy - 1), (cx + 6, cy)], CREAM_SHADOW, 1)
    line(draw, [(cx - 3, cy + 4), (cx + 6, cy + 5)], CREAM_SHADOW, 1)

    # Near wing sits in front of the torso.
    near_wing = [(cx + direction * 2, cy - 5), (cx + direction * (16 + wing), cy - 21), (cx + direction * (25 + wing), cy - 11), (cx + direction * (18 + wing), cy + 10), (cx + direction * 7, cy + 8)]
    polygon(draw, near_wing, ORANGE_LIGHT)
    inner_near = [(cx + direction * 4, cy - 5), (cx + direction * (15 + wing), cy - 18), (cx + direction * (21 + wing), cy - 10), (cx + direction * (15 + wing), cy + 7), (cx + direction * 7, cy + 6)]
    polygon(draw, inner_near, BLUE)
    line(draw, [(cx + direction * 6, cy - 4), (cx + direction * (18 + wing), cy - 9)], WHITE, 1)

    # Neck and head.
    polygon(draw, [(cx - 4, cy - 12), (cx - 5, cy - 25), (cx + direction * 4, cy - 31), (cx + direction * 12, cy - 27), (cx + direction * 10, cy - 17), (cx + 5, cy - 11)], ORANGE_LIGHT)
    polygon(draw, [(cx - 2, cy - 21), (cx + direction * 4, cy - 27), (cx + direction * 9, cy - 24), (cx + direction * 5, cy - 19)], CREAM)
    # horns
    polygon(draw, [(cx + direction * 1, cy - 28), (cx + direction * 2, cy - 35), (cx + direction * 5, cy - 29)], CREAM)
    polygon(draw, [(cx + direction * 7, cy - 27), (cx + direction * 10, cy - 33), (cx + direction * 11, cy - 25)], CREAM)
    # eye/muzzle
    eye_x = cx + direction * 7
    ellipse(draw, (eye_x - 1, cy - 26, eye_x + 1, cy - 24), WHITE)
    draw.point((eye_x, cy - 25), fill=OUTLINE)
    if mouth_open:
        line(draw, [(cx + direction * 7, cy - 20), (cx + direction * 13, cy - 18)], OUTLINE, 2)
        if glow:
            ellipse(draw, (cx + direction * 11, cy - 21, cx + direction * 16, cy - 16), EMBER)
    else:
        line(draw, [(cx + direction * 7, cy - 19), (cx + direction * 12, cy - 19)], OUTLINE, 1)

    # Pixel highlights.
    draw.rectangle((cx - 7, cy - 8, cx - 5, cy - 6), fill=ORANGE_LIGHT)
    draw.rectangle((cx + direction * 9 - 1, cy - 23, cx + direction * 9 + 1, cy - 22), fill=WHITE)
    return image.resize((FRAME * SCALE, FRAME * SCALE), Image.Resampling.NEAREST)


def make_sheet(facing: str) -> tuple[Image.Image, dict[str, object]]:
    frames: list[Image.Image] = []
    metadata_clips: dict[str, dict[str, object]] = {}
    cursor = 0
    for clip, (count, loop) in CLIPS.items():
        metadata_clips[clip] = {'frames': list(range(cursor, cursor + count)), 'loop': loop}
        frames.extend(dragon_frame(facing, clip, phase, count) for phase in range(count))
        cursor += count
    rows = (len(frames) + SHEET_COLUMNS - 1) // SHEET_COLUMNS
    sheet = Image.new('RGBA', (SHEET_COLUMNS * FRAME * SCALE, rows * FRAME * SCALE), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        x = (index % SHEET_COLUMNS) * FRAME * SCALE
        y = (index // SHEET_COLUMNS) * FRAME * SCALE
        sheet.alpha_composite(frame, (x, y))
    metadata = {
        'schemaVersion': 1,
        'frameWidth': FRAME * SCALE,
        'frameHeight': FRAME * SCALE,
        'columns': SHEET_COLUMNS,
        'fps': FPS,
        'clips': metadata_clips,
        'transitions': TRANSITIONS,
    }
    return sheet, metadata


def write_asset(facing: str) -> tuple[Path, Path, str]:
    sheet, metadata = make_sheet(facing)
    image_path = OUTPUT / f'{facing}-sheet.png'
    metadata_path = OUTPUT / f'{facing}-sheet.json'
    sheet.save(image_path, optimize=True)
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    digest = hashlib.sha256(image_path.read_bytes()).hexdigest()
    return image_path, metadata_path, digest


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for facing in ('front', 'back'):
        image_path, metadata_path, digest = write_asset(facing)
        print(f'{image_path.relative_to(ROOT)} sha256={digest}')
        print(f'{metadata_path.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
