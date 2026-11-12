# PocketDJ Spotify v2.2 | First-reveal rendering + layout clearance

Date: November 11, 2026. Experimental APK; static checks only, device testing pending.

## Improvements

- Keep native v2.1 swipe routing and encrypted session recovery unchanged.
- Android phone portrait: position the viewport at the native artwork top and reduce the scene viewport from square to 9:10 width:height, retaining exact 16:9 scene geometry with ceiling reveal. This should protect Spotify song titles, timeline and lyrics.
- Foldable portrait: make base scene width 92% of the containing viewport at the same native viewport height, giving about 8% vertical room for existing ceiling-reveal mode without stretching art or moving the native metadata row.
- Foldable landscape: limit the viewport to 39% of host height instead of 45%, keeping the existing 16:9 fitted room and freeing vertical space for Spotify song info and transport controls.
- Website: start first render before Spotify API polling finishes; preload/decode the main room image, speakers, DJ pose and marquee font in compact Android mode. Preserve the original speaker settings and provide an opaque marquee background fallback.

## Verification

- APK signature scheme v2 verified and signing certificate identical to v2.1.
- ZIP CRC, entry set, manifest, resource layouts and DEX headers verified.
- **Only classes18.dex differs from v2.1**; native classes19.dex (swipes, encrypted token recovery) remains byte-for-byte unchanged.
- Native runtime effects, first-swipe readiness and restored playback icon not yet tested on Samsung.
- Website deployment is separately tracked in GitHub PR #20.

## Device tests

1. Login persistence: close/reopen Spotify; confirm PocketDJ authenticated.
2. After launching Now Playing, swipe to PocketDJ and verify speaker images, marquee panel and DJ appear without popping in.
3. Phone portrait: scene should end above native lyrics/track metadata; tapping play/pause works and shows the icon.
4. Foldable portrait: taller ceiling, clear playlist heading and song details.
5. Foldable landscape: exact 16:9 geometry with readable song title, visible timeline/play-pause and functional scrolling.
6. Swipe either direction, including low on the artwork: only toggles PocketDJ versus cover, never changes the track.

## Scope and tradeoffs

The v2.2 native package intentionally does not reposition Spotify-native controls by altering proprietary view parents: previous attempts hid the seekbar and play button. It reduces the PocketDJ viewport instead. This may create margins in tablet landscape. No APK binaries or private keys are placed in the public PocketDJ repository.