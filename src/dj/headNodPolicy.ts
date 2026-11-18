/** Keep the first/last fifteen seconds head-nod free.
 * Every eligible middle phrase nods. About 65% retain full travel; the
 * remaining ~35% dip smoothly to a track-specific intensity between
 * 25% and 100%. The beat clock, pose choices, and scratch/vinyl layers
 * do not change. Phrase-based variation avoids per-frame randomness.
 */
export const NOD_QUIET_START_MS = 15_000;
export const NOD_QUIET_END_MS = 15_000;
export const NOD_PHRASE_MS = 12_000;
/** Fraction of phrases that use full head-bob amplitude, not an on/off duty cycle. */
export const NOD_DUTY = 0.65;
export const NOD_MIN_INTENSITY = 0.25;
export const NOD_INTENSITY_RAMP_MS = 2_000;

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

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const smoothstep = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

/**
 * Amplitude multiplier for the existing beat-aligned four-position head rig.
 * 0: intro/outro/invalid track; (0, 1]: always nod during eligible playback.
 * Reduced phrases fade from full intensity to a variable softer nod and back
 * to full intensity so adjacent 12-second phrases do not snap the head.
 */
export function headNodIntensityDuringTrack(
  trackKey: string,
  progressMs: number,
  durationMs: number,
): number {
  if (!trackKey || !Number.isFinite(progressMs) || progressMs < NOD_QUIET_START_MS) return 0;
  // Unknown duration: honor the start quiet zone; do not guess the ending.
  if (Number.isFinite(durationMs) && durationMs > 0 &&
      durationMs - progressMs <= NOD_QUIET_END_MS) return 0;

  const eligibleProgress = progressMs - NOD_QUIET_START_MS;
  const phrase = Math.floor(eligibleProgress / NOD_PHRASE_MS);
  if (phraseChoice(trackKey, phrase) < NOD_DUTY) return 1;

  // A separate, stable random value chooses how subtle this phrase becomes.
  const trough = NOD_MIN_INTENSITY +
    (1 - NOD_MIN_INTENSITY) * phraseChoice(trackKey + '|amplitude', phrase);
  const withinPhrase = eligibleProgress - phrase * NOD_PHRASE_MS;
  const enter = smoothstep(withinPhrase / NOD_INTENSITY_RAMP_MS);
  const exit = smoothstep((NOD_PHRASE_MS - withinPhrase) / NOD_INTENSITY_RAMP_MS);
  return 1 - (1 - trough) * enter * exit;
}

/** Kept for callers that need eligibility rather than a motion multiplier. */
export function shouldNodDuringTrack(
  trackKey: string,
  progressMs: number,
  durationMs: number,
): boolean {
  return headNodIntensityDuringTrack(trackKey, progressMs, durationMs) > 0;
}

export type HeadNodTransform = { x: number; y: number; tilt: number };
/** Scale the existing calibrated head transform, never the timing or pose. */
export function scaleHeadNodMotion(motion: HeadNodTransform, intensity: number): HeadNodTransform {
  const factor = Number.isFinite(intensity) ? clamp01(intensity) : 0;
  return { x: motion.x * factor, y: motion.y * factor, tilt: motion.tilt * factor };
}
