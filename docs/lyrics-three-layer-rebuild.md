# Pocket DJ Lyrics Three-Layer Rebuild

<span style="color:#16a34a;">Changed:</span> Rebuilt the lyric display into three independent layers: past lyrics, active lyric, and future lyrics.

<span style="color:#16a34a;">Fixed:</span> Active lyric is now outside the blended ceiling layer, so black background color and opacity work correctly.

<span style="color:#16a34a;">Fixed:</span> Active lyric stroke is applied directly to the screen-facing active sign.

<span style="color:#16a34a;">Changed:</span> Past and future lyrics no longer use a single center-slot system. Past lyrics interpolate between the past top/bottom guides. Future lyrics interpolate between the future top/bottom guides.

<span style="color:#16a34a;">Changed:</span> The text no longer uses the old CSS 3D Star Wars crawl transform. The ceiling perspective is controlled by X/Y/width/scale/opacity interpolation so it is easier to tune.

<span style="color:#16a34a;">Changed:</span> Locked in the user-tuned defaults: active lyric at `(882, 88)`, active width `850`, active height `25`, 9 lyric lines, black active background, and future/past section values from the latest screenshot.

<span style="color:#16a34a;">Changed:</span> Room utility storage key bumped to `pocketdj-room-utility-v7` so stale lyric geometry does not override the rebuild. Older speaker and room filter settings still migrate.
