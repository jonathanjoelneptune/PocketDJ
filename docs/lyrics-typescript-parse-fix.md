# Pocket DJ Lyrics TypeScript Parse Fix

<span style="color:#16a34a;">Fixed:</span> `parseLrc()` now builds a typed `LyricLine[]` directly instead of mapping to nullable values and filtering with a type predicate.

<span style="color:#16a34a;">Fixed:</span> Resolves the TypeScript build errors in `src/lyrics/lyricsClient.ts` around nullable lyric lines and `timeMs` typing.
