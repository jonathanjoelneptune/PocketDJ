/**
 * Independent DJ NES head motion. Actual track-time beats drive the nod when
 * available; a BPM grid anchored to track progress is the automatic fallback.
 * The original full PNG remains visible until the new assets are decoded.
 */
import { createBeatEvents, nextBeatEvent, type BeatTiming } from "./beatClock";
type BobFrame = { enabled: boolean; x: number; y: number; tilt: number };
type HeadBobRig = {
  family: string;
  variants: string[];
  sourceCanvas: { width: number; height: number };
  rotationPivot: { x: number; y: number };
  headBobFrames: BobFrame[];
};
type DecodedRig = { rig: HeadBobRig; head: HTMLImageElement; bodies: Map<string, HTMLImageElement> };
type BobPair = readonly [number, number];
type HeadMotion = { x: number; y: number; tilt: number };
const REST_POSE: Readonly<HeadMotion> = { x: 0, y: 0, tilt: 0 };
const MOTION_PORTION_OF_STEP = 0.35; // Glide for 35% of the beat interval, then settle.
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const easeInOutSine = (progress: number): number => (1 - Math.cos(Math.PI * clamp01(progress))) / 2;
const mix = (from: number, to: number, t: number): number => from + (to - from) * t;

const ASSET_ROOT = './assets/DJ%20NES%20Pose%20Library/Head%20Bob%20lab/';
const FAMILIES: Record<string, readonly string[]> = {
  a10: ['a10.png', 'a10-2.png'],
  a4: ['a4.png', 'a4-2.png'],
  a14: ['a14.png', 'a14-2.png'],
  a44: ['a44.png', 'a44-2.png', 'a44-3.png'],
  a47: ['a47.png', 'a47-2.png', 'a47-3.png'],
  a48: ['a48.png', 'a48-2.png', 'a48-3.png'],
};
const FAMILY_BY_FRAME: Record<string, string> = {};
for (const [family, frames] of Object.entries(FAMILIES)) {
  for (const frame of frames) FAMILY_BY_FRAME[frame] = family;
}
// Equal eligibility for each of the six unordered two-position grooves.
const PAIRS: readonly BobPair[] = [
  [0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3],
];
const rand = (min: number, max: number): number => Math.floor(min + Math.random() * (max - min + 1));
const newPair = (previous?: BobPair): BobPair => {
  const choices = previous ? PAIRS.filter(p => p[0] !== previous[0] || p[1] !== previous[1]) : PAIRS;
  return choices[rand(0, choices.length - 1)];
};
const chooseRate = (): number => {
  const n = Math.random();
  return n < 0.22 ? 0.5 : n < 0.90 ? 1 : 2;
};
const loadImage = (url: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => {
    if (image.naturalWidth !== 582 || image.naturalHeight !== 652) {
      reject(new Error('Unexpected DJ head bob PNG size: ' + url));
      return;
    }
    // Decode before displaying the composite in Chrome/Android WebView.
    if (image.decode) void image.decode().then(() => resolve(image), () => resolve(image));
    else resolve(image);
  };
  image.onerror = () => reject(new Error('Missing DJ head bob PNG: ' + url));
  image.src = url;
});

export class HeadBobController {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly host: HTMLElement;
  private readonly pending = new Map<string, Promise<DecodedRig | null>>();
  private readonly ready = new Map<string, DecodedRig>();
  private activeFamily = '';
  private lastDrawn = '';
  private lastDrawnPosition = -1;
  private lastRenderWasMoving = false;
  private timingTrackKey = "";
  private timingRevision = "";
  private timingDiscontinuity = -1;
  private lastProgress = -1;
  private lastScheduledBoundary = Number.NEGATIVE_INFINITY;
  private cachedMap: readonly number[] | null = null;
  private cachedRate = 1;
  private cachedBeatEvents: readonly number[] = [];
  private eligibleLastTick = false;
  private motionFrom: HeadMotion = { ...REST_POSE };
  private motionTo: HeadMotion = { ...REST_POSE };
  private motionStartedProgress = 0;
  private motionDurationMs = 1;
  private position = 0;
  private pair: BobPair = newPair();
  private pairStepsRemaining = 0;
  private flourish: number[] = [];
  private rate = 1;
  private rateChangeAfter = 0;
  private beatSteps = 0;
  private readonly maxCachedFamilies = 2;
  private visible = false;

