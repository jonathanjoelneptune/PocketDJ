# Festival Stage · experimental scene (WP1–WP5)

> **Experimental branch:** `feature/festival-stage-scenes-wp1-5`. Do not merge until visual QA is complete. `main` remains the production Record Room.

![Festival Stage initial preview](../public/assets/scenes/festival-preview.jpg)

## Quick preview

```bash
npm install
npm run dev
```

Open `http://localhost:5173/?scene=festival` for the Festival Stage, or `http://localhost:5173/?scene=record-room` for the original Record Room.

The top-left **LOCATION** selector switches scenes without interrupting Spotify playback, DJ animation state, hand poses, or vinyl rotation. The selection is persisted in browser storage. A `?scene=` query parameter overrides the saved selection for direct-link previews.

## Architecture

- `public/assets/scenes/festival-stage-illustrated-v1.png`: 1672×941 illustrated open-air backdrop with truss, stage, sunset and scenery, scaled to the original 16:9 room plane. The existing SVG remains as an earlier reference. No live artist text, album art, speakers, DJ or foreground crowd is baked into it.
- `src/scenes/scenePresets.ts`: layout schema, normalized percentage coordinates, safe parsing, default placement, and local storage.
- `src/scenes/festivalScene.ts`: isolated scene runtime. Performs only visual DOM initialization and lightweight updates from the existing playback and lyric streams.
- `src/scenes/festivalScene.css`: per-location rendering, layered 2.5D effects, performer/speaker transforms, animated audience and lighting.
- `src/ui.ts`: feeds the festival metadata and lyric ribbon from the exact existing track and lyric states. No new Spotify/lyrics fetches.
- `src/main.ts`: initializes the scene once after rendering the existing shell.

### Depth ordering (rear → front)

1. Fixed-perspective outdoor artwork and distant silhouettes
2. Performance beam washes and album-reactive color
3. Speaker cabinets with existing pulsing drivers
4. DJ performer group (original animated PNGs, canvas layers, vinyl, held-record effects)
5. Front stage edge, metadata/lyric displays and album billboard
6. Independent foreground audience silhouettes
7. Existing playback controls and editor tools

The **performer group** moves and scales as one; the local 582×652 deck, scratch, arm, head-bob, and held-album calibrations are never recomputed. Moving the DJ does not require pose-specific recalibration.

## Scene Layout Studio

Switch to Festival Stage and select **LAYOUT**. Choose an element to change X/Y position, scale, and opacity. Drag a highlighted scene object directly on the stage, or use sliders for precision. Audience density and lighting strength are separate controls.

**EXPORT JSON** selects a portable layout in the editor textarea. Copy it to a file. **IMPORT JSON** validates and applies a saved v1 layout. **RESET** restores the festival defaults. The current calibration persists in localStorage under `pocketdj-festival-scene-layout-v1`.

There are no additional timing loops for the crowd. Each silhouette animates via CSS with phase variation and a duration derived from the existing `--music-beat-ms` variable. Motion stops when playback stops, honors reduced-motion preferences, and uses transform/opacity rather than repainting the entire scene.

## Quality gates

- `npm run typecheck`
- `npm run test:scenes`
- `npm run test:animation`
- `npm run build`
- Record Room must preserve original sprite scaling, record placement, lighting and marquee
- Test track changes while scratching and during the early/late album-placement cinematic
- Test long song/artist titles, no lyrics, paused playback, album loading failures
- Test viewports: desktop 16:9, resized browser, narrow embedded Spotify and mobile
- Observe GPU/CPU/frame pacing with lighting and full audience enabled

## Known design constraints

The festival scene now uses the second illustrated high-detail PNG backdrop, replacing the initial procedural SVG. The PNG contains its own stage facade and lighting architecture, so the procedural front-stage lip is hidden. Existing interactive DJ, records, speakers, lyric display, song metadata, album-art showcase, and crowd remain independently rendered.

The current Record Room-only utilities remain accessible in their original mode. The festival intentionally hides wall-mounted album slots, ceiling projection, string lights and related room-only overlays rather than reimplementing them.

