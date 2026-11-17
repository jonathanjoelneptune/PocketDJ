/**
 * Family-specific detached arm animation, sharing the head-bob controller's
 * full-sprite coordinates, performance beat grid, and 2D canvas compositor.
 *
 * Failed/missing rig assets never replace the original pose animation.
 * All bitmaps decode before a family becomes available.
 */
import type { BeatTiming } from './beatClock';

export type ScratchArmTransform = { x: number; y: number; tilt: number };
export type ScratchArmSide = 'left' | 'right';
export type ScratchRigJson = {
  schema: string;
  family: string;
  sourceCanvas: { width: number; height: number };
  pivots: Record<ScratchArmSide, { x: number; y: number }>;
  scratchFrames: Record<ScratchArmSide, ScratchArmTransform[]>;
};
export type ScratchRigMotion = {
  left: ScratchArmTransform;
  right: ScratchArmTransform;
  moving: boolean;
};
export type DecodedScratchRig = {
  rig: ScratchRigJson;
  body: HTMLImageElement;
  left: HTMLImageElement;
  right: HTMLImageElement;
  /** Maps legacy pose names to the same fixed body; no per-frame body swaps. */
  bodies: Map<string, HTMLImageElement>;
};
export const SCRATCH_FAMILIES: Record<string, readonly string[]> = {
  a10: ['a10.png', 'a10-2.png'],
  a4: ['a4.png', 'a4-2.png'],
  a14: ['a14.png', 'a14-2.png'],
  a44: ['a44.png', 'a44-2.png', 'a44-3.png'],
  a47: ['a47.png', 'a47-2.png', 'a47-3.png'],
  a48: ['a48.png', 'a48-2.png', 'a48-3.png'],
};
export const SCRATCH_SEQUENCE = [0, 1, 0, 2, 0, 3, 0] as const;
const W = 582;
const H = 652;
const ROOT = './assets/DJ%20NES%20Pose%20Library/Scratch%20Rig%20lab/';
const MOVE_PORTION_OF_STEP = 0.42; // Arrive on the next beat, like head nods.
const rest = (): ScratchArmTransform => ({ x: 0, y: 0, tilt: 0 });
const clamp = (n: number): number => Math.max(0, Math.min(1, n));
const ease = (t: number): number => (1 - Math.cos(Math.PI * clamp(t))) / 2;
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export function validateScratchRig(value: ScratchRigJson, family: string): boolean {
  if (!value || value.schema !== 'pocketdj-scratch-rig.v1' || value.family !== family ||
      value.sourceCanvas?.width !== W || value.sourceCanvas?.height !== H) return false;
  return (['left', 'right'] as const).every(side => {
    const pivot = value.pivots?.[side];
    const frames = value.scratchFrames?.[side];
    return pivot && Number.isFinite(pivot.x) && Number.isFinite(pivot.y) &&
      Array.isArray(frames) && frames.length === 4 &&
      frames.every(f => f && Number.isFinite(f.x) && Number.isFinite(f.y) &&
        Number.isFinite(f.tilt) && Math.abs(f.tilt) <= 90);
  });
}

/**
 * Pure playback-timed motion. We hold each pose, then glide during the last
 * 42% before the next beat. The node's head nod lands on the same boundary.
 * Every family owns its own calibrated 4-state arm transforms.
 */
