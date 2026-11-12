# PocketDJ Android APK build archive

This directory is the **public, source-level archive** for PocketDJ's personal Android integration experiments. It records versions, test outcomes, hashes, and links to reproducible patch sources.

The installable APKs are **not committed** to the public PocketDJ repository: each modified APK contains third-party proprietary Spotify application code, is over GitHub's normal 100 MB Git-object limit, and is signed with a private test key. Do not upload signed APKs or signing keys to this public repository.

## Version index

| Build | Integration milestone | Notes |
| --- | --- | --- |
| v1.0 | Compact PocketDJ alongside Spotify Now Playing | First coordinated website/APK build |
| v1.1 | Window-level responsive-layout experiment | Regressed scroll and positioning |
| v1.2 | Stability rollback | Restored v1.0 layout with current signing identity |
| v1.3 | Native transparent artwork frame and adaptive marquee | Web changes in PR #11 |
| v1.4 | View bounds and leaf-artwork hiding experiments | Foldable testing |
| v1.5 | Landscape height cap | Foldable testing |
| v1.6 | Safer artwork-leaf suppression and landscape centering | Last available tested baseline |
| v1.7 | Native artwork swipe-carousel experiment | Device swipe-to-skip still occurred. [v1.7 record](./v1.7/README.md) |
| v1.8 | Root-level swipe interception for phone and foldable | Device-confirmed right swipe works on album art; video and two-way carousel issues remain. [v1.8 record](./v1.8/README.md) |
| v1.9 | Bidirectional artwork switch, slide transition, foldable sizing | Device-confirmed phone swipes, tablet geometry issues remain. [v1.9 record](./v1.9/README.md) |
| v2.0 | Native-sized album hitbox, taller phone viewport, foldable portrait lift, display frame | Signed and statically validated; device tests pending. [v2.0 record](./v2.0/README.md) |
| v2.1 | Expanded swipe region, preloaded WebView, AndroidKeyStore session backup, 16:9 and black frame | Signed and statically validated; runtime tests pending. [v2.1 record](./v2.1/README.md) |
| v2.2 | Render-before-poll startup, decoded asset warmup, portrait clearance and proportion-safe foldable room | Signed/static verified; Android device tests pending. [v2.2 record](./v2.2/README.md) |
| v2.3 | Hidden 650ms long-press developer mode, phone-centered artwork scene and guarded native tablet reflow | Signed and statically validated; device tests pending. [v2.3 record](./v2.3/README.md) |
| v2.3.1 | Blank-screen recovery using exact v2.2 WebView hook + v2.3 swipe module | Statically verified; device test pending. [v2.3.1 record](./v2.3.1/README.md) |
| v2.3.2 | Corrected v2.3 WebView reveal, hidden buttons, phone centering and guarded tablet reflow | Signed; verified exactly one DEX payload byte changed vs v2.3; device test pending. [v2.3.2 record](./v2.3.2/README.md) |
| v2.4 | Foldable native parent-pane width 50%→100%, no changes to working WebView/gesture DEX | Signed and statically validated; true native reflow needs device check. [v2.4 record](./v2.4/README.md) |

For precise historical SHA-256 digests and filenames, see [builds.json](./builds.json). These hashes identify the exact APK binaries that were generated in the development conversation. They do not imply Android runtime validation.

## Archival policy

- Keep **patch sources, build scripts, tests, SHA-256 manifests, and release notes** in GitHub.
- Keep full modified Spotify APK binaries in **private storage**, where licensing and access controls can be reviewed. For versioned private archives, use a separate private repository with Git LFS or a private file store rather than this public code repository.
- Never commit the signing key or Spotify access/refresh tokens. Back up the signing key securely outside GitHub.
- Retain one known-working rollback APK locally before testing an experimental build.
- Only label a build *runtime validated* after installation, sign-in, playback, Now Playing, swipe/scroll and phone/foldable tests.

## v1.7 engineering notes

The v1.7 prototype uses an Android artwork-only pager and a runtime installer that fails closed when an artwork-only view cannot be identified. This avoids hiding Spotify containers that may own the playback seekbar. Its Android source and CI compile checks are in [experiments/spotify-carousel-v1.7](../experiments/spotify-carousel-v1.7).

This project is an independent personal experiment. It is not endorsed by Spotify.
