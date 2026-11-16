#!/usr/bin/env python3
"""Conservative pixel-art neck underpaint for PocketDJ head-bob rigs.

Uses only Pillow/numpy; leaves source/head/animation data intact. Detects source-
opaque pixels uncovered by the moving head at nod endpoints and intermediate
positions, paints a narrow guard band with sampled hoodie-color source pixels.
"""
from __future__ import annotations

import math
import numpy as np
from PIL import Image

def head_at(rgba: np.ndarray, pivot: dict, frame: dict, fraction: float = 1) -> np.ndarray:
    h, w = rgba.shape[:2]
    angle = math.radians(frame["tilt"] * fraction)
    cs, sn = math.cos(angle), math.sin(angle)
    dx, dy = frame["x"] * fraction, frame["y"] * fraction
    px, py = pivot["x"], pivot["y"]
    matrix = (
        cs, sn, px - cs * (px + dx) - sn * (py + dy),
        -sn, cs, py + sn * (px + dx) - cs * (py + dy),
    )
    return np.asarray(Image.fromarray(rgba, "RGBA").transform(
        (w, h), Image.Transform.AFFINE, matrix, resample=Image.Resampling.NEAREST))

def hoodie_donors(rgba: np.ndarray, mask: np.ndarray) -> np.ndarray:
    h, w = mask.shape
    yy, xx = np.mgrid[:h, :w]
    rgb = rgba[:, :, :3].astype(np.int16)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    # Source hoodie is muted olive/charcoal. Exclude most warm face/hand tones.
    return ((~mask) & (rgba[:, :, 3] >= 200) &
            (yy >= 185) & (yy <= 285) & (xx >= 175) & (xx <= 405) &
            (r <= 140) & (g <= 145) &
            (g * 100 >= r * 76) & (g * 100 >= b * 79) &
            (abs(r - g) <= 42))

def repair_under_head(source: np.ndarray, head: np.ndarray, body: np.ndarray,
                      mask: np.ndarray, rig: dict) -> tuple[np.ndarray, dict]:
    h, w = mask.shape
    yy, xx = np.mgrid[:h, :w]
    region = (mask & (source[:, :, 3] >= 128) & (yy >= 176) &
              (yy <= 255) & (xx >= 205) & (xx <= 390))
    missing = np.zeros_like(mask)
    positions = [f for f in rig["headBobFrames"] if f["enabled"]]
    motion = []
    for frame in positions:
        if frame["x"] == frame["y"] == frame["tilt"] == 0:
            continue
        motion.extend((frame, t) for t in (i / 10 for i in range(1, 11)))
    # The live groove also moves directly between non-base nod positions.
    for a in positions[1:]:
        for b in positions[1:]:
            if a is b:
                continue
            for t in (i / 10 for i in range(1, 10)):
                between = {k: a[k] * (1-t) + b[k] * t for k in ("x", "y", "tilt")}
                motion.append((between, 1.0))
    for frame, t in motion:
        moved = head_at(head, rig["rotationPivot"], frame, t)
        missing |= region & (moved[:, :, 3] < 16) & (body[:, :, 3] < 16)
    # Two source pixels of interior coverage prevent rotational raster gaps.
    needed = missing.copy()
    for _ in range(2):
        grown = needed.copy()
        for ox, oy in ((-1,0), (1,0), (0,-1), (0,1)):
            ys = slice(max(0, oy), h + min(0, oy))
            xs = slice(max(0, ox), w + min(0, ox))
            src_ys = slice(max(0, -oy), h - max(0, oy))
            src_xs = slice(max(0, -ox), w - max(0, ox))
            grown[ys, xs] |= needed[src_ys, src_xs]
        needed = grown & region
    needed &= body[:, :, 3] < 16
    donors_y, donors_x = np.nonzero(hoodie_donors(source, mask))
    out = body.copy()
    if len(donors_x) == 0:
        return out, {"exposedBefore": int(missing.sum()), "underpainted": 0,
                     "exposedAfter": int(missing.sum()), "warning": "No suitable hoodie pixels"}
    for y, x in zip(*np.nonzero(needed)):
        dx = donors_x.astype(np.int32) - int(x)
        dy = donors_y.astype(np.int32) - int(y)
        distance = dx*dx + dy*dy*2 + np.maximum(0, int(y)-donors_y)*4
        index = int(np.argmin(distance))
        out[y, x] = source[donors_y[index], donors_x[index]]
    still_missing = missing & (out[:, :, 3] < 16)
    return out, {
        "exposedBefore": int(missing.sum()),
        "underpainted": int(needed.sum()),
        "exposedAfter": int(still_missing.sum()),
    }
