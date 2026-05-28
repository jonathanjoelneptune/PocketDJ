# Pocket DJ Lyric Poster Corner Opacity and Line Count Fix

<span style="color:#16a34a;">Added:</span> Corner guide opacity utility so the green corner points and trapezoid can be made visible while tuning.

<span style="color:#dc2626;">Removed:</span> Manual ceiling tilt/skew controls from the utility panel. The four corner points now define the ceiling region and the rows are centered/fitted inside that region.

<span style="color:#16a34a;">Fixed:</span> Forced row counts now produce the requested count. Force 2 rows gives 2 rows, and Force 3 rows gives 3 rows.

<span style="color:#16a34a;">Fixed:</span> Auto layout now favors fewer rows unless additional rows clearly improve the fit, reducing unnecessary line breaks.

<span style="color:#16a34a;">Fixed:</span> Removed the global poster rotate/skew transform that was offsetting lyrics to the right. Rows are now centered horizontally inside the trapezoid at their specific Y position.

<span style="color:#16a34a;">Changed:</span> Room utility storage key bumped to `pocketdj-room-utility-v14`.
