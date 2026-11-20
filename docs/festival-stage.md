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
