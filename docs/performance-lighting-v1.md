# Music-driven PocketDJ scene lighting (foreground rebalance)

## V2 refinement

The original music-driven room was too dark at idle (0.76) and its album wash was behind the DJ and speakers (z-index 1). This revision makes the default resting darkness **0.25**, reduces the default album color intensity **1.25 → 1.00**, and moves the existing album wash to foreground **z-index 74** within the normal `room-base-layer`.

The wash sits above wall albums (z21), moving spotlights (z24), speakers (z2), DJ and table (z4), so all physical room objects appear to reflect the current album's illumination. The physical light fixtures themselves stay behind the speakers and DJ. The scene wake/sleep dimmer is at z76, floor playback controls z80, lyrics z82 and marquee z96.

The wash uses a single gradient layer with low-alpha **screen blend** to lift tinted highlights while keeping the window, black speaker housings and deep shadows contrasty. Wall hotspots follow the customizable light-bar horizontal locations; swapping the bars also swaps the left/right scene lighting colors. The gradated projection reaches the center stage, wall albums, left/right shelves, rug/floor, and lightly brushes the ceiling, including the extended ceiling reveal area.

New settings use `pocketdj-room-performance-lighting-v1`; unchanged earlier 0.76 and 1.25 settings receive a one-time migration to 0.25 and 1.00. Independently tuned user settings remain untouched. Controls allow adjusting idle darkness 0–0.92 and color intensity 0–1.8. No additional animation loop or independent palette state has been added; the RGB palette retains the existing five-second crossfade.

## Verification

- Idle room is noticeably brighter than the previous build yet a little darker than music-playing room.
- Music begins: entire scene gains color, including DJ, table, speakers, wall albums and floor. On pause, wash and room brightness fade back.
- Changing to distinctly colored albums crossfades both fixture hues and the scene projection, with no color snaps or fixed amber fallback except where artwork extraction fails.
- Check tall-ceiling mode: subdued overhead reflections appear without a hard horizontal seam.
- Bar color swap swaps the foreground projection as well; bar position controls move the matching color hotspots.
- Transport buttons and menu stay readable and clickable; the projection never captures touch.
- Test Spotify compact phone/tablet and standard desktop, including reduced-motion preferences. Validate TypeScript/Vite CI.


## V3: Rich pigments and contrast-preserving projection

The Android screenshots showed that the foreground `screen` wash raised luminance and turned dark room details into a pale gray haze. The foreground layer now uses `mix-blend-mode: color` (with a soft-light fallback), so it transfers hue and saturation without broadly lifting brightness. That keeps the dark speaker cabinets, city window, DJ contours, album artwork and wood textures intact. No change to physical light-bar placement or its brighter emissive glow.

Each target album now yields four light colors: two luminous fixture colors and two stage pigments at **minimum 91% saturation, 38% lightness**. Both color pairs interpolate together over the existing five-second transition, rather than recalculating HSL at intermediate frames. The projection keeps its seven localized gradients over the wall shelves, ceiling, DJ, table and floor, and tracks the bar positions and swapped colors.

The Room controls and saved defaults (paused darkness 0.25 and album color intensity 1.00) are untouched. Existing user tuning remains intact. No extra animation loop, DOM element, image asset, filter or stage geometry change.

**Device regression:** Play contrasting album covers (warm, cyan, blue, green). Compare against the previous screenshots: the scene should have stronger hue diversity but retain dark highlights and clear sprite edges. Verify five-second song transition, playing/paused fade, light bar swap, bar X positions, ceiling reveal, phone/tablet portraits, and reduced-motion.
