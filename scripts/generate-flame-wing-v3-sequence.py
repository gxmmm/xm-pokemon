#!/usr/bin/env python3
"""生成 #006 火翼飞龙 v3 的纯代码像素序列帧候选。

这是离线资产生产脚本；它不参与浏览器渲染。输出只可经由 battle-art
manifest 与 profile 进入 Pixi，不能把 Canvas 重新接入正式路径。

v3 按审核反馈重画更宽的头颅、额角、颊部、独立下颚和口鼻；双翼固定
在身体与手臂之后，前景以独立上臂、前臂和三爪手保证手部不被翼膜遮挡。
v1/v2 会保留在工作区，不被此脚本覆盖。
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'apps' / 'web' / 'public' / 'sprites' / 'battle' / 'flame-wing-v3'
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
    cx = 61 + advance
    cy = 72 + bounce + collapse

    if glow:
        oval(draw, (cx - 29 - glow * 2, cy - 43 - glow * 2, cx + 29 + glow * 2, cy + 25 + glow * 2), '#733933', 2)
        oval(draw, (cx - 22 - glow, cy - 37 - glow, cx + 22 + glow, cy + 18 + glow), '#c74f30', 2)

    # Both wings are intentionally drawn before torso and arms. Their membrane
    # reads as a background silhouette and cannot hide the independent hands.
    far_wing = [(cx - direction * 4, cy - 24), (cx - direction * (32 + wing_open), cy - 54),
                (cx - direction * (56 + wing_open), cy - 38), (cx - direction * (47 + wing_open), cy + 6),
                (cx - direction * 17, cy + 17), (cx - direction * 3, cy + 2)]
    poly(draw, far_wing, ORANGE_SHADOW)
    far_membrane = [(cx - direction * 10, cy - 21), (cx - direction * (34 + wing_open), cy - 47),
                    (cx - direction * (48 + wing_open), cy - 35), (cx - direction * (40 + wing_open), cy + 2),
                    (cx - direction * 18, cy + 11)]
    poly(draw, far_membrane, BLUE_DARK, 2)
    stroke(draw, [(cx - direction * 11, cy - 20), (cx - direction * (39 + wing_open), cy - 26)], BLUE, 2)
    stroke(draw, [(cx - direction * 14, cy - 15), (cx - direction * (36 + wing_open), cy - 6)], BLUE, 2)

    near_wing = [(cx + direction * 6, cy - 22), (cx + direction * (35 + wing_open), cy - 51),
                 (cx + direction * (57 + wing_open), cy - 27), (cx + direction * (46 + wing_open), cy + 15),
                 (cx + direction * 18, cy + 23), (cx + direction * 5, cy + 4)]
    poly(draw, near_wing, ORANGE_LIGHT)
    near_membrane = [(cx + direction * 11, cy - 19), (cx + direction * (35 + wing_open), cy - 44),
                     (cx + direction * (49 + wing_open), cy - 25), (cx + direction * (39 + wing_open), cy + 9),
                     (cx + direction * 18, cy + 17)]
    poly(draw, near_membrane, BLUE, 2)
    stroke(draw, [(cx + direction * 13, cy - 17), (cx + direction * (42 + wing_open), cy - 21)], BLUE_LIGHT, 2)
    stroke(draw, [(cx + direction * 15, cy - 10), (cx + direction * (37 + wing_open), cy + 2)], BLUE_LIGHT, 2)

    # Heavy curved tail behind the biped body.
    tail = [(cx - direction * 19, cy + 15), (cx - direction * 36, cy + 24), (cx - direction * 54, cy + 21),
            (cx - direction * 62, cy + 8), (cx - direction * 57, cy + 1), (cx - direction * 43, cy + 11),
            (cx - direction * 27, cy + 6), (cx - direction * 10, cy + 3)]
    poly(draw, tail, ORANGE_SHADOW)
    stroke(draw, [(cx - direction * 21, cy + 13), (cx - direction * 50, cy + 14)], ORANGE_LIGHT, 3)
    flame(draw, cx - direction * 60, cy + 8, direction, (phase + glow) % 3)

    # Hind legs/body first; front arms are deliberately painted later.
    poly(draw, [(cx - 17, cy + 14), (cx - 27, cy + 41 - collapse // 2), (cx - 14, cy + 49 - collapse // 2),
                (cx - 1, cy + 39 - collapse // 2), (cx - 5, cy + 17)], ORANGE_SHADOW)
    poly(draw, [(cx + 6, cy + 14), (cx + 11, cy + 42 - collapse // 2), (cx + 25, cy + 47 - collapse // 2),
                (cx + 32, cy + 37 - collapse // 2), (cx + 20, cy + 10)], ORANGE)
    for base_x in (cx - 18, cx + 18):
        stroke(draw, [(base_x - 8, cy + 47 - collapse // 2), (base_x + 1, cy + 50 - collapse // 2)], CREAM, 2)
        stroke(draw, [(base_x, cy + 47 - collapse // 2), (base_x + 9, cy + 49 - collapse // 2)], CREAM, 2)

    oval(draw, (cx - 25, cy - 19, cx + 25, cy + 28), ORANGE)
    poly(draw, [(cx - 7, cy - 13), (cx + 8, cy - 14), (cx + 15, cy + 20), (cx + 6, cy + 29),
                (cx - 9, cy + 24), (cx - 13, cy + 2)], CREAM, 2)
    stroke(draw, [(cx - 9, cy - 2), (cx + 11, cy + 1)], CREAM_SHADOW, 2)
    stroke(draw, [(cx - 8, cy + 9), (cx + 13, cy + 12)], CREAM_SHADOW, 2)
    stroke(draw, [(cx - 5, cy + 19), (cx + 10, cy + 22)], CREAM_SHADOW, 2)
    oval(draw, (cx - 19, cy - 13, cx - 10, cy - 3), ORANGE_HIGHLIGHT, 1)

    # Wide skull, brow horns, cheek plates, a separate lower jaw and prominent
    # muzzle: these are deliberately distinct forms, rather than a single oval.
    poly(draw, [(cx - 13, cy - 13), (cx - 18, cy - 45 - head_lift), (cx - 8, cy - 63 - head_lift),
                (cx + direction * 8, cy - 68 - head_lift), (cx + direction * 24, cy - 60 - head_lift),
                (cx + direction * 32, cy - 46 - head_lift), (cx + direction * 25, cy - 31 - head_lift),
                (cx + 7, cy - 22), (cx - 2, cy - 10)], ORANGE_LIGHT)
    # broad cream throat and jaw underside
    poly(draw, [(cx - 6, cy - 21), (cx - 10, cy - 45 - head_lift), (cx + direction * 1, cy - 57 - head_lift),
                (cx + direction * 14, cy - 51 - head_lift), (cx + direction * 9, cy - 34 - head_lift),
                (cx + 3, cy - 22)], CREAM, 2)
    # brow horns
    poly(draw, [(cx - 9, cy - 58 - head_lift), (cx - 13, cy - 80 - head_lift), (cx + 2, cy - 63 - head_lift)], CREAM, 2)
    poly(draw, [(cx + direction * 12, cy - 62 - head_lift), (cx + direction * 22, cy - 80 - head_lift),
                (cx + direction * 25, cy - 58 - head_lift)], CREAM, 2)
    # cheek spike and wide muzzle
    poly(draw, [(cx + direction * 12, cy - 51 - head_lift), (cx + direction * 38, cy - 49 - head_lift),
                (cx + direction * 48, cy - 40 - head_lift), (cx + direction * 42, cy - 28 - head_lift),
                (cx + direction * 20, cy - 28 - head_lift), (cx + direction * 7, cy - 37 - head_lift)], ORANGE)
    poly(draw, [(cx + direction * 10, cy - 39 - head_lift), (cx + direction * 26, cy - 29 - head_lift),
                (cx + direction * 42, cy - 28 - head_lift), (cx + direction * 34, cy - 21 - head_lift),
                (cx + direction * 15, cy - 24 - head_lift), (cx + direction * 5, cy - 31 - head_lift)], ORANGE_SHADOW, 2)
    # angular cheek plate
    poly(draw, [(cx + direction * 6, cy - 50 - head_lift), (cx + direction * 17, cy - 54 - head_lift),
                (cx + direction * 20, cy - 40 - head_lift), (cx + direction * 9, cy - 36 - head_lift)], ORANGE_HIGHLIGHT, 2)
    eye_x = cx + direction * 12
    oval(draw, (eye_x - 3, cy - 54 - head_lift, eye_x + 3, cy - 47 - head_lift), WHITE, 2)
    rect(draw, (eye_x - 1, cy - 53 - head_lift, eye_x + 1, cy - 48 - head_lift), INK)
    if mouth_open:
        stroke(draw, [(cx + direction * 20, cy - 34 - head_lift), (cx + direction * 45, cy - 31 - head_lift)], INK, 4)
        oval(draw, (cx + direction * 30, cy - 39 - head_lift, cx + direction * 45, cy - 25 - head_lift), FIRE_YELLOW, 2)
    else:
        stroke(draw, [(cx + direction * 20, cy - 34 - head_lift), (cx + direction * 44, cy - 34 - head_lift)], INK, 3)
    rect(draw, (cx + direction * 31, cy - 44 - head_lift, cx + direction * 35, cy - 41 - head_lift), ORANGE_HIGHLIGHT)

    # Independent front arms and hands are in the foreground, after both wings.
    arm_swing = 0 if clip in ('idle', 'charge', 'channel') else advance // 2
    far_arm = [(cx - direction * 10, cy - 4), (cx - direction * 24, cy + 5 + arm_swing),
               (cx - direction * 28, cy + 24 + arm_swing), (cx - direction * 18, cy + 28 + arm_swing),
               (cx - direction * 7, cy + 12)]
    poly(draw, far_arm, ORANGE_SHADOW)
    near_arm = [(cx + direction * 13, cy - 5), (cx + direction * 29, cy + 5 + arm_swing),
                (cx + direction * 31, cy + 27 + arm_swing), (cx + direction * 20, cy + 31 + arm_swing),
                (cx + direction * 8, cy + 12)]
    poly(draw, near_arm, ORANGE_LIGHT)
    # wrist + three clearly separated claws
    oval(draw, (cx + direction * 18, cy + 22 + arm_swing, cx + direction * 33, cy + 35 + arm_swing), ORANGE, 2)
    for offset in (-6, 0, 6):
        stroke(draw, [(cx + direction * 28, cy + 30 + arm_swing), (cx + direction * (37 + offset // 2), cy + 39 + arm_swing + abs(offset) // 3)], CREAM, 3)
    # far hand retains one visible claw silhouette
    stroke(draw, [(cx - direction * 24, cy + 25 + arm_swing), (cx - direction * 34, cy + 33 + arm_swing)], CREAM, 3)
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
