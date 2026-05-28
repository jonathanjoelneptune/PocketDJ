# Pocket DJ Lyrics Cleanup: SVG Center-Point Poster Reset

<span style="color:#16a34a;">Added:</span> Center point controls:
- Center X
- Center Y
- Center guide opacity

<span style="color:#16a34a;">Changed:</span> The center dot is now the single anchor for every lyric row. Each row expands equally left and right from that center until it hits the nearest safe trapezoid edge.

<span style="color:#dc2626;">Removed:</span> Deprecated lyric systems from the active CSS path:
- full lyric block
- past/future lyric sections
- karaoke fill/wipe
- active lyric pill/background
- div-based poster rows
- old trapezoid clipping
- manual perspective/skew controls

<span style="color:#16a34a;">Changed:</span> The ceiling lyric renderer is now one SVG system inside a fixed `0 0 1764 529` viewBox.

<span style="color:#16a34a;">Changed:</span> The SVG includes an optional center guide dot and optional trapezoid guide polygon.

<span style="color:#16a34a;">Changed:</span> Storage key bumped to `pocketdj-room-utility-v19` so stale old-system values do not fight the new renderer.
