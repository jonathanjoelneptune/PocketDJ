# Pocket DJ Four-Point Lyric Poster Build Fix

<span style="color:#16a34a;">Fixed:</span> Added missing helper functions in `src/ui.ts`:
- `balanceWordsIntoRows`
- `weightedPosterLength`
- `lerp`

<span style="color:#16a34a;">Fixed:</span> Resolves the TypeScript build errors from the four-point no-clip update.

<span style="color:#16a34a;">Changed:</span> Room utility storage key bumped to `pocketdj-room-utility-v13` so the fixed four-point defaults load after deployment.