  constructor(originalSprite: HTMLImageElement) {
    this.host = originalSprite.parentElement as HTMLElement;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'djHeadBobCanvas';
    this.canvas.className = 'dj-frame-img dj-nes-frame-img dj-headbob-canvas';
    this.canvas.width = 582;
    this.canvas.height = 652;
    this.canvas.setAttribute('aria-hidden', 'true');
    this.ctx = this.canvas.getContext('2d', { alpha: true })!;
    this.ctx.imageSmoothingEnabled = false;
    originalSprite.insertAdjacentElement('afterend', this.canvas);
    this.resetGroove();
  }

  /**
   * Scratch pose selection stays independent of head movement. Musical events
   * come from the sampled track timeline, never from a free-running wall timer.
   */
  update(frame: string, enabled: boolean, timing: BeatTiming | null, _now: number): void {
    const family = FAMILY_BY_FRAME[frame];
    if (!enabled || !family || !timing) {
      this.eligibleLastTick = false;
      this.timingTrackKey = "";
      this.lastRenderWasMoving = false;
      this.hide();
      return;
    }

    const progress = timing.trackProgressMs;
    const revision = `${timing.phaseSource}:${timing.bpm.toFixed(2)}:${timing.beatOffsetMs.toFixed(1)}:${timing.beatTimesMs?.length ?? 0}`;
    const resumedOrChanged = !this.eligibleLastTick ||
      timing.trackKey !== this.timingTrackKey ||
      timing.discontinuity !== this.timingDiscontinuity ||
      revision !== this.timingRevision ||
      (this.lastProgress >= 0 && (progress < this.lastProgress - 160 || progress - this.lastProgress > 2000));
    if (resumedOrChanged) {
      this.resetGroove();
      this.lastDrawn = "";
    }
    this.eligibleLastTick = true;
    this.timingTrackKey = timing.trackKey;
    this.timingRevision = revision;
    this.timingDiscontinuity = timing.discontinuity;
    this.lastProgress = progress;

    if (family !== this.activeFamily) {
      this.activeFamily = family;
      this.lastDrawn = "";
      this.lastDrawnPosition = -1;
      this.hide();
    }
    if (!this.ready.has(family)) {
      this.ensureFamily(family);
      this.hide();
      return;
    }
    const rig = this.ready.get(family)!;
    if (!rig.bodies.has(frame)) {
      this.hide();
      return;
    }

    // The destination head pose lands ON the beat. Starting the glide before
    // each beat, instead of on it, produces a more natural musical accent.
    const subdivisionMs = 60_000 / (timing.bpm * this.rate);
    const moveMs = Math.max(90, Math.min(280, subdivisionMs * MOTION_PORTION_OF_STEP));
    if (timing.beatTimesMs !== this.cachedMap || this.rate !== this.cachedRate) {
      this.cachedMap = timing.beatTimesMs;
      this.cachedRate = this.rate;
      this.cachedBeatEvents = timing.beatTimesMs ? createBeatEvents(timing.beatTimesMs, this.rate) : [];
    }
    const boundary = nextBeatEvent(timing, this.rate, progress, 42, this.cachedBeatEvents);
    if (boundary !== null &&
        boundary > this.lastScheduledBoundary + 35 &&
        progress >= boundary - moveMs &&
        progress <= boundary + 42) {
      const current = this.motionAt(progress);
      this.advanceGroove();
      const next = rig.rig.headBobFrames[this.position];
      if (next) {
        this.motionFrom = current;
        this.motionTo = { x: next.x, y: next.y, tilt: next.tilt };
        this.motionStartedProgress = boundary - moveMs;
        this.motionDurationMs = moveMs;
        this.lastScheduledBoundary = boundary;
      }
    }

    const moving = progress >= this.motionStartedProgress &&
      progress < this.motionStartedProgress + this.motionDurationMs;
    if (frame !== this.lastDrawn || this.position !== this.lastDrawnPosition ||
        moving || this.lastRenderWasMoving || !this.visible) {
      this.render(rig, frame, this.motionAt(progress));
    }
    // Paint once after easing ends to hit the exact approved destination pose.
    this.lastRenderWasMoving = moving;
    if (!this.visible) {
      this.visible = true;
      this.host.classList.add("dj-headbob-active");
    }
  }

