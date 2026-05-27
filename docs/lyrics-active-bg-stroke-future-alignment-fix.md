# Pocket DJ Lyrics Active Background, Stroke, and Future Alignment Fix

<span style="color:#16a34a;">Fixed:</span> Active lyric background color and opacity utilities now work through RGB CSS variables instead of the prior `color-mix()` expression.

<span style="color:#16a34a;">Fixed:</span> Active lyric black stroke utility now applies through `-webkit-text-stroke-width`, `-webkit-text-stroke-color`, and a fallback drop-shadow outline.

<span style="color:#16a34a;">Fixed:</span> Future/bottom lyric text is centered and contained inside its guide width so it no longer spills/overlaps toward the bottom-right.

<span style="color:#16a34a;">Changed:</span> Future bottom section default width increased from 544 px to 900 px to give lower future lyrics more room.

<span style="color:#16a34a;">Changed:</span> Room utility storage key bumped to `pocketdj-room-utility-v5` so stale v4 lyric geometry does not override the corrected defaults. Older speaker and room filter settings still migrate.