**Status:** Experimental. Branch-only until the perspective, DJ scale, crowd placement and responsive layouts are visually approved.

## Five-layer environment (Atmosphere Lab v2)

The festival now renders **five aligned RGBA PNGs**, generated at build time in
`public/assets/scenes/festival-layers/` when authored PNGs are not present:

1. `festival-sky.png`: transparent neutral cloud detail on top of a CSS-controlled sky.
2. `festival-landscape.png`: trees, distant mountains, and scenery.
3. `festival-city.png`: distant city, independently tintable from the mountains.
4. `festival-rafters.png`: roof canopy, trusses, banners, and support pillars.
5. `festival-floor.png`: wooden stage deck and fascia.

**All five images have identical dimensions and aligned full-canvas coordinates.**
The sun, stars, and drifting CSS clouds render behind landscape/rafters, fixing
the prior foreground-sun problem. The original DJ, vinyl, lyrics, speakers,
performance beams, and toolbar still render independently.

`scripts/build_festival_layers.py` generates provisional transparent PNGs from
the committed illustrated master art. It depends on Python, Pillow, and NumPy
(already available in CI). `pnpm run build` runs it on the festival branch.

**Replacing provisional art with new authored PNGs:** commit all five PNGs to
`public/assets/scenes/festival-layers/` on the festival branch. The builder
detects a complete authored set and does not overwrite it. To deliberately
regenerate masks from the source master, set `FESTIVAL_FORCE_REBUILD=1` when building.

The current generated masks are automatic and **not precision hand-retouched**.
The previous single-image source can leave edge seams and static coloration in
the rafters or mountain silhouettes. Follow-up visual QA should inspect all
five layers at sunrise, noon, sunset, and night, particularly canopy edges,
roof gaps, the horizon, and stage footing.

Do not move this work onto `main` before the final illustrated layers and
the time-of-day transitions have been approved.

## WP7A / WP7B: neutral scene artwork and unified lighting

**Status:** Experimental festival branch, not merged into production.

The old five-PNG color-threshold extraction has been superseded by authored
transparent SVG object geometry, stored under public/assets/scenes/festival-environment/.

| Static material layer | Asset |
| --- | --- |
| Mountains and landscape | mountains.svg |
| City skyline | city.svg |
| Foreground and side trees | trees.svg |
| Canopy, trusses and banners | canopy.svg |
| Stage floor and railings | stage-floor.svg |

The sky is procedural (CSS gradients, stars, sun, drifting clouds).
Two independent light-emission assets, city-lights.svg and
practical-lights.svg, gradually illuminate at dusk and night. Every image
shares the same transparent 1764 x 992 coordinate system. Unlike the previous
single-image segmentation, there is no sunset or sky printed onto the stage art.

The central material-specific lighting model lives in
src/scenes/festivalLighting.ts and interpolates ambient color, sky, sun,
mountain/city/tree/canopy/floor brightness, stage bulbs and city windows.
The existing SKY panel controls manual time, saturation, cloud density
and stars. Defaults and presets: 07:00, 12:00, 18:00 and 23:00.

Build no longer runs the old segmentation script.
Tests: npm run test:festival and the existing test:animation.

Visual acceptance criteria:
1. Noon: bright neutral sky, naturally colored scenery, no city window glow.
2. Sunset: warm horizon, more pronounced stage bulbs, atmospheric shadows.
3. Night: deep blue sky, stars, shaded neutral scenery and glowing city windows.
4. No rectangular sky keying artifacts or sun rendering across the rafters.
5. Existing DJ sprite/scratch/vinyl, speaker, lyric and production room intact.

The new authored vector artwork needs final human review at full display
resolution before the draft experimental scene is considered final.


## WP7E: Textured art fidelity (Nov 20, 2026)

The festival now uses **five detailed RGBA PNG art layers** generated with
`scripts/build_festival_textures.py` before the Vite build. The neutral
WP7A SVG artwork is retained as an exact-position fallback and, where needed,
as a shape/light mask.

