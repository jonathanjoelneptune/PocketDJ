# PocketDJ Spotify v2.1 — reliability & geometry candidate

**Status:** Android APK built, v2-signed, DEX and ZIP-integrity checked. Android **runtime not tested**; use v2.0 rollback if needed.

## APK

- Name: `PocketDJ-Spotify-v2.1-CORE-STABILITY.apk`
- SHA-256: `761084be9a72599c1cd452aa55c4e5b9bbb12c1d0f65261bc456f3a4a89735df`
- Bytes: `156149494`
- Signing certificate SHA-256: `72fd48cdfe257006f48db9b4851429dd3f05bcd9177c9b0efd21434a61347bf0`
- Against v2.0: **only** `classes18.dex` (PocketDJ Hook) and `classes19.dex` (our native helper) changed. Native Spotify resource and player binaries are identical.

## Changes

1. **Artwork gesture coverage:** Both horizontal swipe directions toggle PocketDJ/album page over the full Now Playing artwork-plus-gap region down to just above the native seekbar. Vertical scrolling, taps, and timeline seeking are forwarded to Spotify; playback skip buttons remain unchanged. Spotify has no supported setting for disabling swipe-to-skip.
2. **Preload:** when native Now Playing attaches, preloader invokes the existing Hook's create/show/hide path after its first layout. WebView remains attached and invisible while its webpage, sprites, fonts, and authentication initialize. WebSettings off-screen preraster is enabled. This is *Now Playing* preloading, **not** app-wide process-start preloading.
3. **Login recovery:** an origin-scoped WebViewClient reads PocketDJ's own localStorage using `evaluateJavascript` (no JS interface), and backs up only PocketDJ's token record and client ID in app-private preferences encrypted with AES-GCM using a device AndroidKeystore key. On a later page load, if WebView localStorage has been cleared, the client can restore the encrypted record once and reload the site for its existing PKCE token-refresh flow. Does not touch Spotify's app account tokens. Deliberate logout clears the backup when a scheduled probe observes storage cleared. No secrets included in the archive.
4. **Website auth:** 401 responses no longer immediately delete the saved refresh grant. A subsequent request triggers a single-flight refresh; a definitive refresh `invalid_grant` still disconnects.
5. **Tablet:** portrait room reduced to ~35% of native height and no longer lifted into playlist header. Landscape uses a contained **16:9** scene, never stretched. It may leave side margins if native seekbar must remain visible.
6. **Visual:** thin **black** border replaces gold. Denser embedded marquee and faster horizontal title pan; original site font sizing unchanged. Native root background drawable gets a short black fade when PocketDJ is shown, restored on return. This fade is best-effort if Spotify's colored backdrop is drawn in a separate child view.
7. **Phone:** native viewport is square, bottom-aligned against the album slot; room's base geometry remains 16:9 and uses the existing ceiling extension in spare vertical space.

## Test sequence

1. Install directly over v2.0 (same signing certificate). Reconnect PocketDJ **once** after installation if storage had already been cleared so the encrypted recovery backup is seeded.
2. Allow Spotify Now Playing to appear; swipe to PocketDJ without seeing the full interface assemble. Verify swipe-to-next never occurs anywhere between album top and title row.
3. Test ordinary seeking on the progress bar, next/previous buttons, and vertical scroll.
4. Exit Spotify completely, reopen, return to PocketDJ and confirm authentication survives. If not, capture Android logs filtered for `PocketDJ-session` **without including token values**.
5. Check foldable portrait playlist heading and song details; landscape room geometry and seekbar. Confirm black border, text legibility, and backdrop behavior.

## Source

- `build_v21.py`: Hook DEX generator, APK archiver, and v2 signer. Requires original Spotify 9.1.98.621 APK and the **private** signing key (not included).
- `src/*.java`: Android swipe, page effects, KeyStore session client, and preloader. Built with Android SDK and D8 in GitHub Actions.
- `validate_v21.py`/`validation_v21.json`: static integrity evidence.
- Website source is in PocketDJ repo PR #18 (merged). Native source is in draft PR #19 until tested.

**Scope/ownership:** Public PocketDJ repo archives source and hashes, **not modified Spotify binaries or private signing keys**.