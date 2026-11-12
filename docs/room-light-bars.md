# Album-reactive wall light bars (November 12 refinement)

Two charcoal-framed wall fixtures flank the center window. The Room utility ships with the screenshot-tuned defaults: 3.2% width, 15.0% height, 38.4% Y, left 31.6% / right 69.6%, brightness 1.00, wall glow 0.90. Paused defaults to dim, leaving the dark housings visible.

The release migrates **unchanged** legacy bar defaults and legacy 'lit' pause mode one time. Already-tuned positions, dimensions, brightness, and glow are preserved; a saved paused 'off' option stays off.

Both bars and their local wall/floor color bounce are in `room-base-layer` at z-index 1, behind speakers (2) and DJ (4). No full-screen bounce filters or separate animation loops are used.

## Color transition

The album source derives the color pair at the start and target of each track. It interpolates the *finished RGB light colors* with the same easing and 5-second crossfade as the canonical reactive room palette, then broadcasts that pair to both moving spotlights and physical bars. This avoids hue flips when intermediate RGB frames briefly become gray. Colors remain tied to the album art even when spotlight mode is set to fixed colors.

The ambient album mix (album wash, glow and accent) is increased modestly, with one-time migrations only for untouched old values. Wall and floor bounce add a more visible localized lighting effect, naturally changing with album art.

The moving spotlights already ship enabled with Full Room / Album Reactive and remain enabled by default. Previously saved explicit opt-outs are preserved. The existing desktop-only/reduced-motion performance protections remain unchanged.

## Verification

- Build passes TypeScript + Vite via PR workflow.
- On the same album: compare lighting playing versus paused; fixtures remain visible and casts softly dim.
- Switch contrasting album covers: no initial hue snap and no one-frame bright flashes; both colors complete their transition in five seconds.
- Turn spotlights off or choose fixed amber: bars must still follow album art.
- Verify the left/right swap also swaps both physical glow and room cast.
- Check 16:9 web, phone portrait, tablet portrait, tablet landscape; all geometry is anchored to room space.
- Adjust bar positions in Room settings, refresh, and Reset: values persist, and Reset uses new defaults.
- Spotlights stay opt-in to supported devices only; toggles remain independent of bar visibility.
