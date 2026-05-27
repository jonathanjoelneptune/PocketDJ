# Pocket DJ Lyrics Phase 1 Active Fill Line

<span style="color:#16a34a;">Changed:</span> Removed the past/future lyric block rendering from the active visual path.

<span style="color:#16a34a;">Added:</span> Phase 1 active lyric fill line. Only the current lyric appears on the ceiling.

<span style="color:#16a34a;">Added:</span> Smooth fill wipe mode where the current lyric fills left-to-right based on current playback time between the current lyric timestamp and the next lyric timestamp.

<span style="color:#16a34a;">Added:</span> Word-by-word fill mode that approximates karaoke timing by stepping fill progress across the number of words in the current lyric.

<span style="color:#16a34a;">Fixed:</span> The active lyric layer is not blended, so black background color and opacity behave normally.

<span style="color:#16a34a;">Added:</span> Ceiling lyric video utility controls: X, Y, width, height, zoom, tilt, base opacity, fill opacity, stroke, background opacity/color, fill color, glow, fill lead, fade time, fill mode, and base font size.

<span style="color:#dc2626;">Removed:</span> The old past/current/future ceiling lyric block logic from the rendered UI.

<span style="color:#16a34a;">Changed:</span> Room utility storage key bumped to `pocketdj-room-utility-v9` so stale multi-line lyric settings do not override Phase 1 defaults.
