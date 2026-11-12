# PocketDJ × Spotify Android v2.3 (experimental)

**Package:** `PocketDJ-Spotify-v2.3-ARTWORK-CAROUSEL.apk`  
**APK SHA-256:** `72094cbc0094ec5abddec4bb7689b34ff23c420deb4da83b3859f0d68bc1a0e5`  
**Signing certificate SHA-256:** `72fd48cdfe257006f48db9b4851429dd3f05bcd9177c9b0efd21434a61347bf0`  
**Status:** Native Android compilation, APK v2 signature, DEX/ZIP integrity and diff verified. **No physical-device verification.**

## Changes

1. Removes visible Spotify/PocketDJ top-right toggle and compact Expand button. Both retain their original click handler internally for swipe and preload stability. In the PocketDJ artwork area, a long press of at least ~650 ms opens the existing full-screen/expanded PocketDJ WebView, preserving its Spotify OAuth session. Expanded mode retains a visible Compact button for exit.
2. Phone album swipe target remains the native square artwork region, but the actual PocketDJ 16:9 room is centered vertically. Transparent top and bottom remain swipeable; only the visible scene has a black outline.
3. Adds a **guarded** full-width tablet artwork-slot resize probe. It temporarily asks the native Spotify carousel to grow to accommodate the unchanged 16:9 room plus extended ceiling. It only commits if the native seekbar actually moves down by at least 60% of the requested expansion. Otherwise it immediately restores Spotify's original carousel dimensions and the existing v2.2 layout. This is not guaranteed to support every Spotify tablet layout and cannot be verified without device testing.
4. Matching embed-only CSS adds the symmetric phone scene centering and true 16:9 full-width extended room for the validated tablet viewport. Never stretch sprites, walls, type, or lighting effects.

## Preserved behavior

- Native two-way artwork/PocketDJ swipe interception (does not skip songs in the verified v2.1–v2.2 phone path)
- Native vertical scroll, timeline and transport handling
- Preloaded PocketDJ WebView and cached renderer assets
- Android Keystore encrypted refresh-token recovery across host app restarts
- Spotify original code and layout resources (the binary diff from v2.2 is **only** custom `classes18.dex` and `classes19.dex`)

## Safe-release test checklist

- Phone: Both swipe directions; album page remains visible; PocketDJ scene centered within square; transparent upper/lower artwork area is swipeable.
- Phone: Long press PocketDJ scene for ~0.7 s; full screen appears with login/settings; tap Compact to exit; restart app and check login persists.
- Tablet portrait/landscape: Test full-width reflow. If it fails and the scene stays at the old width, this is deliberate fail-closed behavior, not a claim of full support.
- After native reflow, confirm song title, slider, transport and other metadata move down together and remain clickable and vertically scrollable.
- If unusual layout distortion occurs, roll back to v2.2 directly (same certificate).

## Archive policy

The source/build/validation files may be committed to the public PocketDJ repository. Full modified Spotify APK binaries and the private test-signing key are excluded because the APK contains third-party proprietary components and exceeds GitHub's normal single-object size limit. Store binaries privately with appropriate rights and the signing key encrypted.

## Key files

- `build_v23.py`: custom Hook DEX generator and APK signing/packing implementation
- `validate_v23.py`: signature, CRC, DEX and original-app diff validation
- `validation_v23.json`: concrete build metadata
- `src/ArtworkReflow.java`: tablet native artwork-slot guarded reflow
- `src/SwipeRouter.java`: two-way swipe and long-press developer handler
- `src/SwipeHost*.java`: root dispatch interceptors for phone/foldable
- `src/PocketDjSessionWebViewClient.java`: existing origin-scoped Keystore session recovery
- `src/PocketDjPreloader.java`: existing hidden WebView initialization
