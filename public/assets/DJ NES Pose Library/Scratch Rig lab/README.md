# Scratch Rig Studio (staging)

**Editor:** `/Scratch_Rig_Studio.html`

Phase 1–3 utility for the six original scratching families: A10, A4, A14, A44, A47, A48.

## Core architecture

Use the same 582×652 source coordinate system as the live head-bob controller:

1. **Static torso / DJ desk:** Generate one `<family>_body.png` by starting with the currently approved `Head Bob lab/<family>/<family>_body.png` (which already contains neck-gap underpainting), removing the selected left/right arm masks, and applying under-arm paint.
2. **Movable arm layers:** Extract `<family>_arm_left.png` and `<family>_arm_right.png` from the original base sprite. Split the arms because not all legacy scratching poses move both hands together.
3. **Four keyframes:** Base, Scratch 1, Scratch 2, Scratch 3, each with independent arm X/Y offsets and rotation angles about the shoulder pivots. Family-specific pivots, masks, and motion states are in the exported `scratch_rig.json`.
4. **Independent head:** Render the approved `Head Bob lab/<family>/<family>_head_shared.png` on top using the existing nod offsets and beat clock, so the head still bobs while the arms scratch.
5. **No ghosting:** Interpolate transforms (ease-in/out), never fade complete pose frames together. Keep the original pose variants as fallback until the calibrated scratch rigs are approved.

## First pass

`starter_rigs.json` contains six per-family, independent masks (polygon seeds), shoulder pivots, hand-area hints, and family-specific initial transform seeds. On loading a family, the editor:

- Loads the original `<family>.png` and old `-2.png` / `-3.png` sprites from `Final DJ Poses`.
- Loads the already approved headless body and shared-head rig assets.
- Generates separate screen-left and screen-right arm masks, plus initial under-arm paint.
- Measures the hand positions in the legacy sprites and solves each arm transform so its hand lands at the same reference location.
- Samples plausible rotation angles and compares the rendered hand silhouette against the reference to select an initial tilt.
- Marks Scratch 1 as `legacy-aligned` against `-2.png`; for three-variant families, Scratch 2 as `legacy-aligned` against `-3.png`.
- Marks all remaining states as `synthesized`, since there are no `-4.png` originals to claim a match against.

All detected positions are **starting estimates**. The studio shows the per-hand difference and provides manual transform controls, arm-mask brushes, a body-pixel paint/erase tool, and a bright pink transparency background for final correction.

## Export

Click **Export rig ZIP** for:

- `<family>_body.png` (fixed headless body with current approved neck fill and your under-arm paint)
- `<family>_arm_left.png` (transparent movable arm)
- `<family>_arm_right.png` (transparent movable arm)
- `scratch_rig.json` (standard coordinate rig, masks, two independent arms and their four states)
- `README.txt`

The schema is `pocketdj-scratch-rig.v1`. Import/export the JSON to refine later, and send final ZIPs/JSONs to integrate into the live app.

## Runtime integration boundary

**Not enabled yet.** Production still uses the legacy scratching variants. After manual seam and hand alignment review, add a ScratchRigController or extend the existing HeadBobController composite renderer. Make it responsible for arm layer transforms while preserving the head bob, vinyl layers, record-change cinematics and fallback behavior.

Composition order: fixed body → vinyl/decks (existing ordering as applicable) → transformed arms → nodding head, with any foreground overlays handled per the existing room renderer. Ensure a consistent stacking order before enabling it by default.
