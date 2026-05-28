# Pocket DJ Ceiling Lyric Poster Four-Point Fit

<span style="color:#16a34a;">Changed:</span> Replaced percent-based trapezoid controls with direct four-corner pixel controls matching the green-dot tuning concept:
- Top left X/Y
- Top right X/Y
- Bottom left X/Y
- Bottom right X/Y

<span style="color:#16a34a;">Fixed:</span> Removed clipping as the primary containment method. The lyric rows are now sized to fit inside the trapezoid instead of clipping letters at the edges.

<span style="color:#16a34a;">Changed:</span> Dynamic layout now computes each row's available width based on that row's Y position inside the trapezoid.

<span style="color:#16a34a;">Changed:</span> Long lyrics are more likely to be split into 2 or 3 rows when needed so the text can fill the ceiling while staying inside the four-point region.

<span style="color:#16a34a;">Changed:</span> Guide overlay now draws the full four-point trapezoid and shows green corner dots for tuning.

<span style="color:#16a34a;">Changed:</span> Room utility storage key bumped to `pocketdj-room-utility-v12`.
