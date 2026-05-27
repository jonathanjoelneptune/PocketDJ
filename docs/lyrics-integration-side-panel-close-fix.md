# Pocket DJ Lyrics Integration and Side Panel Close Fix

<span style="color:#16a34a;">Added:</span> New `src/lyrics` source group with LRCLIB lyrics lookup support.

<span style="color:#16a34a;">Added:</span> Full lyrics block rendering on the ceiling with room-perspective styling.

<span style="color:#16a34a;">Added:</span> Synced lyric parsing and active-line highlighting based on Spotify playback progress.

<span style="color:#16a34a;">Added:</span> Lyrics fallback states for searching, unavailable, instrumental, and error.

<span style="color:#16a34a;">Fixed:</span> Side-panel `X` now closes using both pointerdown and click handlers, and unlocks the side panel first.

<span style="color:#16a34a;">Changed:</span> Outside click closes the side panel only when it is not locked.

<span style="color:#16a34a;">Changed:</span> If the side panel is locked, clicking outside the panel no longer slides it closed.
