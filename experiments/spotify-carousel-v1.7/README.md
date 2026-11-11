# PocketDJ v1.7 Android artwork-carousel experiment

**Status: native carousel source staged; NOT integrated into, compiled into, or validated on Spotify's APK.**

This is intentionally not a release binary. v1.6 stays untouched and installable.

## Why this replaces the overlay

The v1.0–v1.6 PocketDJ WebView was positioned outside Spotify's normal artwork layout. On tablets, it could overlap or conceal the seek bar, intercept vertical scrolling, and drift from the album-art position. Increasing coverage and adding orientation-specific offsets do not fix the ownership problem.

The carousel wraps **only a verified artwork-only native view**. Its outer LayoutParams are the original artwork LayoutParams. Spotify's existing Now Playing scroll container still owns vertical scrolling. Spotify's title, progress bar and transport controls stay outside this component.

## User flow

- Initial page: Spotify's original album art.
- Swipe right across the artwork: PocketDJ slides in from the left.
- Swipe left across PocketDJ: album art returns.
- Fast horizontal flicks may switch pages. Small/vertical movements should not.
- The single WebView persists across swipes; do not reload or discard OAuth state.
- A change in Android window/fold posture only resizes the two pages to their parent's actual measured bounds.

## Integrating into a modified APK (not completed)

1. In Spotify's actual Now Playing view hierarchy, identify the **artwork-only** child or slot. Reject a candidate if it owns track title, seek bar, transport controls, or the root scroll container. **Never wrap** `tracks_carousel_view` solely because of its name; earlier versions demonstrated that container replacement can hide playback controls.
2. Only after this verification, create/configure the PocketDJ WebView using the working PKCE login flow and `?spotify_embed=1` website mode.
3. Make sure the WebView is detached from the old overlay before calling `PocketDjArtworkCarousel.installVerifiedArtwork(artwork, webView, true)`.
4. Ensure native artwork swipe-to-skip does not intercept the page-switching gestures *inside this artwork-only slot*. Leave the mini-player and transport buttons unchanged.
5. Do not hide original artwork or its parent. The album is page 0 of the pager, so it is intentionally visible.
6. Preserve native Spotify Now Playing scroll events and gestures outside the artwork slot. Do not add window-level overlays.
7. Exercise the fail-closed path if the artwork slot cannot be safely identified; in that case leave original Spotify artwork intact.

**Important:** Java source alone cannot patch the existing obfuscated Spotify APK; a real build still requires the known v1.6 inputs and an adapter against the verified view hierarchy.

## Acceptance tests before installing v1.7

| Test | Expected result |
| --- | --- |
| Fresh Now Playing | Original artwork visible; metadata and seek bar visible |
| Swipe right on artwork | PocketDJ page appears; seek bar does not move |
| Swipe left on PocketDJ | Original artwork returns |
| Vertical swipe over artwork or outside | Spotify Now Playing scrolls normally |
| Fast swipe between pages | No double track skip |
| Switch tracks while on either page | Updated album artwork and room metadata |
| Reopen Now Playing | No crash, account stays authenticated |
| Phone portrait | Artwork slot fits with progress controls underneath |
| Foldable portrait | Timeline remains visible and usable |
| Foldable landscape | Pager stays within the native artwork slot; transport controls never covered |
| Width/orientation changes | No square WebView letterbox intercepting touches |
| Unverified artwork ID | Injection refused; Spotify still works |

## State of the deliverable

- [x] Generic native two-page swipe component, decoupled from Spotify internal classes
- [x] Layout-bound sizing and horizontal-gesture threshold logic
- [x] Always-alive WebView across page transitions
- [ ] Verify target artwork view hierarchy in installed Spotify build
- [ ] Remove old overlay and wire native pager
- [ ] Rebuild, re-sign, and validate APK
- [ ] Test on phone and foldable

Do not merge this experiment into the production web app. No browser/Spotify site code is changed.
