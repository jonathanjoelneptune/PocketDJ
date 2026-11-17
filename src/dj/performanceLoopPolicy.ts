/** Selection policy for active playback DJ poses.
 * Head nods remain beat-driven; full-body poses change on longer phrases.
 * The last performance type survives short record-change cinematics.
 */
export type PerformancePose = { id: string; kind: "quick" | "vibe" };
export const VIBE_PROBABILITY = 0.14;
export const VIBE_MIN_MS = 27_000;
export const VIBE_MAX_MS = 33_000;
export const SCRATCH_MIN_MS = 16_000;
export const SCRATCH_MAX_MINIMUM_MS = 28_000;

const sampleIndex = (length: number, random: () => number): number =>
  Math.min(length - 1, Math.max(0, Math.floor(random() * length)));

export function choosePerformancePose<T extends PerformancePose>(
  scratch: readonly T[],
  vibe: readonly T[],
  previous: PerformancePose | null,
  random: () => number = Math.random,
): T {
  if (scratch.length === 0 && vibe.length === 0) throw new Error("No DJ performance poses");
  // A standing performance must always be followed by scratching.
  const chooseVibe = scratch.length === 0 ||
    (previous?.kind !== "vibe" && vibe.length > 0 && random() < VIBE_PROBABILITY);
  const pool = chooseVibe ? vibe : scratch;
  const fresh = pool.filter(loop => loop.id !== previous?.id);
  const candidates = fresh.length ? fresh : pool;
  return candidates[sampleIndex(candidates.length, random)];
}

export function performancePoseHoldMs(
  kind: "quick" | "vibe",
  configuredMax: number,
  random: () => number = Math.random,
): number {
  const min = kind === "vibe" ? VIBE_MIN_MS : SCRATCH_MIN_MS;
  const max = kind === "vibe" ? VIBE_MAX_MS :
    Math.max(SCRATCH_MAX_MINIMUM_MS, configuredMax);
  return min + Math.floor(Math.max(0, Math.min(0.999999999, random())) * (max - min + 1));
}
