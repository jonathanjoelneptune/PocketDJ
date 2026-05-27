# Pocket DJ Verification and Local Storage Defaults Fix

<span style="color:#16a34a;">Verified:</span> The uploaded `PocketDJ-main.zip` did not contain the latest lyrics implementation. Its `src/main.ts`, `src/ui.ts`, and `src/styles.css` were older files with no lyrics integration or room utility logic.

<span style="color:#16a34a;">Fixed:</span> This package re-includes the latest lyrics implementation files and the Spotify playback-control client required by the latest `main.ts` imports.

<span style="color:#16a34a;">Fixed:</span> Added a room utility settings version so old browser-saved lyric utility values cannot silently override the new shipped lyrics defaults.

<span style="color:#16a34a;">Changed:</span> Existing saved speaker/room utility values are preserved, but lyric-specific utility settings are reset to current defaults when the saved payload is from an older version.

<span style="color:#16a34a;">Preserved:</span> Lyrics defaults remain set to 11 lines, 12 px base font, Vertical marquee, Amber crisp active lyric, and Clean readable inactive lyrics.
