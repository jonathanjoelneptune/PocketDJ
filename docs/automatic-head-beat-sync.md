# Automatic DJ NES beat synchronization (no tap-to-sync)

## What changed

- Head nods follow the **Spotify track timeline** instead of a timer started
  when the animation becomes visible.
- The Spotify playback response is timestamped near its request/response
  midpoint. A small bounded clock correction filters polling jitter without
  chasing each 2.5-second response.
- A seek, track change, pause/resume, or significant resynchronization resets
  the nod phrase from neutral. Skipped animation frames do not replay old nods.
- A nod **reaches** its target position on the beat. Its eased travel occupies
  about 35% of the interval preceding the beat, then the head holds briefly.
- The six equal-probability two-position nod pairings, occasional flourishes,
  and slow changes between half-beat, beat, and every-other-beat patterns are
  preserved.
- No head nods during record-change cinematics, Spotify DJ speaking, idle,
  paused, or manual audition. The Room → DJ Animation toggle remains **Off**
  by default and retains its explicit saved value.

## Automatic tempo/phase source priority

1. **Spotify Audio Analysis** (when authorized): tempo plus precise beat
   timestamps from the song; interpolated midpoints support double-time nods.
   This is the only fully automatic source here that can provide an actual
   song-specific beat phase.
2. **Spotify Audio Features** (when authorized): tempo only, no beat offset.
3. **GetSongBPM** title/artist matched lookup: tempo only; available to desktop
   embed mode without a separate Spotify OAuth token.
4. **Local estimate / 96 BPM fallback**: used when no measured tempo is
   available. This is explicitly labelled estimated/fallback, not beat-locked.

The app keeps an in-memory per-track cache of Spotify beat metadata. If Spotify
rejects an Analysis/Features endpoint with 403, that endpoint is skipped for the
remainder of the session to avoid a barrage of denied requests.

## Limits and interpretation

- **Tempo is not phase**. With BPM only, head nods follow a deterministic song-
  relative grid anchored at 0 ms. Their cadence stays stable across polls and
  after a seek, but there is no guarantee that this grid matches the first
  audible beat. Do not call a BPM-only grid "exactly on beat".
- Spotify restricts Audio Analysis/Features to particular approved developer
  applications. These APIs may be unavailable. The fallback stays automatic;
  there is no tapping or manual calibration.
- The embedded desktop view cannot call authenticated Spotify Audio Analysis
  without an OAuth session, so it relies on GetSongBPM (when matched) and the
  track's reported progress.
- Precise output also depends on the latency and stability of the Spotify
  playback position supplied to the browser. The app does not capture audio.
- On variable-tempo tracks, a permitted beat map handles drift better than a
  single fixed BPM.

## Diagnostics

The animation debug panel reports:
- `beat clock: beat-map / spotify-analysis / <BPM>`: a real song beat map
- `beat clock: tempo-grid / getsongbpm / <BPM>`: stable BPM, unknown beat phase
- `beat clock: tempo-grid / estimate / <BPM>`: approximate BPM and phase

## Validation

`pnpm run test:beat` verifies no timer drift between polls, small latency
corrections, seeks/new songs/pause-resume resets, beat-map half/double-time
event selection, and deterministic BPM-grid fallback. CI runs these tests
before the normal Vite/TypeScript build and production deployment.

Manual review is still necessary on desktop and Android with songs whose beat
maps can and cannot be retrieved.
