# Pocket DJ Lyrics Render Signature Cache Build Fix

<span style="color:#16a34a;">Fixed:</span> Added the missing module-level `lastLyricsRenderSignature` variable in `src/ui.ts`.

<span style="color:#16a34a;">Fixed:</span> Resolves the TypeScript build errors caused by `updateLyricsCeiling()` referencing the render cache before it was declared.

<span style="color:#16a34a;">Preserved:</span> All files from the latest lyrics defaults, animation, font, and screen-facing active lyric batch are included with this fix applied.
