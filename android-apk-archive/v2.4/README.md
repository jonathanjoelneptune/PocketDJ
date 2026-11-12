# PocketDJ × Spotify v2.4 — Native foldable content pane experiment

**Status:** Signed experimental APK. **Not tested on the user's Samsung.**

## Why we changed direction

The stock Spotify 9.1.98.621 `activity_now_playing_duo.xml` assigns only **50% of the screen width** to the `FrameLayout` that contains Now Playing's interactive content and the embedded PocketDJ WebView. Its companion spacer/guide also claims 50%. Our earlier v2.3 resizing attempted to enlarge the *child* artwork from inside this narrow content pane. That could not reliably make PocketDJ span the tablet width or move the native title/seekbar/transport content below it.

## Exactly what v2.4 changes

In the folded/tablet **duo** layout:

- Change the empty/guide View's `layout_constraintWidth_percent` from **0.5 to 0.0**.
- Change the right Now Playing content FrameLayout's `layout_constraintWidth_percent` from **0.5 to 1.0**.

Nothing else inside Spotify is patched: the phone Now Playing XML, both custom PocketDJ DEX files, all Spotify playback DEX, WebView load/session behavior, gesture handling, and artwork rendering code are **byte-for-byte unchanged** from user-tested v2.3.2.

The change should allow Spotify's **own right-pane content and PocketDJ's overlay** to calculate their layout using the full width on foldable tablet modes. It does **not** force any individual text labels, seeking controls or scroll regions to move down. This is a structural test: after the pane expands, Spotify may still enforce smaller internal max widths or constraints, and PocketDJ's existing safety cap may continue limiting scene size. We must check the device before removing those limits.

## Risk and safe rollback

This is a private experimental build. It could cause native Spotify tablet content to overlap or reflow unexpectedly. If playback controls become inaccessible or a crash occurs, directly install the [v2.3.2 recovery baseline](https://github.com/jonathanjoelneptune/PocketDJ/tree/main/android-apk-archive/v2.3.2) (the binary is intentionally not hosted on public GitHub). Same signing certificate supports in-place updates; do not uninstall or clear storage.

## Verification

- APK Signature Scheme v2: verified.
- APK signing certificate SHA-256: `72fd48cdfe257006f48db9b4851429dd3f05bcd9177c9b0efd21434a61347bf0` (unchanged).
- Original APK entries: identical count/order, all ZIP entries pass CRC.
- Exactly one archive entry differs from v2.3.2: `res/layout/activity_now_playing_duo.xml`.
- In that entry, exactly two typed float attributes changed; all other XML bytes identical.
- Both `classes18.dex` and `classes19.dex` are identical to v2.3.2.
- No test on a physical device/emulator has occurred.

## Device check

1. Test tablet portrait first. Is the artwork/PocketDJ now wider, and are the song title, seekbar and transport still accessible?
2. Test tablet landscape. Does PocketDJ use the wider available pane without distortion? Can you scroll vertically to controls?
3. Verify the phone portrait mode, two-way artwork swipes, long-press developer mode, and OAuth login were not affected.

If the pane becomes full width but the room stays narrower, the next targeted change is the **artwork height/vertical reflow constraint**, not a CSS stretch. If Spotify's controls stay at the original vertical positions, we will need a structural change in its Now Playing content hierarchy based on the observed device layout. Do not blindly translate button surfaces.