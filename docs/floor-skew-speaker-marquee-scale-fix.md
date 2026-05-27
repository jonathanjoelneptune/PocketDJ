# Pocket DJ Floor Skew, Speaker, and Marquee Scale Fix

<span style="color:#16a34a;">Fixed:</span> Restored speaker visibility by defining `--speaker-base-width` and ensuring `.room-speaker` uses it.

<span style="color:#16a34a;">Changed:</span> Speaker base width is room-relative so the speakers keep their elbow-height presence when the room is fullscreen.

<span style="color:#16a34a;">Changed:</span> Floor controls now use a corrected perspective/skew angle to better match the room floor.

<span style="color:#16a34a;">Changed:</span> Floor controls were slightly narrowed and repositioned so they sit more naturally in the floor perspective.

<span style="color:#16a34a;">Changed:</span> Marquee title and artist text now scale from `--room-w` instead of viewport sizing, so the text fills the marquee consistently in small and fullscreen layouts.
