# Pocket DJ Lyrics Defaults, Animation, Font, and Screen-Facing Active Lyric

<span style="color:#16a34a;">Changed:</span> Locked in the rough first-pass lyric boundary defaults: Top `(881, 40, 1177)`, Middle `(882, 220, 796)`, Bottom `(882, 404, 544)`.

<span style="color:#16a34a;">Added:</span> Base lyric font size utility. The value is used as the design base and still scales with the room/window.

<span style="color:#16a34a;">Changed:</span> Number of lyric lines utility now supports up to 15 lines.

<span style="color:#16a34a;">Added:</span> `Vertical marquee` animation preset so active lyrics slide vertically into place.

<span style="color:#16a34a;">Added:</span> `Active horizontal marquee` animation preset so only the active lyric slides horizontally like the marquee text.

<span style="color:#16a34a;">Changed:</span> Lyrics renderer now avoids re-rendering every animation frame when the active lyric has not changed, allowing CSS transitions/animations to actually play.

<span style="color:#16a34a;">Changed:</span> Active lyric now counter-rotates to face the screen while inactive lyrics stay skewed with the ceiling perspective.

<span style="color:#dc2626;">Removed:</span> Heavy active lyric glow that made the lyrics look muddled.

<span style="color:#16a34a;">Changed:</span> Active lyric is now accented with a cleaner thin amber underline instead of a soft glow cloud.
