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


## V4: Skyline protection and Android WebView compositing stability

The city window is a protected focal area. A feathered radial alpha exclusion now suppresses album-driven coloring from **three scene-wide layers**: the environmental foreground/background wash, the ambient music glow and the blurred album wash. The center of the skyline receives approximately 4% of these effects, while surrounding shelves, ceiling and floor retain their full colored response. The exclusion is soft, avoiding a sharp rectangular window cutout. Physical light bar emitters remain unaffected.

The room environmental wash now uses **soft-light** instead of `color` blending. Soft-light responds to existing luminance and gives the walls richer highlight tint while maintaining original shadow detail. The vivid physical bars still use their own local glow.

On coarse-pointer/mobile devices, large-screen ambient glow no longer animates blur, scale or filter, and album wash only animates opacity rather than filter changes. The room's existing color interpolation still runs over five seconds, but updates to gradient CSS variables and music-energy style variables are bounded at ~12.5 updates/second on mobile (~30/s on desktop), instead of repainting many full-room layers for every requestAnimationFrame. This is a performance mitigation for WebView flashing, not a confirmed root-cause diagnosis.

Verification:
- Compare playing versus paused with the skyline visible and city building edges distinct.
- Try covers with intense warm and teal colors; tint on shelves/floor should remain visible with the skyline comparatively dark and crisp.
- Test track crossfades, repeated pause/play transitions, backgrounding/reopening Spotify, Android portrait/foldable and expanded ceiling.
- Check light bar colors, swaps, spectrum changes, lyrics, and DJ pose changes; animations should remain independent.
- Validate that the app is not blank on Android WebView and that reduced-motion preferences still apply.
