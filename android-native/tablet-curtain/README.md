# PocketDJ tablet-only curtain transition

Source-only implementation based on the device-working v3.3.33 APK.

The old tablet host remains functionally unchanged except that it routes a completed horizontal swipe into a non-interactive opaque curtain. The curtain slides over the album region in 100ms, uses the **existing** SwipeRouter.activate() to change pages while covered, waits 300ms for the **existing** SwipePageEffects animation to settle, and slides out in 100ms. The phone host and all original DEX modules stay unchanged.

This version deliberately does not capture artwork or change any native artwork views. No PixelCopy, no injected cache or speaker/lyric/website changes.

Compile new tablet class: `bash android-native/tablet-curtain/build_dex.sh` using Android 35 API/build-tools. Only the resulting classes20.dex belongs in the signed APK; compile-stubs must be excluded. APK assembly uses a byte-preserving resource root-class replacement on **only** res/layout/activity_now_playing_duo.xml and the original v3.3.33 signing key, never publicly uploaded.

**Acceptance gate:** APK v2 signature and integrity checks are not Android runtime verification. Verify Now Playing opens first before testing tablet portrait and landscape, then phone portrait and both swipe directions. The previous v3.3.36 new tablet root crashed on device, so this version remains experimental until the user confirms no crash.