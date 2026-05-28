# Pocket DJ SVG Lyric Poster Centered Tight Rows

<span style="color:#16a34a;">Fixed:</span> SVG lyric rows now use explicit left-edge placement with `text-anchor="start"` and `textLength`, which avoids fullscreen midpoint-anchor drift.

<span style="color:#16a34a;">Fixed:</span> Lyric rows are vertically centered as one stacked poster block inside the ceiling trapezoid.

<span style="color:#16a34a;">Changed:</span> Row spacing is treated as a true pixel gap. Default remains `0.5 px`.

<span style="color:#16a34a;">Changed:</span> Multi-row text uses tighter center-to-center spacing so the visible bottom of one row nearly touches the visible top of the next row.

<span style="color:#16a34a;">Changed:</span> Font height is constrained by the full trapezoid height first, then each row is horizontally stretched to the safe width available at that row.

<span style="color:#16a34a;">Changed:</span> Room utility storage key bumped to `pocketdj-room-utility-v17`.
