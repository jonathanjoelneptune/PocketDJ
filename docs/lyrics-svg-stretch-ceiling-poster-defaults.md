# Pocket DJ SVG Stretch Ceiling Lyric Poster

<span style="color:#16a34a;">Changed:</span> Default four-corner ceiling region updated to the user-tuned green-dot values:
- Top left: 221, 12
- Top right: 1637, 12
- Bottom left: 597, 418
- Bottom right: 1201, 415

<span style="color:#16a34a;">Changed:</span> Lyrics now render as SVG text rows using `textLength` and `lengthAdjust="spacingAndGlyphs"` so each row stretches horizontally to fill the trapezoid slice.

<span style="color:#16a34a;">Fixed:</span> Text is no longer clipped to solve overflow. Instead, each row computes a safe width inside the trapezoid at that row's vertical position.

<span style="color:#16a34a;">Changed:</span> One-row lyrics use the full ceiling height. Two-row and three-row lyrics split the same ceiling height into stacked equal slices.

<span style="color:#16a34a;">Changed:</span> Manual skew/angle remains hidden. Perspective is driven by the trapezoid geometry and row widths.

<span style="color:#16a34a;">Changed:</span> Room utility storage key bumped to `pocketdj-room-utility-v15`.
