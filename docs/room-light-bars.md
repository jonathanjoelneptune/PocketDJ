# Album-reactive wall light bars

Two CSS-drawn wall fixtures sit to either side of the room window. The light-bar host is inside `room-base-layer` at z-index 1, behind speakers (z-index 2) and DJ (z-index 4), but above the room background.

The bars use `--room-spotlight-album-primary-rgb` and `--room-spotlight-album-secondary-rgb`, which are updated from the interpolated palette in `main.ts`. This ensures the colors change through the existing five-second crossfade, regardless of the spotlight palette or animation mode. No new animation loop is added.

## Room controls

Room > Album-Reactive Wall Light Bars opens the utility. Controls: enabled, brightness, wall glow, width, height, shared vertical position, independent left/right horizontal positions, color swap, and paused behavior (lit/dim/off). Values persist in `pocketdj-room-light-bars-v1`; Reset restores the reference-image defaults.

## Regression checks

- Test normal desktop, portrait phone, portrait tablet, and landscape tablet. Both fixtures stay anchored to room coordinates and are always behind DJ and speakers.
- Switch album artwork with distinct palettes: colors interpolate with the room, without flashing or resetting.
- Change moving-spotlights palette to Amber + Ice Blue and disable spotlights: physical bars must still follow album art.
- Verify enabled, swap, all sliders, pause modes, Reset, and reload persistence.
- No additional canvas, frame callbacks, external media, or high-cost full-screen visual filters.
