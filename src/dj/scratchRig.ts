/**
 * Family-specific detached arm animation, sharing the head-bob controller's
 * full-sprite coordinates and 2D canvas compositor.
 *
 * Failed/missing rig assets never replace the original pose animation.
 * All bitmaps decode before a family becomes available.
 */
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
const W = 582;
const H = 652;
const ROOT = './assets/DJ%20NES%20Pose%20Library/Scratch%20Rig%20lab/';
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
 * Follow the existing DjController scratch loops. They already choose
 * unpredictable frame holds, alternate quick motions with pauses, and make
 * only some durations tempo-aware. Unlike head nods, arms do not beat-lock.
 */
export function scratchPositionForFrame(
  family: string, frame: string, random: () => number = Math.random,
): number {
  if (frame === family + '.png') return 0;
  if (frame === family + '-2.png') {
    // Two-pose loops gain occasional calibrated accents beyond Scratch 1.
    if (SCRATCH_FAMILIES[family]?.length === 2) {
      const choice = random();
      return choice < 0.78 ? 1 : choice < 0.93 ? 2 : 3;
    }
    return random() < 0.13 ? 3 : 1;
  }
  if (frame === family + '-3.png') return random() < 0.13 ? 3 : 2;
  return 0;
}

type ArmPair = Pick<ScratchRigMotion, 'left' | 'right'>;
const copy = (transform: ScratchArmTransform): ScratchArmTransform => ({ ...transform });
const restPair = (): ArmPair => ({ left: rest(), right: rest() });

/** Smooth arm transforms triggered by legacy scratch-frame changes, not beats. */
export class ScratchGrooveController {
  private family = '';
  private frame = '';
  private from: ArmPair = restPair();
  private to: ArmPair = restPair();
  private startedAt = 0;
  private durationMs = 0;
  private readonly random: () => number;
  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  reset(): void {
    this.family = '';
    this.frame = '';
    this.from = restPair();
    this.to = restPair();
    this.startedAt = 0;
    this.durationMs = 0;
  }

  update(rig: ScratchRigJson, frame: string, now: number, remainingHoldMs: number): ScratchRigMotion {
    const time = Number.isFinite(now) ? now : 0;
    if (rig.family !== this.family || time < this.startedAt) {
      this.reset();
      this.family = rig.family;
    }
    if (frame !== this.frame) {
      // New gestures begin from the actual current arm position. A fast
      // scratch can interrupt another without snapping or ghosting.
      const current = this.sample(time);
      const index = scratchPositionForFrame(rig.family, frame, this.random);
      const target: ArmPair = {
        left: copy(rig.scratchFrames.left[index] ?? rig.scratchFrames.left[0]),
        right: copy(rig.scratchFrames.right[index] ?? rig.scratchFrames.right[0]),
      };
      const first = this.frame === '';
      this.frame = frame;
      this.from = first ? target : { left: copy(current.left), right: copy(current.right) };
      this.to = target;
      this.startedAt = time;
      // The source loop chooses random 120–640ms holds with a loose BPM
      // influence. Vary the travel portion without scheduling to beat edges.
      const hold = Number.isFinite(remainingHoldMs) ? Math.max(0, remainingHoldMs) : 260;
      this.durationMs = first ? 0 : Math.min(230,
        Math.max(75, hold * (0.48 + this.random() * 0.19)));
    }
    return this.sample(time);
  }

  private sample(now: number): ScratchRigMotion {
    const t = this.durationMs <= 0 ? 1 : clamp((now - this.startedAt) / this.durationMs);
    const progress = ease(t);
    const interpolate = (side: ScratchArmSide): ScratchArmTransform => {
      const a = this.from[side], b = this.to[side];
      return { x: mix(a.x, b.x, progress), y: mix(a.y, b.y, progress),
        tilt: mix(a.tilt, b.tilt, progress) };
    };
    return {
      left: interpolate('left'),
      right: interpolate('right'),
      moving: t < 1 && (['left', 'right'] as const).some(side => (
        this.from[side].x !== this.to[side].x ||
        this.from[side].y !== this.to[side].y ||
        this.from[side].tilt !== this.to[side].tilt
      )),
    };
  }
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
