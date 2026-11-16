# Live modular DJ + spinning vinyl (initial integration)

## Input assets

- The existing `public/assets/poses/final/a8.png` is the canonical equipment reference.
- `src/dj/tableRegion.ts` contains the **exact white table-region pixels**
  exported in the approved v3 separator ZIP (93,758 allowed pixels).
- DJ-only pixels are generated **once for each decoded original pose** by
  comparing exact RGBA values in that region against a8. This avoids adding
  approximately 15 MB of duplicate PNG downloads.
- The six existing Head Bob Lab rigs still supply a separate rotating head.
  Their original body PNGs also pass through the same table-removal routine.
- Source PNGs and head rig files remain untouched.

## Render order

For all visible DJ NES poses (scratch, idle, paused, speaking, song changes):
1. Shared stationary table from a8
2. Both album-art record textures with perspective-flattened rotation
3. DJ foreground (table pixels subtracted from the original full-size pose)
4. Existing independent Head Bob Lab head, when normal scratches allow it

The existing smooth scratch blend is assembled in an *offscreen transparent
canvas*. It is then alpha-composited above the rotating vinyl so the blending
patch never punches a transparent hole in a record or the static table.

## Calibration and behavior

- Left center: **(170, 399)**, right center: **(425, 397)**
- Both record ellipses: radii **(55, 28)** in the 582×652 pose coordinates
- Rotation: **16.2 RPM**, independent of BPM
- First real song is assigned to the **right** deck; subsequent song IDs
  alternate left/right. Pausing, seeking, polling, or temporary AI DJ
  commentary does **not** count as a song change.
- On later song changes, new cover art is **staged off the platter** for the
  complete A41 → A11/A12/A11-2 (or mirrored) record-change cinematic. The
  previously placed record remains visible on that deck until the sequence
  finishes and the new artwork has decoded. Only then does the new record
  appear on its platter and start spinning.
- The existing A41 held-album artwork layer is clipped to a **circle** over
  the held vinyl, using the already-calibrated X/Y/size controls. The separate
  A41 hands layer stays above it so fingers remain visible on the record.
- Spotify DJ commentary that delays pose updates also delays album placement,
  preventing a new track from arriving on the platter before its cinematic.
- Existing album artwork remains on both decks during pauses, with rotation
  frozen until playback resumes.
- Artwork loads asynchronously and is discarded if a newer track takes that
  deck before the image decodes. Delayed album-art URLs are accepted.
- No new Spotify API endpoints; uses the same `NormalizedTrack` Spotify/
  Spicetify/demo metadata already available in PocketDJ.

## Fallbacks and performance

- Full original `#djSprite` remains mounted. Missing reference table, head
  rig, source frame, or image decode automatically retains the legacy image.
- URL query `?vinyl=0` disables the new table/vinyl renderer without changing
  the original smooth scratching or head-bob engine. This is the emergency
  rollback switch while validating desktop and Android.
- Derived DJ cutouts use a `WeakMap` keyed by decoded bitmap; only changed
  sprite images are classified once, not every animation frame.
- Static/paused frames skip repeated canvas draws when neither pose nor record
  texture is changing. All moving records follow the current RAF tick rather
  than spawning a second animation loop.
- Active scratch family image caches are still bounded by the existing
  Head Bob controller. Static/idle/cinematic pose cache is bounded to ten.

## Acceptance checks

1. Compare A44/A47 scratch poses against the standalone prototype:
   table stays fixed, albums rotate, hands cover the records and the detached
   head continues nodding on the beat.
2. Change songs repeatedly: left/right alternate without losing the opposite
   deck's previous cover.
3. Pause/resume in a scratch pose and an idle pose: both album images remain
   visible and frozen, then resume.
4. Trigger Spotify DJ commentary and A11/A11m record-change cinematics; the
   original animations continue and the table is not duplicated.
5. Test Chrome, Spotify desktop embed and Android WebView. If any regression
   is seen, open the site with `?vinyl=0` to use the previous renderer.

Unit tests verify mask geometry, exact approved region count, calibration,
alternating deck identity, and angle/freeze math. GitHub PR CI also runs the
existing beat, scratch, and speaker tests, regenerates head rigs, and builds.
