# Tablet carousel paired-surface implementation

**Status: source implementation only; not an installable Android release.**

This prototype addresses tablet portrait/landscape album-art snap without rewriting the known-good v3.3.33 `SwipeRouter` or `SwipePageEffects` DEX methods.

## Architecture

- `TabletCarouselHost` substitutes for **tablet** `SwipeHostConstraintLayout` in `res/layout/activity_now_playing_duo.xml` only.
- Existing `SwipeRouter.route()`, `activate()`, `afterLayout()` and developer-long-press handling remain responsible for gesture state, native toggle, and room WebView animation.
- `TabletCarouselAnimator` captures the visible album region **before** Spotify hides/recycles artwork (window `PixelCopy`, backed by `View.draw` fallback), then slides the snapshot in sync with the unmodified WebView animation.
- Temporary `BitmapDrawable` snapshots are removed on completion, rotation, view detach, and fallback. Original Spotify artwork containers, seekbar, metadata and transport controls are not reparented.
- **Phone path is unchanged**: `res/layout/activity_now_playing.xml`, `classes18.dex`, and `classes19.dex` must stay byte-identical to v3.3.33.
- Website, lyrics, speakers, lighting and song controls are outside scope.

## Build

With Android SDK platform API 35 and Build Tools 35 installed:

```bash
export ANDROID_HOME=/path/to/android-sdk
bash android-native/tablet-carousel/build_dex.sh
```

This compiles only the two new classes into `classes20.dex`. Compile-time stubs represent types already present in the v3.3.33 DEX; **they must never be included in the APK**.

The separate APK integration stage must: (1) verify the exact SHA-256 of known-good v3.3.33, (2) add `classes20.dex`, (3) update only the **tablet** binary layout root from `com.pocketdj.spotifyexperiment.SwipeHostConstraintLayout` to `com.pocketdj.spotifyexperiment.TabletCarouselHost`, (4) re-sign with the original private test key kept outside GitHub, and (5) validate the APK v2 signature and unchanged entry hashes. Avoid hand-patching preexisting DEX instructions.

## Validation

```bash
python android-native/tablet-carousel/tests/compile_with_api_stubs.py
```

The stub test checks Java source syntax/API contracts only. It **does not test Android runtime verification or layout inflation**.

The next release is blocked until a real SDK/D8 build and Android smoke test. Test Now Playing opening first on phone and unfolded tablet, then swipe both directions in tablet landscape and portrait. Check playlist switches, seekbar and transport controls, fold/rotation during a transition, and stale artwork after a song change. Collect `adb logcat` on any failure.

**Do not merge or ship based only on a stub compile and signature checks.** Keep v3.3.33 as the rollback APK.

## Known limitations

- `PixelCopy` is asynchronous. Waiting for capture adds up to ~180ms; if unsupported or timed out, `View.draw` may omit hardware-only content.
- A cached snapshot may briefly show the previous album when a song changes during Pocket DJ playback. Track-aware invalidation is needed before polished release.
- Snapshot rendering costs transient bitmap memory; bounded to a 1200px maximum edge and cleaned on view teardown.
- This prototype still requires Android device validation of the Spotify tablet View hierarchy, overlay draw order, and WebView dimensions.