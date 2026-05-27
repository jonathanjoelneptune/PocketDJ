# Pocket DJ Marquee Title Pause and Static Artist Changelog

<span style="color:#16a34a;">Changed:</span> Long title rows now pause for about 5 seconds at the start before scrolling.

<span style="color:#16a34a;">Changed:</span> Long title rows use a repeated text train with the `✦` separator so the next title enters from the right before the prior title fully leaves.

<span style="color:#16a34a;">Changed:</span> Long title scrolling uses a constant visual speed based on rendered text width.

<span style="color:#16a34a;">Changed:</span> Artist row is now decoupled from title scrolling. Long artist text remains static instead of running its own scroll animation.

<span style="color:#dc2626;">Removed:</span> Artist row train scrolling.
