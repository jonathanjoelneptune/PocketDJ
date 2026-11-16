# Pocket DJ tablet carousel: paired-surface architecture (source implementation)

**Status:** Java implementation and local stub compile complete. **Not yet integrated into a signed APK, compiled with D8, or tested on Android. Do not install an APK built from this module without the release gates below.**

## What changes

- Only the unfolded layout (`res/layout/activity_now_playing_duo.xml`) switches its root class from `com.pocketdj.spotifyexperiment.SwipeHostConstraintLayout` to `com.pocketdj.spotifyexperiment.TabletCarouselHost`.
- `TabletCarouselHost` is a *replacement* for the existing tablet root, not a subclass of the final original. It preserves the existing `SwipeRouter.route()`, `SwipeRouter.activate()`, `afterLayout()`, `syntheticDown()`, and developer long-press routing.
- `TabletCarouselAnimator` snapshots the actual rendered artwork viewport via async `PixelCopy` (Android 26+) **before** the native toggle hides it. `View.draw()` is the fallback if the window copy cannot be performed. The snapshot is a `BitmapDrawable` on the native host overlay, not a Spotify control container.
- The snapshot slides 260ms opposite the unchanged Pocket DJ WebView animation. It remains cached only for the return transition and is removed/recycled when no longer needed, on detach, or on geometry change.
- The **phone layout remains untouched**. The website and lyrics remain untouched.

## Why this is safer than v3.3.34/35

Neither `classes18.dex` nor `classes19.dex` is rewritten. The proposed APK adds one *new* D8-compiled `classes20.dex` and changes only the root class name in the tablet-only compiled layout. The previous failed in-place rewrite of `nativeArtworkRect()` is removed from the release path. Preexisting `SwipeRouter` and `SwipePageEffects` APIs were verified in v3.3.33 DEX.

## Build steps

Run `./build_dex.sh` with `ANDROID_HOME` pointing to Android SDK API 35 and Build Tools 35.0.0. The script builds with temporary compile-only stubs representing the v3.3.33 native APIs and the AndroidX `ConstraintLayout` superclass, then excludes those stubs from the emitted DEX.

The resulting `classes20.dex` still requires APK integration (root XML substitution in **duo only**), signing with the existing private key, and Android runtime validation. Never commit the private signing key or complete modified Spotify APK to a public repository.

## Release gates: required before calling this fixed

1. Confirm no non-tablet APK files change apart from the added new DEX and `res/layout/activity_now_playing_duo.xml`. Phone host XML, lyrics, original DEX and manifest remain bit-identical to v3.3.33.
2. Validate new DEX against Android SDK D8, and verify the APK v2 signature, ZIP entries, DEX integrity and XML reference.
3. **Android smoke test:** Now Playing opens with the tablet unfolded. Logcat must show no `VerifyError`, `InflateException`, or `ClassNotFoundException`.
4. Check tablet portrait/landscape slides in both directions, song change while room is shown, folding/rotation during a transition, and seekbar/playback taps.
5. Confirm phone portrait is unchanged, including login and developer long-press.
6. Retain v3.3.33 as rollback. Do not label this implementation safe without the Android smoke test.

## Known risks and tradeoffs

- Async PixelCopy can introduce up to 180ms of transition latency. Keeping the native page visible until capture completes avoids flash but slightly delays the page change.
- Bitmap snapshots use up to roughly 5.5MB per 1200x1200 ARGB_8888 image. State is bounded per active tablet host, and cleanup is explicit. Captures are transient, never persisted or uploaded.
- When tracks change while Pocket DJ is visible, the return snapshot can momentarily show the prior album for up to 260ms before the live Spotify artwork is revealed. The next iteration should refresh the return image when a track change can be detected safely, but not by modifying Spotify playback code now.
- On a PixelCopy failure, `View.draw()` may omit hardware-only surfaces. The implementation falls back to original native animation when the snapshot cannot be created; it should not crash or block Now Playing.
- The APK's exact tablet root class and `Hook` hierarchy should be reverified in any Spotify version update.

## Local source compile check

`python tests/compile_with_api_stubs.py` checks Java syntax and the intended API surface **without** an Android SDK. This is not proof that the APK launches or that the visual effect works.