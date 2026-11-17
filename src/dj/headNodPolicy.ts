/** Quiet starts/ends and a deterministic 65% head-nod duty cycle.
 * A decision lasts an entire 12-second phrase, avoiding per-frame flicker.
 * The scratching arms and vinyl records are intentionally not affected.
 */
export const NOD_QUIET_START_MS = 15_000;
export const NOD_QUIET_END_MS = 15_000;
export const NOD_PHRASE_MS = 12_000;
export const NOD_DUTY = 0.65;

/** Deterministic pseudorandom number in [0, 1) per track and phrase. */
function phraseChoice(trackKey: string, phraseIndex: number): number {
  const input = `${trackKey}|nod|${phraseIndex}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0x100000000;
}

export function shouldNodDuringTrack(
  trackKey: string,
  progressMs: number,
  durationMs: number,
): boolean {
  if (!trackKey || !Number.isFinite(progressMs) || progressMs < NOD_QUIET_START_MS) return false;
  // Unknown duration: honor the start quiet zone; do not guess the ending.
  if (Number.isFinite(durationMs) && durationMs > 0 &&
      durationMs - progressMs <= NOD_QUIET_END_MS) return false;
  const phrase = Math.floor((progressMs - NOD_QUIET_START_MS) / NOD_PHRASE_MS);
  return phraseChoice(trackKey, phrase) < NOD_DUTY;
}
