# Pocket DJ Ceiling Lyric Poster Mode Build Fix

<span style="color:#16a34a;">Fixed:</span> Removed stale TypeScript references to the old karaoke-fill utility controls: `lyricVideoMode`, `lyricVideoBgColor`, and `lyricVideoFillColor`.

<span style="color:#16a34a;">Changed:</span> Utility binding now uses the new poster controls: `lyricPosterMaxRows` and `lyricPosterTransition`.

<span style="color:#16a34a;">Fixed:</span> Reset utility now resets the poster controls instead of trying to reset removed karaoke controls.

<span style="color:#dc2626;">Removed:</span> Old karaoke fill mode, background color, and fill color binding logic from `src/main.ts`.
