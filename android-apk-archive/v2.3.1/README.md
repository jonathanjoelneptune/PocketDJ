# PocketDJ Spotify v2.3.1 — blank-screen recovery

**Status:** Experimental recovery candidate; signed and statically verified, **not yet tested on a Samsung device**.

The v2.3 device test showed a blank album-area view on phone, tablet portrait, and tablet landscape. Spotify Now Playing controls remained visible. The failure occurred after the v2.3 layout-hook change, which simultaneously hid controls and added a native artwork-slot reflow probe. The exact Android exception or WebView state has not been collected.

## Recovery strategy

Instead of layering more layout changes on v2.3, this candidate combines:
- **`classes18.dex`: byte-identical to working v2.2**, including reliable WebView creation, loadUrl, scroll handling, sizing, and visible fallback Spotify/Expand controls.
- **`classes19.dex`: byte-identical to v2.3**, including root swipe handling, encrypted session retention, and optional long-press developer action.
- Original Spotify assets, layout resources, manifest, and app DEXes are unchanged.

Because the v2.2 Hook does not call `ArtworkReflow.approvedHeight`, experimental tablet resizing is disabled. This restores the more conservative tablet sizing until device tests confirm the scene renders. The top-right Spotify toggle and Expand button are temporarily visible again.

The current PocketDJ website has the v2.3 embedded-only CSS; the recovery binary itself does not change the deployed site.

## Verification

- Original and recovery APK ZIP entry lists match.
- Exactly one entry differs from v2.2: `classes19.dex`.
- `classes18.dex` is byte-identical to the previously working v2.2 APK.
- `classes19.dex` is byte-identical to v2.3.
- APK Signature Scheme v2 verification succeeded.
- Same certificate as v2.2 and v2.3: `72fd48cdfe257006f48db9b4851429dd3f05bcd9177c9b0efd21434a61347bf0`.
- APK SHA-256: `688d410627e6bba8e9901cd5ff48659c7fc2f2e11a0f78ef32ab160260af084a`.
- APK size: 156,151,439 bytes.

[Build source](./build_pdj_v231_recovery.py) · [Validation report](./validation.json)

## Device tests

First, install directly over v2.3 without deleting app data. Verify PocketDJ actually paints on its first reveal, in all orientations. Then verify that repeated swipes do not skip tracks, the page scrolls, Spotify timeline and buttons remain functional, and both Spotify/PocketDJ login sessions survive force-close and reopen.

If blankness persists even with the exact v2.2 Hook, collect a filtered Android logcat (WebView console and AndroidRuntime) to determine whether the v2.3 gesture module or updated website is responsible. Avoid changing the layout again before that evidence is available.

**Public archive policy:** The modified Spotify APK and private signing key are not uploaded here.