  private resetGroove(): void {
    this.pair = newPair();
    this.position = 0;
    this.pairStepsRemaining = rand(12, 30);
    this.flourish = [];
    this.rate = chooseRate();
    this.rateChangeAfter = rand(32, 96);
    this.beatSteps = 0;
    this.motionFrom = { ...REST_POSE };
    this.motionTo = { ...REST_POSE };
    this.motionStartedProgress = Number.NEGATIVE_INFINITY;
    this.motionDurationMs = 1;
    this.lastRenderWasMoving = false;
    this.lastDrawnPosition = -1;
    this.lastScheduledBoundary = Number.NEGATIVE_INFINITY;
    this.lastProgress = -1;
  }

  private motionAt(progress: number): HeadMotion {
    const fraction = (progress - this.motionStartedProgress) / this.motionDurationMs;
    const t = easeInOutSine(fraction);
    return {
      x: mix(this.motionFrom.x, this.motionTo.x, t),
      y: mix(this.motionFrom.y, this.motionTo.y, t),
      tilt: mix(this.motionFrom.tilt, this.motionTo.tilt, t),
    };
  }

  private advanceGroove(): void {
    this.beatSteps++;
    this.pairStepsRemaining--;
    if (this.flourish.length) {
      this.position = this.flourish.shift()!;
      return;
    }
    if (this.pairStepsRemaining <= 0) {
      this.pair = newPair(this.pair);
      this.pairStepsRemaining = rand(12, 30);
      if (this.beatSteps >= this.rateChangeAfter) {
        // Hold a groove for dozens of notes; change the subdivision only on a phrase boundary.
        this.rate = chooseRate();
        this.rateChangeAfter = this.beatSteps + rand(32, 96);
      }
      // Most of the time alternate just two poses. Rarely play a 3–4-move flourish.
      if (Math.random() < 0.16) {
        let last = this.position;
        for (let i = 0, count = rand(3, 4); i < count; i++) {
          const choices = [0, 1, 2, 3].filter(n => n !== last);
          last = choices[rand(0, choices.length - 1)];
          this.flourish.push(last);
        }
        this.position = this.flourish.shift()!;
        return;
      }
    }
    this.position = this.position === this.pair[0] ? this.pair[1] : this.pair[0];
  }

  private render(loaded: DecodedRig, frame: string, motion: HeadMotion): void {
    const { rig, head, bodies } = loaded;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bodies.get(frame)!, 0, 0);
    ctx.save();
    ctx.translate(rig.rotationPivot.x + motion.x, rig.rotationPivot.y + motion.y);
    ctx.rotate(motion.tilt * Math.PI / 180);
    ctx.translate(-rig.rotationPivot.x, -rig.rotationPivot.y);
    ctx.drawImage(head, 0, 0);
    ctx.restore();
    this.lastDrawn = frame;
    this.lastDrawnPosition = this.position;
  }

  private ensureFamily(family: string): void {
    if (this.pending.has(family)) return;
    const promise = (async (): Promise<DecodedRig | null> => {
      try {
        const root = ASSET_ROOT + family + '/';
        const response = await fetch(root + 'head_bob_rig.json', { cache: 'force-cache' });
        if (!response.ok) throw new Error('Head bob rig ' + family + ': HTTP ' + response.status);
        const rig = await response.json() as HeadBobRig;
        if (rig.family !== family || rig.sourceCanvas.width !== 582 || rig.sourceCanvas.height !== 652 ||
            !FAMILIES[family].every(f => rig.variants.includes(f)) ||
            rig.headBobFrames.length !== 4 || rig.headBobFrames.some(f => !f.enabled)) {
          throw new Error('Invalid head bob rig: ' + family);
        }
        const [head, ...images] = await Promise.all([
          loadImage(root + family + '_head_shared.png'),
          ...FAMILIES[family].map(f => loadImage(root + f.slice(0, -4) + '_body.png')),
        ]);
        const bodies = new Map(FAMILIES[family].map((f, i) => [f, images[i]]));
        const result = { rig, head, bodies };
        this.ready.delete(family);
        this.ready.set(family, result);
        while (this.ready.size > this.maxCachedFamilies) {
          const oldest = this.ready.keys().next().value;
          if (oldest) this.ready.delete(oldest);
        }
        return result;
      } catch (error) {
        console.warn('Head bob unavailable; retaining original DJ sprite:', error);
        return null;
      }
    })();
    this.pending.set(family, promise);
    void promise.finally(() => {
      // Successful rigs can be evicted and reloaded; failed ones won't retry each frame.
      if (this.ready.has(family)) this.pending.delete(family);
    });
  }

  private hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.host.classList.remove('dj-headbob-active');
  }
}
