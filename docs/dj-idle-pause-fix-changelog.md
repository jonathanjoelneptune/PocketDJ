# Pocket DJ Idle/Pause Fix Changelog

<span style="color:#16a34a;">Added:</span> Dedicated idle loops that use only `i*.png` idle pose frames.

<span style="color:#16a34a;">Added:</span> Dedicated paused loops that use calm `i*.png` pose frames.

<span style="color:#16a34a;">Changed:</span> The DJ now starts on `i1.png` instead of briefly flashing an active `a*.png` frame on page load.

<span style="color:#16a34a;">Changed:</span> No-track and disconnected states now resolve to true idle behavior instead of active/performance loops.

<span style="color:#dc2626;">Removed:</span> Active `a*.png` frames from idle and paused loop pools.
