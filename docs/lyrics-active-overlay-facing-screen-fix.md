# Pocket DJ Lyrics Active Overlay Facing Screen Fix

<span style="color:#16a34a;">Fixed:</span> The active lyric is now rendered in its own overlay layer outside the rotated ceiling projection layer.

<span style="color:#16a34a;">Changed:</span> Inactive lyrics remain projected onto the ceiling, while only the active lyric faces the reader like the marquee text.

<span style="color:#16a34a;">Changed:</span> The lyric boundary defaults were moved back up so the lyrics do not run too low into the marquee area.

<span style="color:#16a34a;">Changed:</span> The active lyric backing strip is darker and more visible.

<span style="color:#16a34a;">Fixed:</span> Animation presets now target the active overlay layer, making Vertical marquee, Active horizontal marquee, Focus sweep, Soft slide, Pulse pop, and Instant visibly different.

<span style="color:#16a34a;">Changed:</span> Room utility storage key bumped to `pocketdj-room-utility-v3` so stale v2 lyric positions do not override these defaults. Older speaker and room filter settings are still migrated.
