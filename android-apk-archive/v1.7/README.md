# PocketDJ Android v1.7 — Swipe carousel (experimental)

**Package:** `PocketDJ-Spotify-v1.7-SWIPE-CAROUSEL-EXPERIMENTAL.apk`  
**Package bytes:** `156143533`  
**SHA-256:** `2632a1825192fcf667a91db1d290dc4cd6ec4076541f14beb9f0c42536b5d01d`  
**Certificate fingerprint (SHA-256):** `72fd48cdfe257006f48db9b4851429dd3f05bcd9177c9b0efd21434a61347bf0`  
**Built from:** modified Spotify 9.1.98.621 APK, v1.6 experimental Hook as fallback  
**Status:** locally built, v2 signature verified, GitHub Actions Java-to-DEX compile passed; NOT device-tested.

## Change from v1.6

The APK changes only `classes18.dex` and adds our own `classes19.dex`. All other APK entries, including Spotify's original layouts, resources, manifest, and player code, match the v1.6 ZIP contents.

- A native adapter looks for a visible, artwork-sized, approximately square **ImageView** in Now Playing.
- If it finds a verified image-only view, a native pager wraps that one view and the PocketDJ WebView without moving Spotify's metadata, seekbar, or playback controls.
- Swiping right on the artwork reveals PocketDJ; swiping left on PocketDJ returns to the artwork.
- The same WebView remains alive between page transitions. **Expand** temporarily displays it full-screen for login/settings, then returns it to the pager on **Compact** or Android Back.
- If artwork detection does not find a safe candidate, no pager is installed and the old v1.6 top-right toggle stays visible. Never infer that the pager succeeded just because the APK installed.

## Validation

- GitHub Actions Java/Android SDK compile: passed
- DEX module creation: passed
- Local APK ZIP CRC: passed
- Stored entry alignment: passed
- Custom Hook DEX instruction and branch validation: passed
- APK Signature Scheme v2 and package signing identity: passed
- Signature matches v1.6: yes
- Android install/login/gesture/scroll/foldable checks: **not yet tested**

## Known risks

Spotify may render album art using another native view class or a different hierarchy; the safety check may reject it. Its own horizontal swipe-to-skip gesture may also intercept input before the pager. These require phone testing. The experimental fallback keeps Spotify usable, but it does not guarantee pager functionality.

## Source and archive policy

Native Java and CI source: [experimental Android carousel](../../experiments/spotify-carousel-v1.7/) (currently staged in PR #12 until device tests pass).

Public GitHub tracks build metadata, patch sources, tests, and SHA-256 hashes. It does **not** redistribute modified Spotify APK binaries or private signing keys. Store installable APKs only in an access-controlled private archive with appropriate licensing review.
