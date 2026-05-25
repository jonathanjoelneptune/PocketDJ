# Pocket DJ DJ Brain + Marquee Update Changelog

<span style="color:#16a34a;">Added:</span> DJ animation brain in `src/dj/djController.ts` with active, idle, paused, demo, audition, and cinematic control modes.

<span style="color:#16a34a;">Added:</span> Quick loop pools for normal DJ movement using the real Final DJ Pose PNGs.

<span style="color:#16a34a;">Added:</span> Cinematic loop pools for larger record-placement and hype animations.

<span style="color:#16a34a;">Added:</span> Keyboard controls: `L` toggles audition mode, `C` toggles cinematic mode, and left/right arrows step through loops.

<span style="color:#16a34a;">Added:</span> End-of-track cinematic trigger when a playing track has roughly 30 seconds remaining.

<span style="color:#16a34a;">Changed:</span> Marquee update logic now avoids restarting the scroll animation when the displayed text has not changed.

<span style="color:#16a34a;">Changed:</span> Marquee now handles no-track, paused, demo, and playing states through a stable keying system.

<span style="color:#16a34a;">Changed:</span> Added a subtle marquee transition flash/fade only when text changes.

<span style="color:#dc2626;">Removed:</span> Table overlay/front-layer logic remains excluded from this update.
