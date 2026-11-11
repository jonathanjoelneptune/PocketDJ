# PocketDJ × Spotify v1.9 — Bidirectional Artwork Switch

**Status:** Experimental; Android CI compiled native Java sources, full APK passed static checks, not yet tested on a physical device.

## Release APK

`PocketDJ-Spotify-v1.9-BIDIRECTIONAL-SWIPE.apk`

### Changes vs v1.8

1. **Left or right swipes alternate both pages** within the detected artwork region. Swipe across album -> PocketDJ; next swipe in either direction -> album; repeat. Spotify's artwork swipe-to-skip is intentionally overridden when this gesture is recognized; transport controls remain available.
2. **Native album image leaves animate out** with the persistent PocketDJ WebView sliding in from the opposite side. Native ImageView leaves stay invisible while PocketDJ is shown, and return to their original alpha/translation on exit. The seekbar and track metadata parents are never moved or hidden. Artwork rendered by custom non-ImageView native classes may not be fully hidden.
3. **Video detection:** added TextureView/SurfaceView to gesture-target detection, but video disablement is a Spotify account setting rather than an APK interception. Go to Spotify → Settings and privacy → Content and display → Videos and Canvas; turn off Canvas and optionally Music videos. Disabling Canvas normally restores audio artwork.
4. **Foldable portrait:** when viewport width is at least 75% of height, cap the native 16:9 room at 39% host height and center it. The normal narrow phone layout stays as it was.
5. **Foldable landscape:** use full-width WebView with a physical height cap of 45% host height. The separately deployed, embed-only PocketDJ CSS crops the 16:9 room vertically to fit without stretching sprites or covering Spotify's controls. This means a small amount of room ceiling/floor is not shown in this orientation. The full-room/fully-visible/native-controls combination needs a future native reflow to be physically possible.
6. **Stable parts preserved:** Spotify playback libraries, resources, Android manifest, auth WebView, existing PocketDJ overlay toggle and vertical scroll integration. Signed using same test certificate as v1.8 to support an in-place update.

## Engineering limitations

- This is a swipe-animated two-surface bridge, not a full parent-replacing ViewPager. The root intercepts gestures and only mutates artwork-sized ImageView leaves. It does not reparent the native carousel or consume the Spotify transport container.
- On music videos/Canvas, the view may be SurfaceView/TextureView and is not alpha-hidden to avoid altering Spotify's video renderer. Disable Canvas using the native setting above.
- Positioning across the current Samsung foldable remains device-untested. If a regression occurs, reinstall the v1.8 rollback APK with the matching signing certificate.
- Use the native album-art carousel and regular Spotify track skip buttons to change songs; left/right artwork gestures now alternate views rather than skipping tracks.

## Validation and GitHub archive

- Native Java sources passed GitHub Actions Android SDK Java + D8 compilation.
- v1.8 and v1.9 verified using APK Signature Scheme v2 and the same certificate fingerprint.
- All 4,808 package entries present; only classes18.dex and classes19.dex changed vs v1.8.
- DEX SHA-1 and Adler32, ZIP CRC, and byte-for-byte Spotify original resources checked.
- Public GitHub archive includes sources, build scripts and SHA-256 metadata, but no proprietary Spotify APK or private signing key.

## Device acceptance checks

1. Spotify profile settings: turn off Canvas; choose an album cover song to begin.
2. Phone portrait: swipe right → PocketDJ; swipe right → artwork; swipe left → PocketDJ; swipe left → artwork.
3. While PocketDJ is shown, check whether the original album artwork remains visible below or around the room.
4. Test normal vertical scroll, seekbar movement, native play/pause, next/previous, and song changes.
5. Unfold tablet portrait and confirm seekbar visible/usable below the shorter room.
6. Unfold tablet landscape and confirm scene spans the width, native seekbar/control panel remains reachable, and room appears cropped vertically but not geometrically stretched.
7. Try music-video/Canvas song with Canvas turned off; ensure the artwork gesture still switches views.
8. Force-stop and reopen Spotify; ensure Spotify and PocketDJ sessions persist. If a crash occurs, collect `adb logcat -d -b crash -v time`.