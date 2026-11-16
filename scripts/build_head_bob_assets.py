#!/usr/bin/env python3
"""Rebuild lossless DJ NES head/body layers from approved scratch and vibe rigs.

Run: python3 scripts/build_head_bob_assets.py
Requires Pillow and numpy. The original sprite PNGs are never modified.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image
from head_gap_repair import repair_under_head

ROOT = Path(__file__).resolve().parents[1]
LIBRARY = ROOT / "public" / "assets" / "DJ NES Pose Library"
LAB = LIBRARY / "Head Bob lab"
SCRATCH_FAMILIES = ("a10", "a4", "a14", "a44", "a47", "a48")
VIBE_FAMILIES = ("i10", "i11", "i12", "a36", "a37", "a38")
FAMILIES = SCRATCH_FAMILIES + VIBE_FAMILIES
VIBE_MANIFEST = LAB / "vibe_rigs.json"
SIZE = (582, 652)
MANUAL_REPAIR_ROOT = LAB / 'manual_repairs'


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


def vibe_rig(family: str) -> dict:
    """Expand the exact approved single-pose calibration into the standard rig schema."""
    manifest = json.loads(VIBE_MANIFEST.read_text(encoding="utf-8"))
    calibration = manifest["poses"][family]
    repair = []
    for first, last in calibration.get("bodyRepairRuns", []):
        assert 0 <= first <= last < SIZE[0] * SIZE[1]
        color = calibration["bodyRepairColor"]
        repair.extend([[pixel, color] for pixel in range(first, last + 1)])
    return {
        "family": family,
        "variants": [family + ".png"],
        "sourceCanvas": {"width": SIZE[0], "height": SIZE[1]},
        "poseCategory": "vibe",
        "runtimeRole": calibration["runtimeRole"],
        "headPolygon": calibration.get("headPolygon", manifest["sharedHeadPolygon"]),
        "maskPixelOverrides": [],
        "bodyRepairPixels": repair,
        "rotationPivot": manifest["rotationPivot"],
        "headBobFrames": manifest["headBobFrames"],
        "preview": {"bpm": 96, "rate": 1, "scratchSpeedMs": 380},
        "includesSourceImages": False,
        "schemaVersion": 1,
        "assetType": "pocketdj-head-bob-rig",
        "notes": "Calibrated from the user's Head Rig Studio v2 export. Base head and body align in the original 582x652 coordinates."
    }


def apply_manual_repairs(body: np.ndarray, family: str, variant: str) -> np.ndarray:
    """Optional user-painted per-variant corrections exported by Head Gap Repair Studio."""
    file = MANUAL_REPAIR_ROOT / (family + ".json")
    if not file.is_file():
        return body
    doc = json.loads(file.read_text(encoding="utf-8"))
    assert doc["schema"] == "pocketdj-head-gap-manual-repair.v1"
    assert doc["family"] == family
    if variant not in doc.get("variants", {}):
        return body
    out = body.copy()
    for index, rgba in doc["variants"][variant]:
        if 0 <= index < SIZE[0] * SIZE[1] and len(rgba) == 4:
            out.reshape(-1, 4)[index] = rgba
    return out


def build_family(family: str) -> dict:
    folder = LAB / family
    if family in VIBE_FAMILIES:
        folder.mkdir(parents=True, exist_ok=True)
        rig = vibe_rig(family)
        (folder / "head_bob_rig.json").write_text(
            json.dumps(rig, indent=2) + "\n", encoding="utf-8")
    else:
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
    audit = {'family': family, 'poseCategory': 'vibe' if family in VIBE_FAMILIES else 'scratch', 'variants': {}}
    for name in rig["variants"]:
        source = LIBRARY / name
        # a36 is a reference-only sprite stored in the full Final DJ Poses atlas.
        if not source.is_file():
            source = ROOT / "Final DJ Poses" / name
        with Image.open(source) as img:
            assert img.size == SIZE, source
            rgba = np.asarray(img.convert("RGBA")).copy()
        if shared_head is None:
            shared_head = rgba.copy()
            shared_head[~mask] = 0
            save_png(shared_head, folder / (family + "_head_shared.png"))
        body = rgba.copy()
        body[mask] = repair[mask]
        body, metrics = repair_under_head(rgba, shared_head, body, mask, rig)
        body = apply_manual_repairs(body, family, name)
        save_png(body, folder / (name[:-4] + "_body.png"))
        audit['variants'][name] = metrics
    print(f"{family}: shared head + {len(rig['variants'])} body layers generated; " +
          f"{sum(x['underpainted'] for x in audit['variants'].values())} underpaint pixels")
    return audit


if __name__ == "__main__":
    audits = [build_family(family) for family in FAMILIES]
    (LAB / "head_gap_audit.json").write_text(
        json.dumps({'schema': 'pocketdj-head-gap-audit.v1', 'families': audits}, indent=2) + "\n",
        encoding='utf-8')
