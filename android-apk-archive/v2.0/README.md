# PocketDJ × Spotify v2.0 (experimental)

## Device feedback addressed

- **Phone: lower artwork swipe region** — native SwipeRouter now owns hit testing using Spotify's artwork bounds, not the shorter PocketDJ WebView. It caches native album bounds across page swaps and reuses them when native artwork is recycled. Bottom-edge swipes should no longer skip a song.
- **Phone: tall room** — native compact phone WebView uses a 4:3 viewport while the base PocketDJ room remains true 16:9. The released website CSS bottom-anchors the base scene and reveals the existing ceiling extension upward, preserving positions and proportions.
- **Unfolded tablet portrait** — native scene moves upward ~3.1% of host height, leaving Spotify song title and seekbar accessible. No forced room height enlargement in this form factor.
- **Tablet landscape** — keep the full native width with a short viewport so playback stays visible. CSS retains 16:9 scene geometry with symmetrical top/bottom cropping, rather than scaling sprites non-uniformly. Some content remains cropped due to the physical layout constraint.
- **Frame border** — adds a thin, noninteractive metallic outline around the embedded WebView rectangle, only when compact.

## What did not change

- Same Spotify 9.1.98.621 executable and native resources; only PocketDJ's custom classes18.dex and classes19.dex changed vs v1.9.
- Same test signing key and WebView sign-in session. No key files are included in this archive.
- Same Spotify playback controls, vertical scrolling, and bidirectional swipe-to-switch behavior.
- **Spotify background-to-black transition is not implemented** in this iteration. It needs reliable identification of the actual native gradient background, distinct from song controls. Applying a blind whole-screen scrim would dim controls and risk another navigation regression. This is a separate optional visual pass after geometry tests.

## Risks and acceptance tests

This APK passed static signature, CRC, DEX, and file-integrity tests. No real phone install test was performed. Test bottom-of-artwork swipes on the phone, then tablet title and progress bar, then landscape scaling. If the new tall room overlaps controls on any posture, revert to v1.9. Verify login after update and force-stop/relaunch.

## GitHub record

Source Java and CI live in experimental PR #17; the paired site CSS was merged as PR #16. Public archive includes source, build script, validation report, and SHA-256; **no modified Spotify APK binaries or signing keys are committed publicly**.