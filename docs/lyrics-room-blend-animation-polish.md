# Pocket DJ Lyrics Room Blend and Animation Polish

<span style="color:#16a34a;">Changed:</span> Default lyric line count is now 11.

<span style="color:#16a34a;">Changed:</span> Default base lyric font size is now 12 px to reduce clipping and ellipses.

<span style="color:#16a34a;">Changed:</span> Default active lyric preset is now Amber crisp and inactive preset is Clean readable.

<span style="color:#16a34a;">Fixed:</span> Animation preset changes now force a lyrics re-render/re-animation by using a CSS animation revision value in the render signature.

<span style="color:#16a34a;">Fixed:</span> Lyrics are no longer unnecessarily re-rendered every frame, so CSS animations have time to play.

<span style="color:#16a34a;">Changed:</span> Active lyric now looks closer to the marquee text: crisp amber, screen-facing, with a subtle dark backing strip.

<span style="color:#dc2626;">Removed:</span> Heavy active lyric glow and underline effects that made the ceiling text look muddled.

<span style="color:#16a34a;">Added:</span> Dynamic per-line font scaling based on lyric length so longer lyrics shrink before clipping or showing ellipses.

<span style="color:#16a34a;">Changed:</span> Animation presets were retuned so Vertical marquee, Active horizontal marquee, Focus sweep, Soft slide, Pulse pop, and Instant are visually distinct.
