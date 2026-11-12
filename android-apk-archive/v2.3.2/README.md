# PocketDJ Spotify v2.3.2 — display recovery

**Status:** Signed, statically validated, not device-tested.

**Confirmed cause of v2.3 blank screen:** The native `Hook.onClick()` `showRoom` branch called `setVisibility(INVISIBLE)` on the PocketDJ WebView instead of `setVisibility(VISIBLE)`. In the v2.3 Hook DEX this was `const/4 v6, 4` at offset 3876; v2.3.2 changes it to `const/4 v6, 0`. The bytecode payload differs by **exactly one byte** from the v2.3 APK, with DEX checksum/signature and APK signature recalculated. No Spotify-owned file, Android XML, or gesture module changed.

## Restored native display behavior

- Hidden top-right Spotify/PocketDJ toggle. The same internal click handler remains usable for preloading and swiping.
- Hidden compact Expand control; press and hold on PocketDJ artwork for at least 650ms to invoke the existing expanded developer/login view. Compact remains visible there.
- Phone: same square album-area gesture region, 16:9 PocketDJ scene vertically centered, black frame on the scene only. Transparent space stays swipeable. The deployed v2.3 CSS controls the scene positioning.
- Unfolded tablet: the experimental guarded artwork-slot reflow attempts a full-width, taller PocketDJ area. It commits the resize **only** if Spotify's seekbar actually moves down sufficiently. It otherwise restores the native artwork geometry. This is an intentionally fail-closed experiment, not a guarantee of full-width sizing on every device.
- Reuses v2.3.1's already-working native swipe control and Android Keystore session persistence module, byte for byte.

## Validation

- APK Signature Scheme v2 verified with certificate SHA-256 `72fd48cdfe257006f48db9b4851429dd3f05bcd9177c9b0efd21434a61347bf0`, same signer as v2.3.1.
- ZIP CRC and all DEX modules validated.
- Compared with v2.3: APK entry list unchanged; only `classes18.dex` differs. The entire DEX payload after byte 32 has **one** modified byte, encoding the WebView `VISIBLE` state.
- `classes19.dex`, the Android swipe / preload / login / guarded reflow module, is byte-identical to v2.3 and v2.3.1.
- Android physical-device behavior remains **untested**.

## Source files

- `build_v232.py` — original v2.3 custom Android Hook builder with one verified visibility correction.
- `classes19.dex` — original custom PocketDJ Android Java module, unchanged from v2.3 (source in the public PocketDJ GitHub v2.3 archive).
- `validate_v232.py` — checks signatures, unchanged files, and the exact one-byte DEX difference.
- `validation_v232.json` — actual package SHA256, size, signing identity, and validation summary.

To reproduce the exact signing identity, you must supply your own local original Spotify 9.1.98.621 APK and existing private test-signing key. Do not commit the signing key or full modified Spotify APK to the public repo.

## Device test order

1. Install over v2.3.1 without removing app data; open Now Playing, swipe to PocketDJ, verify room/sprites appear.
2. Swipe left/right again; confirm both pages alternate without skipping tracks, and vertical scrolling still works.
3. Long-press PocketDJ 650+ ms to open the full screen for login; Compact returns to the carousel.
4. Phone: scene centered vertically, outlined at its actual 16:9 bounds, with upper/lower transparent regions still swipeable.
5. Unfolded portrait and landscape: inspect full width, scene proportions, playlist heading, song title, seekbar and play/pause. The guarded reflow may fall back if Spotify does not move its own controls.
6. Restart Spotify fully and ensure PocketDJ login persists and the scene preloads correctly.

**Rollback:** `PocketDJ-Spotify-v2.3.1-RECOVERY.apk`, confirmed by the user to render successfully.