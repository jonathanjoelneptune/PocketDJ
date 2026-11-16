# Held record album artwork: approved v2 calibration

This change imports the user's `pocketdj-held-record-calibration-v2.json`
saved on November 16, 2026. All numbers are on the original **582 × 652**
DJ sprite canvas, independent of room scaling and Spotify desktop embedding.

## Visibility and position

| Sequence | Pose | Center | Diameter | Rendering |
|---|---|---:|---:|---|
| Right | a41.png | 288,296 | 108 | circle |
| Right | a11.png | 397,233 | 114 | circle |
| Right | a12.png | 418,193 | 114 | circle |
| Right | a11-2.png | 427.9,391.9 | 84 | projective quad |
| Right | a13-2.png | 461,374 | 76 | hidden |
| Right | a10.png | 170,399 | 75 | hidden |
| Left | a41.png | 286,294 | 112 | circle |
| Left | a11m.png | 194,229 | 104 | circle |
| Left | a12m.png | 169,190 | 118 | circle |
| Left | a11-2m.png | 163,393.9 | 74 | projective quad |
| Left | a13.png | 171,399 | 76 | hidden |
| Left | a10.png | 170,399 | 75 | hidden |

### Perspective quads

Exact user calibration, vertices in TL → TR → BR → BL order:

- Right a11-2.png: (369.7,374.7), (464.7,371.2),
  (497.5,410.2), (379.7,411.6)
- Left a11-2m.png: (112.6,372.7), (229.2,373.7),
  (213.3,418.5), (96.7,410.6)

A 12×12 affine-triangle mesh maps a circular album texture through a projective
homography, matching the same algorithm used in Held-Record Alignment Lab v2.
The held cover is composited over the corresponding sprite; A41 still uses the
existing separate finger-overlay PNG.

## Fingertip occlusion over the album (November 16 update)

The circle and perspective-warp calibration are unchanged. The held-record
canvas now finishes each frame with a **foreground-only pixel pass**:

1. Draw the calibrated circular or projective album cover.
2. Retrieve the matching original DJ NES sprite's cached fingertip cutout.
3. Paint **only the DJ's original visible finger pixels above the cover**.
   The source record's black center and label are excluded from the mask.

`src/dj/heldRecordFingerMasks.ts` contains a tiny, reproducible base36
run-length encoding of each original pose's finger-region pixels. Masks are
derived from the existing 582×652 originals and follow both gripping sides
in A41, A11, A12, A11m, A12m, plus the downward fingertips in A11-2 and
A11-2m. Those seven masks occupy less than 5KB of RLE text and introduce
no new sprite PNG downloads. The renderer loads the same final pose assets
already preloaded by the DJ controller, extracts masked color/alpha one time
per pose into **small cropped canvases**, then reuses them throughout the
song change. The old a41-Hands.png crop is disabled when the new calibrated
canvas is active, because it includes the original black record and could
cover the new album.

The new painter doesn't change the position or size of the user's calibrated
albums, the four-corner warps, head nodding, scratching, or the rules that
leave the destination platter bare until the cinematic finishes.

**Visual check:** Fingers should appear to grip each side of the circular
album in A41/A11/A12 and the mirrored frames. In A11-2/A11-2m, the DJ's
downward fingers must appear above the warped album as he places it. The
album artwork must remain visible between the fingers without any old
black-record fragments reappearing.

## Runtime and performance

- `src/dj/heldRecordCalibration.ts` stores the exact calibration and pure
  projective geometry; `src/dj/heldRecordOverlay.ts` paints the cover.
- Reuse the Spotify album image **already decoded** by
  `primeSongChangeAlbumReveal`, avoiding duplicate image loading and flashes.
- Render on a transparent 582×652 canvas positioned exactly like the DJ sprite.
  Position changes with the actual **visible** cinematic pose to avoid
  getting ahead of delayed image decoding.
- Painting happens on pose or cover changes only, **not every animation tick**.
- The previous per-frame CSS cover remains a fallback if canvas initialization
  fails, but is hidden when the calibrated canvas is available.
- Only the real left/right record-change sequence displays artwork.
  The optional room utility Song Change preview uses A41 right calibration.
- The underlying vinyl **continues spinning throughout the cinematic**,
  and the other deck remains unaffected.
- Does not modify head nods, scratching, playback behavior, turntable positions,
  speakers, or album placements on the wall and crate.
- The `?vinyl=0` flag retains the existing modular table fallback, but does
  not change the new held-cover canvas.

## Validation

`pnpm run test:animation` includes tests for all 12 approved frame settings,
hidden frames, both independent A41 calibrations, exact quadrilateral vertices,
and projective mapping of each quad corner. CI also regenerates head rigs and
runs the full TypeScript/Vite production build.

Manual review: play a right and left song-change cinematic and confirm the
circle overlays follow A41/A11/A12, then the perspective quad appears on
A11-2/A11-2m without changing the album artwork on the platters.
