#!/usr/bin/env python3
"""Rebuild lossless DJ NES head/body layers from the six approved Head Bob Lab rigs.

Run: python3 scripts/build_head_bob_assets.py
Requires Pillow and numpy. The original sprite PNGs are never modified.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
LIBRARY = ROOT / "public" / "assets" / "DJ NES Pose Library"
LAB = LIBRARY / "Head Bob lab"
FAMILIES = ("a10", "a4", "a14", "a44", "a47", "a48")
SIZE = (582, 652)


def selection_mask(rig: dict) -> np.ndarray:
    """Reproduce the editor's exact polygon test at source-pixel centers."""
    width, height = SIZE
    polygon = rig["headPolygon"]
    mask = np.zeros((height, width), dtype=bool)
    x0 = max(0, int(min(p[0] for p in polygon)) - 1)
    y0 = max(0, int(min(p[1] for p in polygon)) - 1)
    x1 = min(width - 1, int(max(p[0] for p in polygon)) + 1)
    y1 = min(height - 1, int(max(p[1] for p in polygon)) + 1)
    ys, xs = np.mgrid[y0:y1 + 1, x0:x1 + 1].astype(np.float64)
    xs += .5
    ys += .5
    selected = np.zeros_like(xs, dtype=bool)
    for a, b in zip(polygon[-1:] + polygon[:-1], polygon):
        ax, ay = a
        bx, by = b
        if ay == by:
            continue
        crossing = (ay > ys) != (by > ys)
        selected ^= crossing & (xs < (bx - ax) * (ys - ay) / (by - ay) + ax)
    mask[y0:y1 + 1, x0:x1 + 1] = selected
    for flat_index, selected_value in rig.get("maskPixelOverrides", []):
        if 0 <= flat_index < width * height:
            mask.flat[flat_index] = selected_value > 0
    return mask


def save_png(pixels: np.ndarray, path: Path) -> None:
    Image.fromarray(pixels, mode="RGBA").save(path, format="PNG", optimize=True)


def build_family(family: str) -> None:
    folder = LAB / family
    rig = json.loads((folder / "head_bob_rig.json").read_text(encoding="utf-8"))
    assert rig["family"] == family
    assert (rig["sourceCanvas"]["width"], rig["sourceCanvas"]["height"]) == SIZE
    assert len(rig["headBobFrames"]) == 4
    mask = selection_mask(rig)
    repair = np.zeros((SIZE[1], SIZE[0], 4), dtype=np.uint8)
    for flat_index, rgba in rig.get("bodyRepairPixels", []):
        if 0 <= flat_index < SIZE[0] * SIZE[1]:
            repair.reshape(-1, 4)[flat_index] = rgba
    shared_head = None
    for name in rig["variants"]:
        source = LIBRARY / name
        with Image.open(source) as img:
            assert img.size == SIZE, source
            rgba = np.asarray(img.convert("RGBA")).copy()
        if shared_head is None:
            shared_head = rgba.copy()
            shared_head[~mask] = 0
            save_png(shared_head, folder / (family + "_head_shared.png"))
        body = rgba.copy()
        body[mask] = repair[mask]
        save_png(body, folder / (name[:-4] + "_body.png"))
    print(f"{family}: shared head + {len(rig['variants'])} body layers generated")


if __name__ == "__main__":
    for family in FAMILIES:
        build_family(family)
