# PocketDJ × Spotify v1.8 — Native artwork swipe routing (experimental)

## Download
`PocketDJ-Spotify-v1.8-SWIPE-ROOT.apk`

Personal experimental Android package based on Spotify 9.1.98.621. Not affiliated with or distributed by Spotify. **Not tested on a physical Android device.**

## Why v1.7 didn't work
The v1.7 installer required a visible *ImageView* within a narrow set of bounds and explicitly skipped RecyclerView subtrees, even though Spotify's artwork carousel can use RecyclerView for swipe navigation. Therefore the pager often failed to attach and swiping simply skipped songs.

## What changed
- On **phone portrait**, the root `com.pocketdj.Hook` is replaced with `SwipeHostFrameLayout`, a subclass that retains the original v1.6 Hook behavior.
- On **dual-pane/foldable**, the Now Playing `ConstraintLayout` root is replaced with `SwipeHostConstraintLayout`, which preserves its original ConstraintLayout layout params and all children. The inner v1.6 Hook remains intact.
- Both intercept touches at the root *before* the native Spotify artwork carousel can recognize a rightward swipe.
- Rightward swipe over the album-art region switches to PocketDJ; leftward swipe over PocketDJ returns to native album art.
- Tap, vertical scroll and leftward album-art swipes are returned to Spotify by replaying an original DOWN followed by the current motion event.
- Album-art bounds come from Spotify's native `tracks_carousel_view` whenever available, or a bounded recursive ImageView fallback (which now searches inside RecyclerViews).
- The original native PocketDJ toggle remains available for fallback, the same WebView and OAuth session are used, and the reveal animation is a 240ms slide from the left.

**Scope limitation:** This is a root-level swipe-to-room integration, not yet the final two-page artwork pager. It fixes gesture routing without mutating Spotify's artwork/carousel hierarchy. The previous v1.6 foldable room-sizing quirks may remain. We will only replace the view hierarchy after physical tests establish the correct artwork slot.

## Validation completed
- GitHub Actions: Android SDK compilation into classes19.dex succeeded (native phone/tablet hosts and router).
- Rebuilt from the original base APK with the **v1.6 custom Hook byte-for-byte unchanged**.
- Exactly two binary XML files changed versus v1.6: `activity_now_playing.xml` and `activity_now_playing_duo.xml`.
- Exactly one ZIP entry added versus v1.6: `classes19.dex`. No Spotify playback code changed.
- APK Signature Scheme v2 cryptographic verification passed for both v1.6 and v1.8 using the same signer certificate.
- ZIP CRC, DEX Adler-32/SHA-1, original resources/other DEX equality, XML root class names verified.

## Device tests required
1. **Phone portrait:** Swipe right across the album artwork. PocketDJ should appear, and the Spotify song MUST NOT change.
2. Swipe left across the PocketDJ scene to return to original artwork; verify no track skip.
3. Tap album artwork, swipe down to scroll Now Playing, and swipe left on the album artwork to verify native behavior outside the new right-swipe gesture.
4. Verify playback seekbar, previous/next, play/pause, and lyric/queue cards remain usable.
5. Unfold tablet in portrait and landscape; repeat both swipe directions and scroll tests.
6. Force-stop/reopen and switch tracks. Spotify and PocketDJ must retain sessions. If a crash occurs, obtain `adb logcat -d -b crash -v time`.

The old top-right PocketDJ/Spotify button remains as a fallback. A successful swipe should display the room without manually clicking it.

## Source, archive, and rollback
- Public source and build metadata: https://github.com/jonathanjoelneptune/PocketDJ/tree/main/android-apk-archive
- Experimental native sources and CI: https://github.com/jonathanjoelneptune/PocketDJ/pull/13
- Known fallback APK: v1.6, installed as a separate signed APK download, **not** in the public repo.

The source archive excludes the proprietary Spotify base APK, private signing key, and signed binary. Back those up privately.