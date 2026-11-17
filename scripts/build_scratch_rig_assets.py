#!/usr/bin/env python3
"""Generate the six approved Scratch Rig layer sets from the final v4 lab exports.

The approved v4 image edits are stored losslessly as compressed pixel deltas
against the original Final DJ Poses base images. GitHub checks out those base
images already, so we avoid checking in several megabytes of duplicate PNGs.

The reconstruction is byte-for-byte RGBA identical to the user-supplied v4
body/arm images before the final table/head integration pass. At that pass:
  1. Remove the stationary table pixels. VinylDeckStage already draws the
     canonical a8 table and rotating album-art records.
  2. Remove the original fixed head from the body, restoring the approved
     head-bob underpaint beneath the movable head.
  3. Publish an independent headless body and movable left/right arm layers.

Run after scripts/build_head_bob_assets.py. Requires Pillow and numpy.
"""
from __future__ import annotations

import base64
import hashlib
import json
import re
import zlib
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SIZE = (582, 652)
PIXELS = SIZE[0] * SIZE[1]
SRC = ROOT / "Final DJ Poses"
HEAD_ROOT = ROOT / "public" / "assets" / "DJ NES Pose Library" / "Head Bob lab"
DEST_ROOT = ROOT / "public" / "assets" / "DJ NES Pose Library" / "Scratch Rig lab"
PATCH_ROOT = ROOT / "scripts" / "scratch_rig_patch_data"
FAMILIES = ("a10", "a4", "a14", "a44", "a47", "a48")
LAYER_NAMES = ("body", "left", "right")


def read_png(path: Path) -> np.ndarray:
    image = Image.open(path).convert("RGBA")
    if image.size != SIZE:
        raise ValueError(f"Expected 582x652 PNG: {path}")
    return np.array(image, dtype=np.uint8)


def save_png(image: np.ndarray, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(image, mode="RGBA").save(path, optimize=True)


def apply_patch(original: np.ndarray, packed: dict) -> np.ndarray:
    """Restore exact RGBA from compressed changed-pixel bitmask and values."""
    mask_data = zlib.decompress(base64.b64decode(packed["mask"]))
    if len(mask_data) != (PIXELS + 7) // 8:
        raise ValueError("Corrupt scratch rig mask")
    changed = np.unpackbits(np.frombuffer(mask_data, dtype=np.uint8))[:PIXELS].astype(bool)
    value_data = zlib.decompress(base64.b64decode(packed["values"]))
    if len(value_data) != int(changed.sum()) * 4:
        raise ValueError("Corrupt scratch rig replacement pixel payload")
    result = original.copy().reshape(-1, 4)
    result[changed] = np.frombuffer(value_data, dtype=np.uint8).reshape(-1, 4)
    return result.reshape(SIZE[1], SIZE[0], 4)


def table_region() -> np.ndarray:
    """Use the exact canonical table coverage mask from the vinyl renderer."""
    text = (ROOT / "src" / "dj" / "tableRegion.ts").read_text(encoding="utf-8")
    found = re.search(r"APPROVED_TABLE_REGION_RLE\s*=\s*`([^`]*)`", text, re.S)
    if not found:
        raise ValueError("Cannot locate the approved vinyl table mask")
    mask = np.zeros(PIXELS, dtype=bool)
    for encoded in found.group(1).split(";"):
        if not encoded:
            continue
        start, count = encoded.split(",")
        position, length = int(start, 36), int(count, 36)
        if position < 0 or position + length > PIXELS:
            raise ValueError("Approved table mask outside source canvas")
        mask[position:position + length] = True
    return mask.reshape(SIZE[1], SIZE[0])


def remove_duplicate_table_pixels(
    layer: np.ndarray,
    table_mask: np.ndarray,
    sources: tuple[np.ndarray, ...],
) -> int:
    """Reveal the canonical static a8 table / spinning vinyl beneath artwork.

    This only removes exact color matches inside the audited table region.
    Hoodie, forearm and hand art is retained, even where it overlaps vinyl.
    """
    duplicated = np.zeros(table_mask.shape, dtype=bool)
    for source in sources:
        duplicated |= np.all(layer == source, axis=2)
    duplicated &= table_mask & (layer[:, :, 3] > 0)
    count = int(duplicated.sum())
    layer[duplicated] = [0, 0, 0, 0]
    return count


def build_family(family: str, region: np.ndarray, table_refs: tuple[np.ndarray, ...]) -> None:
    info = json.loads((PATCH_ROOT / f"{family}.json").read_text(encoding="utf-8"))
    if info.get("schema") != "pocketdj-scratch-pixels-v1" or info.get("family") != family:
        raise ValueError(f"Unexpected scratch asset patch for {family}")
    base = read_png(SRC / f"{family}.png")
    source_hash = hashlib.sha256(base.tobytes()).hexdigest()
    if source_hash != info["sourceSha256"]:
        raise ValueError(
            f"Original source pixels changed for {family}: {source_hash}. "
            "Do not apply calibrated pixel patches to a mismatched sprite."
        )

    target = {name: apply_patch(base, info["layers"][name]) for name in LAYER_NAMES}
    # The v4 user-calibrated body still contains the original (stationary)
    # head. Replace those source pixels with the approved headless body.
    approved_head = read_png(HEAD_ROOT / family / f"{family}_head_shared.png")
    under_head = read_png(HEAD_ROOT / family / f"{family}_body.png")
    head_mask = approved_head[:, :, 3] > 0
    target["body"][head_mask] = under_head[head_mask]
    # The table is drawn by VinylDeckStage beneath the arm rig. Keep both the
    # approved a8 and i10 tables out of all moving and stationary DJ layers.
    table_removed = {}
    for name in LAYER_NAMES:
        table_removed[name] = remove_duplicate_table_pixels(target[name], region, table_refs)

    out_dir = DEST_ROOT / family
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, suffix in (("body", "body"), ("left", "arm_left"), ("right", "arm_right")):
        save_png(target[name], out_dir / f"{family}_{suffix}.png")

    rig = info["rig"]
    valid_states = all(len(rig["scratchFrames"][side]) == 4 for side in ("left", "right"))
    if not valid_states:
        raise ValueError(f"Expected Base + Scratch 1/2/3 for both arms in {family}")
    manifest = {
        "schema": "pocketdj-scratch-rig.v1",
        "family": family,
        "sourceCanvas": {"width": SIZE[0], "height": SIZE[1]},
        "pivots": rig["pivots"],
        "scratchFrames": rig["scratchFrames"],
        "source": "User-approved Arm Scratch Repair Lab v4 final export",
        "renderOrder": ["canonical-vinyl-table", "repaired-body", "arm-left", "arm-right", "independent-head-bob"],
    }
    (out_dir / "scratch_rig.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Scratch rig {family}: decoded final edits, removed table pixels {table_removed}")


def main() -> None:
    region = table_region()
    # The user's table reference was derived from i10. The normal renderer
    # uses the a8 reference as its canonical static table.
    table_refs = (read_png(SRC / "i10.png"), read_png(ROOT / "public" / "assets" / "poses" / "final" / "a8.png"))
    for family in FAMILIES:
        build_family(family, region, table_refs)
    print(f"Generated {len(FAMILIES)} scratch rigs (3 PNGs + JSON per family)")


if __name__ == "__main__":
    main()