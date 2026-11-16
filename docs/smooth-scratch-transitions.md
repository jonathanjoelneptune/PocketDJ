# DJ NES: default-on head nods and smooth scratching

## Defaults and controls

The Room → DJ Animation → Enable head nods checkbox now starts **On** for
users with no saved preference. An explicit previous Off (`0`) still means Off
and is not overwritten.

Smooth scratching is **independent** of that checkbox: even when the head is
stationary, the transitions between scratch pose variants are eased.

## How the interpolation works

The head rig already knows the shared head's X/Y/tilt, so those numeric values
interpolate naturally. Different scratch PNGs are not geometric poses; their
hands are already painted at different positions. A transform of the entire
sprite would also move the face, table, and sleeves incorrectly.

Instead, on each **in-family** scratch frame change, the renderer:

1. Takes the decoded outgoing/incoming **body images**, or the original full
   frames when head nods are Off.
2. Finds the changed-pixel bounding rectangle once.
3. Interpolates RGBA for the changed pixels in premultiplied-alpha space,
   maintaining crisp source-pixel boundaries and avoiding dark transparency
   halos. It leaves unchanged pixels untouched.
4. Animates the change with a brief eased blend of ~55–115 ms, while preserving
   the existing randomized frame hold time and frame order.
5. If nodding is enabled, draws **one** detached head above the interpolated
   body so there is no translucent double-head artifact.

This is an optical dissolve of already-drawn hand poses, **not** a new set of
true arm-in-between illustrations. Transitions are intentionally brief to
minimize ghosted hands. The original PNGs and exported head rigs are unchanged.

## Performance and fallback

- One persistent 582×652 compositing canvas is reused for both movements.
- Pixel readback is performed only when the scratch destination changes, not
  during every render frame. A small changed-pixel patch is updated while the
  transition is active; static frames avoid repeated full redraws.
- A maximum of two decoded families is retained per cache; failed original PNG
  fetches are not repeated every animation frame.
- Any failed load or pixel readback falls back to the unchanged original pose.
- Cross-family changes, record-change cinematics, DJ speaking, idle, paused, and
  audition playback are **not blended**.
- The user's BPM/beat-map anchored nod clock remains independent.

## Test and deployment

`pnpm run test:animation` runs the existing playback beat clock tests plus the
new scratch-pixel blending tests. GitHub Actions also builds and type-checks
the application, and generates the approved head/body layers before deployment.

After deploying, compare A10/A4 (two-image loops) with A44/A47/A48
(three-image loops), then toggle head nods Off and confirm scratching still
transitions smoothly. The primary visual risk to evaluate is temporary hand
ghosting at high scratch speeds; this is tunable with
`scratchTransitionDuration` in `src/dj/scratchBlend.ts`.
