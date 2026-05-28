# Pocket DJ SVG Lyric Poster Tight Row Height Fit

<span style="color:#16a34a;">Changed:</span> Row spacing is now pixel based instead of ratio based. Default row gap is `0.5 px`.

<span style="color:#16a34a;">Fixed:</span> SVG lyric rows now split the full ceiling trapezoid height evenly with only the configured pixel gap between rows.

<span style="color:#16a34a;">Fixed:</span> Font size is scaled down slightly so outlined italic glyphs stay inside the ceiling instead of extending past the ceiling boundary.

<span style="color:#16a34a;">Changed:</span> Each row computes safe width from the top, middle, and bottom of its row band so the text fits the trapezoid through its full height.

<span style="color:#16a34a;">Changed:</span> Auto row logic is less eager to split into three rows unless the line truly needs it.

<span style="color:#16a34a;">Changed:</span> Room utility storage key bumped to `pocketdj-room-utility-v16`.