| Material | PNG | Improvement |
| --- | --- | --- |
| Trees | `festival-textures/trees-detail.png` | Irregular clusters, small organic leaves, varied branches and shading |
| Mountains | `festival-textures/mountains-detail.png` | Multi-depth jagged ridgelines, strata and textured distance haze |
| Stage floor | `festival-textures/stage-floor-detail.png` | Varied perspective planks, knots, scratches, fascia timber and rivets |
| Canopy/rafters | `festival-textures/canopy-detail.png` | Fabric weave, stitching, metal scratches, rivets and structural wear |
| Distant city | `festival-textures/city-detail.png` | Fine window and facade texture, rooftop detail |

All five textures are **1764 × 992 RGBA** and intentionally have transparent
non-art regions. They contain only neutral material information: artificial
light remains separate (`practical-lights.svg`, `city-lights.svg`) and scene
color still comes from `festivalLighting.ts`.

The generator is deterministic; it uses Pillow and NumPy already installed
by the project's GitHub Actions environment. It is run by `pnpm build` and
`pnpm dev` (`predev`). The new `tests/festivalTextures.test.mjs` checks
generation, exact PNG format, dimensions and nonempty content. The art is
generated during CI for the experimental `/festival/` preview; no manual
binary upload is required.

### Visual QA toggle

A new toolbar **ART: DETAIL** button switches to **ART: VECTOR** to A/B the
new raster surfaces against the previous WP7A vectors in exactly the same
lighting and layout. Choices are saved locally. The query parameter
`?festivalArt=vector` also selects vector mode. Detailed art is the default.

The scene progressively loads PNGs: the original SVG surfaces stay visible
until detail assets have decoded, and missing files retain the SVG fallback.
No DJ pose, scratching, album, lyric, or Spotify playback logic changes.

### Acceptance checks

- Compare noon, sunrise, sunset and night with ART: DETAIL enabled.
- Confirm the floor no longer reads as a flat checkerboard/grid.
- Check new natural foliage silhouettes don't obscure the DJ and metadata.
- Confirm the canopy remains clean under day/night tint, with bulbs
  illuminating independently and without embedded warm sunset colors.
- Use ART: VECTOR to verify the exact same camera and object placement.
- Confirm Record Room and normal DJ animation are unaffected.

This is a deterministic procedural detail pass, **not yet a fully hand-painted
high-resolution backdrop**. Evaluate it at actual desktop and Spotify sizes
before treating WP7E as visually approved or merging the experimental branch.


## WP7F: Cinematic environment detail pass

This pass adds depth while retaining the WP7B lighting model and all DJ functionality.

- Reworked stage-floor-detail.png with cleaner perspective planks, longitudinal
  wood fibers, small knots and subtler seams. Removed the visually noisy,
  repeating horizontal grid from the prior texture pass.
- Expanded canopy-detail.png with directional woven textile folds, fine seam
  stitching, weathered bolts and subdued metal scuffs.
- Added authored transparent rigging-detail.svg: suspension hardware,
  reinforcement bars, clamps, cable runs, cross braces and structural rivets.
- Masked canopy and city details against their proper SVG silhouettes so
  texture can't spill into open sky or beside the buildings.
- Added a low-opacity atmospheric depth band behind the city, physically
  localized pools of stage light on the floor, and a restrained stage lip edge.
- Softened the existing nightclub-style concert beams. Their opacity and
  the new reflective light still follow the shared practical-light intensity
  from the Festival Lighting controller.
- Kept the ART: VECTOR fallback, which suppresses the new decorative rig,
  and updated the PNG URLs to avoid stale browser-cached material textures.

The SKY day/sunset/night controls, lyric banner, speakers, albums, scratching,
crowd placement, and production Record Room are unchanged.

**QA:** Compare 07:00, 12:00, 18:00 and 23:00 with ART: DETAIL. Pay attention
to whether the floor reads as actual decking, whether the truss looks sturdier
and less flat, and whether night lights illuminate only physical surfaces.
The goal is a more cohesive illustrated game aesthetic, not more saturation or
unbounded particle complexity. The renderer should remain performant in
Spotify embedded mode.

**Status:** Experimental branch; visual acceptance still required.
