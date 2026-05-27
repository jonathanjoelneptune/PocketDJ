# Pocket DJ Marquee Short Title Center After Scroll Fix

<span style="color:#16a34a;">Changed:</span> Removed character-count based title/artist long-short class toggles from the start of marquee updates.

<span style="color:#16a34a;">Changed:</span> Long-vs-short marquee behavior now relies on actual rendered width measurement only.

<span style="color:#16a34a;">Changed:</span> New song entry resets title transform/alignment before measuring, so switching from a long scrolling title to a short non-scrolling title centers correctly.

<span style="color:#16a34a;">Changed:</span> Added final CSS alignment guards so measured-short titles remain centered and measured-long titles remain left-edge anchored.
