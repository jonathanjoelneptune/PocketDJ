# Pocket DJ Marquee JS Title Loop and Static Artist Fix

<span style="color:#16a34a;">Changed:</span> Long title scrolling is now controlled by JavaScript so it can pause for a true 10 seconds whenever `TITLE:` is back at the left edge.

<span style="color:#16a34a;">Changed:</span> Long title scrolling still uses constant visual speed and the repeated-title train with the `✦` separator.

<span style="color:#16a34a;">Changed:</span> The title scroll no longer restarts every Spotify polling cycle.

<span style="color:#16a34a;">Changed:</span> Artist row is fully decoupled from title scrolling and remains static/clipped when too long.

<span style="color:#dc2626;">Removed:</span> CSS-only title train animation that could not provide a true fixed 10-second start pause.
