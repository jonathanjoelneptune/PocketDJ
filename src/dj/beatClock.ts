import type { NormalizedTrack } from "../state/types";

/**
 * Spotify polling supplies progress_ms at a sample time, not a beat clock.
 * Keep one gently corrected track-time anchor so a new poll cannot restart a
 * head nod. A large jump is treated as a seek, and resets the groove.
 */
export type BeatMetadata = {
  tempoBpm: number;
  beatOffsetMs: number | null;
  beatTimesMs: number[] | null;
  source: "spotify-analysis" | "spotify-features";
};

export type BeatTiming = {
  trackKey: string;
  trackProgressMs: number;
  bpm: number;
  beatOffsetMs: number;
  beatTimesMs: readonly number[] | null;
  phaseSource: "beat-map" | "tempo-grid";
  tempoSource: string;
  discontinuity: number;
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

export class PlaybackBeatClock {
  private key: string | null = null;
  private wasPlaying = false;
  private anchorProgress = 0;
  private anchorTime = 0;
  private lastObservationTime = -1;
  private discontinuity = 0;

  read(
    track: NormalizedTrack,
    bpm: number,
    tempoSource: string,
    metadata: BeatMetadata | null,
    now: number,
  ): BeatTiming | null {
    if (!track.isPlaying || !track.trackId || track.source === "none") {
      this.wasPlaying = false;
      return null;
    }

    const key = `${track.source}:${track.trackId}`;
    const observedTime = clamp(
      Number.isFinite(track.updatedAt) ? track.updatedAt : now,
      0,
      now,
    );
    const observedProgress = Math.max(0, Number.isFinite(track.progressMs) ? track.progressMs : 0);
    const needsReset = !this.wasPlaying || this.key !== key || observedTime < this.lastObservationTime;

    if (needsReset) {
      this.key = key;
      this.wasPlaying = true;
      this.anchorProgress = observedProgress;
      this.anchorTime = observedTime;
      this.lastObservationTime = observedTime;
      this.discontinuity++;
    } else if (observedTime !== this.lastObservationTime) {
      const predictedProgress = this.anchorProgress + (observedTime - this.anchorTime);
      const error = observedProgress - predictedProgress;
      if (Math.abs(error) >= 750) {
        // Genuine seek or large playback correction. Re-lock immediately.
        this.anchorProgress = observedProgress;
        this.anchorTime = observedTime;
        this.discontinuity++;
      } else {
        // Small latency or polling jitter: correct slowly without wobbling every nod.
        this.anchorProgress += clamp(error * 0.2, -40, 40);
      }
      this.lastObservationTime = observedTime;
    }

    const measuredBpm = metadata?.tempoBpm;
    const effectiveBpm = Number.isFinite(measuredBpm) && measuredBpm! > 0
      ? measuredBpm!
      : bpm;
    const safeBpm = clamp(Number.isFinite(effectiveBpm) ? effectiveBpm : 96, 50, 240);
    const progress = this.anchorProgress + Math.max(0, now - this.anchorTime);
    const duration = track.durationMs > 0 ? track.durationMs : Number.POSITIVE_INFINITY;
    const hasMap = Boolean(metadata?.beatTimesMs && metadata.beatTimesMs.length >= 4);
    return {
      trackKey: key,
      trackProgressMs: clamp(progress, 0, duration),
      bpm: safeBpm,
      beatOffsetMs: metadata?.beatOffsetMs ?? 0,
      beatTimesMs: hasMap ? metadata!.beatTimesMs : null,
      phaseSource: hasMap ? "beat-map" : "tempo-grid",
      tempoSource: metadata?.source ?? tempoSource,
      discontinuity: this.discontinuity,
    };
  }
}

/** Times of the musical events the DJ may respond to. Every other beat uses
 * alternate beats, every beat uses the whole map, and double time also uses
 * halfway points between adjacent measured beats.
 */
export function createBeatEvents(beats: readonly number[], rate: number): number[] {
  if (beats.length < 2) return [];
  if (rate === 0.5) return beats.filter((_, index) => index % 2 === 0);
  if (rate !== 2) return [...beats];
  const events: number[] = [];
  for (let i = 0; i < beats.length; i++) {
    events.push(beats[i]);
    if (i + 1 < beats.length) events.push((beats[i] + beats[i + 1]) / 2);
  }
  return events;
}

/**
 * Find the closest upcoming beat or subdivision without creating a free-running
 * timer. Small lateness is tolerated for imperfect RAF scheduling.
 */
export function nextBeatEvent(
  timing: BeatTiming,
  rate: number,
  progressMs: number,
  allowLateMs = 42,
  beatEvents?: readonly number[],
): number | null {
  const threshold = progressMs - allowLateMs;
  if (timing.phaseSource === "beat-map" && beatEvents && beatEvents.length > 0) {
    let lo = 0;
    let hi = beatEvents.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (beatEvents[mid] < threshold) lo = mid + 1;
      else hi = mid;
    }
    if (lo < beatEvents.length) return beatEvents[lo];
    // Map has ended. Fall through to the last-known-tempo grid.
  }
  const intervalMs = 60_000 / (timing.bpm * rate);
  const offset = timing.beatOffsetMs;
  const index = Math.max(0, Math.ceil((threshold - offset) / intervalMs));
  return offset + index * intervalMs;
}
