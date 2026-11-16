# Fluid scratch transitions and beat-locked speaker drivers

## Scratch transitions
- The approved source PNGs, scratched-hand pose order, and independent DJ head
  timing remain unchanged.
- Short body-only pixel transitions now use **quintic smootherstep** easing and
  span about **62% of each scratch frame hold** (maximum 190 ms), compared with
  the previous 42% / 115 ms maximum. The settled endpoint stays visible before
  the next source frame.
- The changed-pixel regions for recurring pose pairs are cached with an 18-pair
  LRU bound. The first encounter computes a patch; later repeats reuse it,
  reducing synchronous canvas readback work during rapid scratch loops.
- The original full-frame render remains the fallback if assets/readback fail.
  No new painted arm frames were created: these remain transparent-alpha
  crossfades between the existing hand illustrations, not geometric arm tweening.

## Speaker driver pulses
- Both speaker drivers share the exact `BeatTiming` snapshot the DJ head uses,
  from `PlaybackBeatClock`. No extra Spotify requests are needed.
- When Spotify Audio Analysis beat timestamps are available, the driver pulse
  follows the actual spacing of those beats, including small variations in BPM.
- When only a BPM is available, it uses the same *song-progress-anchored*
  tempo grid as the head (not an independently started CSS animation). The
  unknown beat offset may still limit true audio alignment.
- Driver frequency is **always one pulse per beat**, independent of whether
  the head has picked half-time or double-time nodding.
- The new envelope peaks exactly at the beat, recoils during the following
  ~38% of the interval, rests, and anticipates the next beat for ~14% of the
  interval. The former 48%-of-cycle extra bump is removed.
- Pulse intensity and driver size/placement controls are retained.
- Pausing/disabling tempo sync removes inline transforms and restores existing
  non-synchronized fallback behavior. No changes to mixer LEDs or room lights.

## Technical choice
The speaker uses a clock-derived `transform: scale(...)` on the **two driver
elements only**, not a per-frame global CSS variable that could invalidate
the whole room. This is intentional for desktop and Android WebView performance.
The JS controls are reconciled on the same `requestAnimationFrame` tick as
the DJ renderer. If animation falls behind, we sample current song progress,
not replay a backlog of missed beats.

## Checks
`pnpm run test:animation` verifies:
1. Song-time clock resynchronization, seeks, pauses, and tempo grids
2. Scratch opacity blending, easing, and duration bounds
3. One speaker peak per beat, actual Spotify beat-map phase, stable BPM-grid
   phase, no midway second pulse, and pulse amount scaling

The PR check runs these tests, regenerates approved head rig layers, and runs
the full TypeScript / Vite build.

## Manual playback checks
Compare A10 and A44 during multiple scratches; hand transitions should appear
longer and smoother without an obvious ghosted double image. Toggle head nods
Off to verify scratch interpolation still runs. Compare speakers on slow, mid,
and fast songs: each driver should hit its largest size on each beat, with no
random half/double beat pulse. Verify both drivers stop on pause and resume on
the current song beat; check Android WebView frame pacing and song changes.
