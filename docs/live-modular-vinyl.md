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
- On song changes, the incoming cover is **preloaded while the cinematic
  is queued**. Until A41 starts, the outgoing record stays visible.
- While the A41 → A11/A12 → A11-2 (or mirrored) sequence is **active**,
  **only the destination deck's album/placeholder is hidden**. Its static
  black platter remains underneath the DJ's held album artwork, while the
  opposite deck's album continues spinning normally.
- Only after the final placement pose ends, commit the decoded new album to
  the destination turntable and begin its 16.2 RPM rotation from angle zero.
  If decoding finishes late, keep the previous album artwork staged offscreen
  until it is ready; do not flash a partially loaded album onto the platter.
- If the active song is the **first track of the session**, the other empty
  deck displays a custom PocketDJ placeholder record with dark grooves and
  a center label. The placeholder spins at the normal 16.2 RPM during music
  and freezes on pause. If a later track uses that deck, the incoming artwork
  replaces the placeholder when ready. There is no extra network asset.
- The A41 held-album layer remains a circular crop at the user-calibrated
  position, with the independent A41 fingers over it. Matching circular
  overlays are positioned over held vinyl in **A11, A12, A11m, A12m**; poses
  with hands already on the platter (A10, A11-2, A13) use the platter artwork
  only. The existing cinematic frame sequence and scratch routines are intact.
- Spotify DJ commentary can delay the cinematic; the outgoing platter
  stays unchanged while the sequence is pending. When A41 begins, the target
  platter is bare until the DJ finishes placing the new record.
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
2. Change songs repeatedly: left/right alternate. The outgoing album
   stays visible while queued, only the target platter becomes bare during
   A41/A11/A12/A11-2 (and mirrored frames), and the new album appears only
   after the last placement frame ends. The other record never disappears.
3. Start a new session with only one song loaded: the blank deck should show
   the spinning PocketDJ placeholder; both records stop on pause and resume
   without losing their angle.
4. Trigger Spotify DJ commentary and A11/A11m record-change cinematics; the
   original animations continue and the table is not duplicated.
5. Test Chrome, Spotify desktop embed and Android WebView. If any regression
   is seen, open the site with `?vinyl=0` to use the previous renderer.

Unit tests verify mask geometry, exact approved region count, calibration,
alternating deck identity, and angle/freeze math. GitHub PR CI also runs the
existing beat, scratch, and speaker tests, regenerates head rigs, and builds.
