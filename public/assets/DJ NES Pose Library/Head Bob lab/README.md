# DJ NES Head Bob Lab

The six folders contain the original, approved Head Bob Lab metadata exported by the user:
`a10`, `a4`, `a14`, `a44`, `a47`, `a48`.

Each `head_bob_rig.json` preserves its family variants, cut polygon, mask override
pixels, body repair pixels, neck pivot, and all four enabled positions:
Base (0,0,0°), Nod 1 (0,+2,-1.5°), Nod 2 (+1,0,+1.5°), Nod 3 (-1,-2,-1.5°).

## Generated lossless runtime images

The workflow `.github/workflows/head-bob-assets.yml` uses the existing source PNGs
in the parent `DJ NES Pose Library` and `scripts/build_head_bob_assets.py` to
materialize only the necessary files in each family folder:

- `<family>_head_shared.png`, one head for the entire scratch-loop family
- `<pose_name>_body.png`, one head-free body for each of the 15 scratch frames

The generated images are full-size 582 × 652 transparent PNGs. The generator
uses the same pixel-center polygon rule as the original HTML tool. It does not
quantize, resize, or modify the original PNGs. Re-running it is idempotent.

To regenerate locally:

```sh
python -m pip install Pillow numpy
python scripts/build_head_bob_assets.py
```

The full source sprites remain the fallback whenever a rig or generated image
is missing. Original idle, speaking, cinematic, and DJ Nova poses are untouched.

## Runtime behavior

`src/dj/headBobController.ts` composites the active body plus the family head
on one persistent, transparent canvas. All six unordered pairs of the four
positions are eligible for a normal two-position groove. Three- and four-step
flourishes are occasional. The tempo-paced step rate is mostly one beat,
with some every-other-beat or twice-per-beat passages, changed at a groove
boundary every several dozen steps, not every frame.

Head bobbing is disabled during record-change cinematics, AI DJ commentary,
paused/idle states, and manual animation audition. Tempo pacing uses the
currently estimated BPM; it does **not** claim true audio downbeat detection.

The A47 source variants have four pixel discrepancies at the head/hood seam
inside the approved polygon. That minor input difference does not alter the
user's selected shared head, and the originals remain available as fallback.
