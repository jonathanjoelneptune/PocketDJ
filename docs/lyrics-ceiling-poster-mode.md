# Pocket DJ Ceiling Lyric Poster Mode

<span style="color:#16a34a;">Changed:</span> Replaced the karaoke fill-line implementation with a ceiling lyric poster projection.

<span style="color:#16a34a;">Removed:</span> Removed visible past/future lyric blocks, karaoke fill wipe, word fill mode, fill color controls, background color controls, fill timing controls, and active black sign styling from the visible lyric system.

<span style="color:#16a34a;">Added:</span> Current active lyric is dynamically split into 1, 2, or 3 rows to fill the ceiling poster area.

<span style="color:#16a34a;">Added:</span> Dynamic font sizing estimates the largest text size that fits inside the configured ceiling poster area.

<span style="color:#16a34a;">Added:</span> Transparent fill with subtle gray stroke to match the reference examples.

<span style="color:#16a34a;">Added:</span> Utility controls for poster X/Y, width, height, zoom, tilt, skew, stroke width, stroke opacity, fill opacity, glow strength, row spacing, base font size, max rows, and transition.

<span style="color:#16a34a;">Added:</span> Transition toggle:
- Quick push slide
- Subtle fade slide

<span style="color:#16a34a;">Changed:</span> Room utility storage key bumped to `pocketdj-room-utility-v10` so stale lyric settings do not override the poster mode defaults.
