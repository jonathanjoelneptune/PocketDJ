import type { BeatTiming } from "./beatClock";

/**
 * The speaker drivers use the same *song-position* beat clock as DJ NES.
 * They ALWAYS react once per beat; the head's optional half/double-time
 * subdivisions do not affect this oscillator.
 */
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const wrap01 = (n: number): number => ((n % 1) + 1) % 1;

export function speakerBeatPhase(timing: BeatTiming): number {
  const progress = Math.max(0, timing.trackProgressMs);
  const msPerBeat = 60_000 / clamp(timing.bpm || 96, 50, 240);
  const beats = timing.beatTimesMs;
  if (timing.phaseSource === "beat-map" && beats && beats.length >= 2) {
    // Locate the two *real* beats that enclose the playback position. The
    // spacing may differ slightly from the track's average BPM.
    let lo = 0, hi = beats.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (beats[mid] <= progress) lo = mid + 1;
      else hi = mid;
    }
    const prev = lo - 1;
    if (prev < 0) return wrap01((progress - beats[0]) / msPerBeat);
    if (prev >= beats.length - 1) return wrap01((progress - beats[beats.length - 1]) / msPerBeat);
    const width = beats[prev + 1] - beats[prev];
    if (width >= 180 && width <= 2_000) return clamp((progress - beats[prev]) / width, 0, 1);
    // Invalid beat gap: use a stable grid anchored to the last good marker.
    return wrap01((progress - beats[prev]) / msPerBeat);
  }
  return wrap01((progress - timing.beatOffsetMs) / msPerBeat);
}

/**
 * One smooth expansion per beat. Begin to move just before the beat, hit
 * maximum size exactly on the beat, recoil for ~38% of the beat, then rest.
 * This replaces the old CSS keyframes' extra midway "second bump".
 */
export function speakerPulseEnvelope(phase: number): number {
  const p = wrap01(phase);
  const smooth = (t: number) => {
    const x = clamp(t, 0, 1);
    return x * x * (3 - 2 * x);
  };
  if (p < 0.38) return 1 - smooth(p / 0.38);
  if (p <= 0.86) return 0;
  return smooth((p - 0.86) / 0.14);
}

export function speakerPulseScale(timing: BeatTiming, intensity: number): number {
  const amount = clamp(Number.isFinite(intensity) ? intensity : 0, 0, 1);
  const rest = 0.965;
  const peak = 1.025 + amount * 0.095;
  return rest + (peak - rest) * speakerPulseEnvelope(speakerBeatPhase(timing));
}