export function scratchMotionAt(
  rig: ScratchRigJson,
  trackProgressMs: number,
  bpm: number,
  beatOffsetMs = 0,
  beatTimesMs: readonly number[] | null = null,
): ScratchRigMotion {
  const safeBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : 96;
  const interval = 60_000 / safeBpm;
  let beat = 0;
  let phase = 0;
  if (beatTimesMs && beatTimesMs.length >= 2 &&
      trackProgressMs >= beatTimesMs[0] && trackProgressMs < beatTimesMs[beatTimesMs.length - 1]) {
    // Binary search keeps this inexpensive even with a full song's beat map.
    let low = 0;
    let high = beatTimesMs.length - 1;
    while (low + 1 < high) {
      const mid = (low + high) >>> 1;
      if (beatTimesMs[mid] <= trackProgressMs) low = mid;
      else high = mid;
    }
    beat = low;
    phase = (trackProgressMs - beatTimesMs[low]) /
      Math.max(1, beatTimesMs[low + 1] - beatTimesMs[low]);
  } else {
    const position = (Number.isFinite(trackProgressMs) ? trackProgressMs : 0) -
      (Number.isFinite(beatOffsetMs) ? beatOffsetMs : 0);
    beat = Math.floor(position / interval);
    phase = ((position % interval) + interval) % interval / interval;
  }
  const sequenceLength = SCRATCH_SEQUENCE.length - 1;
  const index = ((beat % sequenceLength) + sequenceLength) % sequenceLength;
  const from = SCRATCH_SEQUENCE[index];
  const to = SCRATCH_SEQUENCE[index + 1];
  const progress = ease((phase - (1 - MOVE_PORTION_OF_STEP)) / MOVE_PORTION_OF_STEP);
  const interpolate = (side: ScratchArmSide): ScratchArmTransform => {
    const a = rig.scratchFrames[side][from] ?? rest();
    const b = rig.scratchFrames[side][to] ?? rest();
    return { x: mix(a.x, b.x, progress), y: mix(a.y, b.y, progress),
      tilt: mix(a.tilt, b.tilt, progress) };
  };
  return { left: interpolate('left'), right: interpolate('right'),
    moving: progress > 0 && progress < 1 };
}

async function decodeImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => {
      if (image.naturalWidth !== W || image.naturalHeight !== H)
        reject(new Error('Scratch rig image dimensions invalid: ' + url));
      else resolve();
    };
    image.onerror = () => reject(new Error('Missing scratch rig asset: ' + url));
    image.src = url;
  });
  if (image.decode) await image.decode().catch(() => undefined);
  return image;
}

export class ScratchRigLibrary {
  private readonly ready = new Map<string, DecodedScratchRig>();
  private readonly pending = new Set<string>();
  private readonly failed = new Set<string>();
  private readonly maxCachedFamilies = 2;
  private readonly disabled = new URLSearchParams(window.location.search).get('scratchRig') === '0';

  get(family: string): DecodedScratchRig | null {
    return this.disabled ? null : this.ready.get(family) ?? null;
  }

  ensure(family: string): void {
    if (this.disabled || !SCRATCH_FAMILIES[family] || this.ready.has(family) ||
        this.pending.has(family) || this.failed.has(family)) return;
    this.pending.add(family);
    void this.load(family)
      .catch(error => {
        this.failed.add(family);
        console.warn('Scratch rig unavailable; retaining legacy sprites:', error);
      })
      .finally(() => this.pending.delete(family));
  }

  private async load(family: string): Promise<void> {
    const root = ROOT + family + '/';
    const response = await fetch(root + 'scratch_rig.json', { cache: 'force-cache' });
    if (!response.ok) throw new Error(`Scratch rig ${family}: HTTP ${response.status}`);
    const rig = await response.json() as ScratchRigJson;
    if (!validateScratchRig(rig, family)) throw new Error('Malformed scratch rig ' + family);
    const [body, left, right] = await Promise.all([
      decodeImage(root + family + '_body.png'),
      decodeImage(root + family + '_arm_left.png'),
      decodeImage(root + family + '_arm_right.png'),
    ]);
    const bodies = new Map(SCRATCH_FAMILIES[family].map(frame => [frame, body]));
    this.ready.delete(family);
    this.ready.set(family, { rig, body, left, right, bodies });
    while (this.ready.size > this.maxCachedFamilies) {
      const first = this.ready.keys().next().value;
      if (first) this.ready.delete(first);
    }
  }
}

export function scratchMotionForPlayback(
  rig: ScratchRigJson,
  timing: BeatTiming | null,
  now: number,
): ScratchRigMotion {
  return scratchMotionAt(rig, timing?.trackProgressMs ?? now,
    timing?.bpm ?? 96, timing?.beatOffsetMs ?? 0, timing?.beatTimesMs ?? null);
}