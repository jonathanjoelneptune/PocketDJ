# Pocket DJ Marquee Artist Alignment Decouple Fix

<span style="color:#16a34a;">Changed:</span> Marquee content layout changed from CSS grid to flex column so the long scrolling title cannot stretch the layout column used by the artist row.

<span style="color:#16a34a;">Changed:</span> Artist row is now fully independent of the title row, always using the marquee viewport width.

<span style="color:#16a34a;">Changed:</span> Long artist text remains centered/static and clips inside the marquee instead of becoming right-biased or inheriting title scroll geometry.

<span style="color:#dc2626;">Removed:</span> Grid `justify-self` based alignment from marquee rows, which was causing the artist row to appear right-justified when the title became very long.
