#!/usr/bin/env python3
"""生成 #006 火翼飞龙 v2 的纯代码像素序列帧候选。

这是离线资产生产脚本；它不参与浏览器渲染。输出只可经由 battle-art
manifest 与 profile 进入 Pixi，不能把 Canvas 重新接入正式路径。

v2 以更明确的火龙识别轮廓为目标：大头长颈、双角、突出口鼻、腹甲、
双翼、双足、粗尾和尾焰。v1 会保留在工作区，不被此脚本覆盖。
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'apps' / 'web' / 'public' / 'sprites' / 'battle' / 'flame-wing-v2'
FRAME = 128
SCALE = 2
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

INK = '#261a24'
ORANGE_SHADOW = '#9f3e2d'
ORANGE = '#dc6a35'
ORANGE_LIGHT = '#f39245'
ORANGE_HIGHLIGHT = '#ffbd62'
CREAM_SHADOW = '#d69862'
CREAM = '#f4d291'
BLUE_DARK = '#234c72'
BLUE = '#4f91c8'
BLUE_LIGHT = '#79b9e4'
FIRE_RED = '#ed5134'
FIRE_ORANGE = '#ff8a35'
FIRE_YELLOW = '#ffd45d'
WHITE = '#fff7dc'


def poly(draw: ImageDraw.ImageDraw, points: Iterable[tuple[int, int]], fill: str, width: int = 3) -> None:
    pts = list(points)
    draw.polygon(pts, fill=fill)
    draw.line(pts + [pts[0]], fill=INK, width=width, joint='curve')


def oval(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], fill: str, width: int = 3) -> None:
    x0, y0, x1, y1 = box
    draw.ellipse((min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)), fill=fill, outline=INK, width=width)


def stroke(draw: ImageDraw.ImageDraw, points: Iterable[tuple[int, int]], fill: str, width: int = 3) -> None:
    draw.line(list(points), fill=fill, width=width, joint='curve')


def rect(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], fill: str) -> None:
    x0, y0, x1, y1 = box
    draw.rectangle((min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)), fill=fill)


def flame(draw: ImageDraw.ImageDraw, x: int, y: int, direction: int, flicker: int) -> None:
    poly(draw, [(x, y), (x - direction * (17 + flicker), y - 6), (x - direction * (20 + flicker), y - 22),
                (x - direction * 8, y - 14), (x - direction * (7 + flicker), y - 34), (x + direction * 4, y - 17),
                (x + direction * 9, y - 5)], FIRE_RED)
    poly(draw, [(x - direction * 2, y - 5), (x - direction * (13 + flicker), y - 10), (x - direction * (12 + flicker), y - 23),
                (x - direction * 3, y - 14), (x + direction * 4, y - 7)], FIRE_ORANGE, 2)
    poly(draw, [(x - direction * 3, y - 8), (x - direction * (8 + flicker), y - 13), (x - direction * 7, y - 20),
                (x + direction * 1, y - 11)], FIRE_YELLOW, 2)


def pose(clip: str, phase: int) -> tuple[int, int, int, int, bool, int, int]:
    # horizontal advance, vertical bounce, wing opening, head lift, mouth, glow, collapse
    if clip == 'idle':
        return (0, [0, -2, 0, 1][phase], [0, 2, 0, -1][phase], 0, False, 0, 0)
    if clip == 'attack':
        return ([0, 5, 14, 8, 0][phase], [0, -1, -3, -1, 0][phase], [0, -3, -6, -4, 0][phase], 0, phase in (2, 3), 0, 0)
    if clip == 'cast':
        return ([0, 1, 3, 0][phase], [0, -3, -5, -2][phase], [0, 2, 5, 2][phase], [0, -2, -4, -1][phase], phase >= 2, phase, 0)
    if clip == 'charge':
        return (0, [0, -2, -4, -2][phase], [1, 4, 6, 4][phase], [-1, -3, -4, -2][phase], False, phase + 1, 0)
    if clip == 'channel':
        return (0, [-2, -4, -2, 0][phase], [4, 7, 5, 3][phase], [-3, -5, -3, -1][phase], True, 4, 0)
    if clip == 'hit':
        return ([0, -10, -3][phase], [0, 3, 1][phase], [0, 5, 2][phase], [0, 4, 1][phase], False, 0, 0)
    return ([0, -1, -3, -5, -7][phase], [0, 4, 11, 21, 31][phase], [0, 3, 6, 9, 12][phase], [0, 2, 5, 7, 9][phase], False, 0, [0, 2, 5, 10, 17][phase])


def dragon_frame(facing: str, clip: str, phase: int, count: int) -> Image.Image:
    image = Image.new('RGBA', (FRAME, FRAME), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    advance, bounce, wing_open, head_lift, mouth_open, glow, collapse = pose(clip, phase)
    direction = 1 if facing == 'front' else -1
    cx = 62 + advance
    cy = 72 + bounce + collapse

    # A restrained authored glow only for charge/channel; generic aura remains renderer-owned.
    if glow:
        oval(draw, (cx - 31 - glow * 2, cy - 47 - glow * 2, cx + 31 + glow * 2, cy + 26 + glow * 2), '#743b35', 2)
        oval(draw, (cx - 25 - glow, cy - 40 - glow, cx + 25 + glow, cy + 20 + glow), '#c95532', 2)

    # Rear wing: large blue membrane gives an immediate dragon silhouette.
    rear_wing = [(cx - direction * 5, cy - 31), (cx - direction * (34 + wing_open), cy - 54),
                 (cx - direction * (52 + wing_open), cy - 39), (cx - direction * (43 + wing_open), cy - 3),
                 (cx - direction * 15, cy + 12), (cx - direction * 4, cy - 4)]
    poly(draw, rear_wing, ORANGE_SHADOW)
    rear_membrane = [(cx - direction * 10, cy - 28), (cx - direction * (34 + wing_open), cy - 47),
                     (cx - direction * (44 + wing_open), cy - 36), (cx - direction * (37 + wing_open), cy - 8),
                     (cx - direction * 16, cy + 6)]
    poly(draw, rear_membrane, BLUE_DARK, 2)
    stroke(draw, [(cx - direction * 11, cy - 27), (cx - direction * (35 + wing_open), cy - 28)], BLUE, 2)
    stroke(draw, [(cx - direction * 14, cy - 23), (cx - direction * (31 + wing_open), cy - 11)], BLUE, 2)

    # Tail curls from the rear of the heavy body, ending in a large multi-colour flame.
    tail = [(cx - direction * 18, cy + 17), (cx - direction * 36, cy + 25), (cx - direction * 51, cy + 19),
            (cx - direction * 57, cy + 9), (cx - direction * 50, cy + 4), (cx - direction * 38, cy + 12),
            (cx - direction * 25, cy + 6), (cx - direction * 11, cy + 4)]
    poly(draw, tail, ORANGE_SHADOW)
    stroke(draw, [(cx - direction * 21, cy + 14), (cx - direction * 45, cy + 15)], ORANGE_LIGHT, 3)
    flame(draw, cx - direction * 55, cy + 9, direction, (phase + glow) % 3)

    # Two strong legs and three claws make the creature read as a biped rather than a bird.
    poly(draw, [(cx - 17, cy + 15), (cx - 25, cy + 39 - collapse // 2), (cx - 14, cy + 46 - collapse // 2),
                (cx - 4, cy + 38 - collapse // 2), (cx - 6, cy + 18)], ORANGE_SHADOW)
    poly(draw, [(cx + 5, cy + 16), (cx + 9, cy + 41 - collapse // 2), (cx + 23, cy + 45 - collapse // 2),
                (cx + 29, cy + 37 - collapse // 2), (cx + 19, cy + 12)], ORANGE)
    for base_x in (cx - 17, cx + 16):
        stroke(draw, [(base_x - 7, cy + 45 - collapse // 2), (base_x + 1, cy + 48 - collapse // 2)], CREAM, 2)
        stroke(draw, [(base_x, cy + 45 - collapse // 2), (base_x + 9, cy + 47 - collapse // 2)], CREAM, 2)

    # Torso / cream belly plates.
    oval(draw, (cx - 25, cy - 20, cx + 25, cy + 27), ORANGE)
    poly(draw, [(cx - 7, cy - 14), (cx + 7, cy - 15), (cx + 15, cy + 20), (cx + 6, cy + 28),
                (cx - 8, cy + 23), (cx - 13, cy + 3)], CREAM, 2)
    stroke(draw, [(cx - 9, cy - 2), (cx + 11, cy + 1)], CREAM_SHADOW, 2)
    stroke(draw, [(cx - 8, cy + 9), (cx + 13, cy + 12)], CREAM_SHADOW, 2)
    stroke(draw, [(cx - 5, cy + 19), (cx + 10, cy + 22)], CREAM_SHADOW, 2)
    oval(draw, (cx - 19, cy - 13, cx - 10, cy - 3), ORANGE_HIGHLIGHT, 1)

    # Front wing overlaps body, with three membrane fingers for recognisability.
    front_wing = [(cx + direction * 6, cy - 25), (cx + direction * (32 + wing_open), cy - 50),
                  (cx + direction * (51 + wing_open), cy - 29), (cx + direction * (42 + wing_open), cy + 10),
                  (cx + direction * 16, cy + 19), (cx + direction * 4, cy + 3)]
    poly(draw, front_wing, ORANGE_LIGHT)
    front_membrane = [(cx + direction * 10, cy - 22), (cx + direction * (32 + wing_open), cy - 43),
                      (cx + direction * (43 + wing_open), cy - 27), (cx + direction * (35 + wing_open), cy + 5),
                      (cx + direction * 15, cy + 13)]
    poly(draw, front_membrane, BLUE, 2)
    stroke(draw, [(cx + direction * 12, cy - 20), (cx + direction * (35 + wing_open), cy - 25)], BLUE_LIGHT, 2)
    stroke(draw, [(cx + direction * 13, cy - 15), (cx + direction * (32 + wing_open), cy - 5)], BLUE_LIGHT, 2)

    # Long neck and head with horns, eye and an obvious forward muzzle.
    poly(draw, [(cx - 13, cy - 14), (cx - 16, cy - 46 - head_lift), (cx - 5, cy - 61 - head_lift),
                (cx + direction * 13, cy - 60 - head_lift), (cx + direction * 26, cy - 50 - head_lift),
                (cx + direction * 29, cy - 35 - head_lift), (cx + 8, cy - 23), (cx + 1, cy - 11)], ORANGE_LIGHT)
    # cream throat
    poly(draw, [(cx - 6, cy - 22), (cx - 8, cy - 46 - head_lift), (cx + direction * 2, cy - 54 - head_lift),
                (cx + direction * 11, cy - 47 - head_lift), (cx + 4, cy - 24)], CREAM, 2)
    # two horn silhouettes
    poly(draw, [(cx - 6, cy - 56 - head_lift), (cx - 9, cy - 76 - head_lift), (cx + 3, cy - 61 - head_lift)], CREAM, 2)
    poly(draw, [(cx + direction * 12, cy - 57 - head_lift), (cx + direction * 20, cy - 74 - head_lift),
                (cx + direction * 23, cy - 54 - head_lift)], CREAM, 2)
    # pronounced snout / open mouth / fire core
    snout = [(cx + direction * 12, cy - 48 - head_lift), (cx + direction * 38, cy - 44 - head_lift),
             (cx + direction * 42, cy - 34 - head_lift), (cx + direction * 25, cy - 28 - head_lift),
             (cx + direction * 9, cy - 35 - head_lift)]
    poly(draw, snout, ORANGE)
    eye_x = cx + direction * 13
    oval(draw, (eye_x - 3, cy - 50 - head_lift, eye_x + 3, cy - 44 - head_lift), WHITE, 2)
    rect(draw, (eye_x - 1, cy - 49 - head_lift, eye_x + 1, cy - 45 - head_lift), INK)
    if mouth_open:
        stroke(draw, [(cx + direction * 20, cy - 34 - head_lift), (cx + direction * 42, cy - 31 - head_lift)], INK, 4)
        oval(draw, (cx + direction * 29, cy - 38 - head_lift, cx + direction * 43, cy - 25 - head_lift), FIRE_YELLOW, 2)
    else:
        stroke(draw, [(cx + direction * 20, cy - 34 - head_lift), (cx + direction * 40, cy - 34 - head_lift)], INK, 3)
    rect(draw, (cx + direction * 27, cy - 43 - head_lift, cx + direction * 31, cy - 41 - head_lift), ORANGE_HIGHLIGHT)
    return image.resize((FRAME * SCALE, FRAME * SCALE), Image.Resampling.NEAREST)


def make_sheet(facing: str) -> tuple[Image.Image, dict[str, object]]:
    frames: list[Image.Image] = []
    clip_data: dict[str, dict[str, object]] = {}
    cursor = 0
    for clip, (count, loop) in CLIPS.items():
        clip_data[clip] = {'frames': list(range(cursor, cursor + count)), 'loop': loop}
        frames.extend(dragon_frame(facing, clip, phase, count) for phase in range(count))
        cursor += count
    rows = (len(frames) + SHEET_COLUMNS - 1) // SHEET_COLUMNS
    sheet = Image.new('RGBA', (SHEET_COLUMNS * FRAME * SCALE, rows * FRAME * SCALE), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, ((index % SHEET_COLUMNS) * FRAME * SCALE, (index // SHEET_COLUMNS) * FRAME * SCALE))
    return sheet, {
        'schemaVersion': 1, 'frameWidth': FRAME * SCALE, 'frameHeight': FRAME * SCALE,
        'columns': SHEET_COLUMNS, 'fps': FPS, 'clips': clip_data, 'transitions': TRANSITIONS,
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
