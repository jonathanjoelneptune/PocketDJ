/** Pre-roll the record-change animation in the final five seconds.
 * Requires a verified next-up track and decoded artwork. Without the queue,
 * retaining the existing post-change cinematic is safer than guessing a disc.
 */
export const EARLY_CINEMATIC_LEAD_MS = 5_000;
export type EarlyTrack = {
  trackId: string | null;
  durationMs: number;
  progressMs: number;
  isPlaying: boolean;
};
export type EarlyUpcoming = { trackId: string | null; albumArtUrl: string | null };

export function shouldBeginEarlyCinematic(
  current: EarlyTrack,
  incoming: EarlyUpcoming | null,
  nextArtworkReady: boolean,
): boolean {
  if (!current.isPlaying || !current.trackId || !incoming?.trackId ||
      incoming.trackId === current.trackId || !incoming.albumArtUrl ||
      !nextArtworkReady || !Number.isFinite(current.durationMs) ||
      !Number.isFinite(current.progressMs)) return false;
  const remaining = current.durationMs - current.progressMs;
  // Too late to complete the animation? Let the normal on-change path run.
  return current.durationMs >= 35_000 &&
    remaining > 300 && remaining <= EARLY_CINEMATIC_LEAD_MS;
}
