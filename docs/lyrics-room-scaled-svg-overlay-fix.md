# Pocket DJ Lyrics Room-Scaled SVG Overlay Fix

<span style="color:#16a34a;">Fixed:</span> The lyric SVG overlay now scales with the 16:9 room instead of staying at fixed `1764px` CSS width.

<span style="color:#16a34a;">Fixed:</span> The trapezoid stays locked to the ceiling when the browser window is resized.

<span style="color:#16a34a;">Changed:</span> The SVG still uses the stable `0 0 1764 529` ceiling coordinate system, but the rendered element is `width: 100%` and `height: 53.326%` of the room.

<span style="color:#16a34a;">Changed:</span> Added final CSS overrides to keep only the clean SVG lyric renderer visible.

<span style="color:#16a34a;">Changed:</span> Room utility storage key bumped to `pocketdj-room-utility-v20`.
