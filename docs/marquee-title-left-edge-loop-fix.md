# Pocket DJ Marquee Title Left-Edge Loop Fix

<span style="color:#16a34a;">Changed:</span> Long titles now start at the left edge on song entry instead of centering the duplicated `TITLE ✦ TITLE` train.

<span style="color:#16a34a;">Changed:</span> The duplicated title train is created only after the new-song entry transition completes.

<span style="color:#16a34a;">Changed:</span> Title loop distance now includes the full separator width, so the repeated `TITLE:` reaches the left edge cleanly before the 10-second pause.

<span style="color:#16a34a;">Changed:</span> Long-title entry and exit alignment now stays left-edge anchored, while short titles remain centered.
