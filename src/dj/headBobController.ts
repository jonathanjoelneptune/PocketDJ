/**
 * Independent DJ NES head motion. Actual track-time beats drive the nod when
 * available; a BPM grid anchored to track progress is the automatic fallback.
 * The original full PNG remains visible until the new assets are decoded.
 */
import { createBeatEvents, nextBeatEvent, type BeatTiming } from "./beatClock";
import { blendSpritePixels, changedPixelBounds, scratchEase, scratchTransitionDuration, type PixelBounds } from "./scratchBlend";
import { VinylDeckStage } from "./vinylDecks";
import { scratchOffsetsFromArms, scratchOffsetsFromLegacy, EMPTY_SCRATCH } from "./vinylScratch";
import { ScratchGrooveController, ScratchRigLibrary, SCRATCH_FAMILIES, type DecodedScratchRig, type ScratchRigMotion } from "./scratchRig";
import type { VinylCinematicPhase } from "./vinylMath";
import type { NormalizedTrack } from "../state/types";
type BobFrame = { enabled: boolean; x: number; y: number; tilt: number };
type HeadBobRig = {
  family: string;
  variants: string[];
  sourceCanvas: { width: number; height: number };
  rotationPivot: { x: number; y: number };
  headBobFrames: BobFrame[];
};
type DecodedRig = { rig: HeadBobRig; head: HTMLImageElement; bodies: Map<string, HTMLImageElement> };
type ScratchBlend = {
  bounds: PixelBounds;
  from: Uint8ClampedArray;
  to: Uint8ClampedArray;
  working: ImageData;
};
type SpriteRenderMode = "detached-head" | "original" | "scratch-rig";
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
  // Calibrated single-frame standing poses. Their head uses the same beat
  // scheduler, while the body remains static. a36 stays reference-only.
  i10: ['i10.png'],
  i11: ['i11.png'],
  i12: ['i12.png'],
  a37: ['a37.png'],
  a38: ['a38.png'],
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
  private readonly rawPending = new Map<string, Promise<void>>();
  private readonly rawReady = new Map<string, Map<string, HTMLImageElement>>();
  private readonly rawFailed = new Set<string>();
  private readonly staticPoses = new Map<string, HTMLImageElement>();
  private readonly staticPending = new Set<string>();
  private readonly staticFailed = new Set<string>();
  private readonly vinyl = new VinylDeckStage();
  private readonly vinylCanvas: HTMLCanvasElement;
  private readonly vinylCtx: CanvasRenderingContext2D;
  // Continuous record-art plane above sprite/table pixels, below moving hands.
  private readonly discCanvas: HTMLCanvasElement;
  private readonly discCtx: CanvasRenderingContext2D;
  private readonly armCanvas: HTMLCanvasElement;
  private readonly armCtx: CanvasRenderingContext2D;
  private vinylLastRevision = -1;
  private readonly scratchRigs = new ScratchRigLibrary();
  private readonly scratchGroove = new ScratchGrooveController();
  private lastVinylRevision = -1;
  private readonly readCanvas: HTMLCanvasElement;
  private readonly readCtx: CanvasRenderingContext2D;
  private readonly scratchCanvas: HTMLCanvasElement;
  private readonly scratchCtx: CanvasRenderingContext2D;
  private activeFamily = '';
  private activeRenderMode: SpriteRenderMode = "detached-head";
  private lastScratchFrame = '';
  private scratchVinylFromFrame = '';
  private scratchBlend: ScratchBlend | null = null;
  // Decode/crop each recurring scratch pair once. Repeated getImageData
  // readbacks were causing avoidable main-thread stalls during performances.
  private readonly scratchBlendCache = new Map<string, ScratchBlend | null>();
  private readonly maxScratchBlendCacheEntries = 18;
  private scratchStartedAt = 0;
  private scratchDurationMs = 0;
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
  private nodWasAllowed = false;
  private nodReleaseFrom: HeadMotion = { ...REST_POSE };
  private nodReleaseStartedAt = 0;
  private readonly nodReleaseDurationMs = 260;

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
    // One reusable readback surface. Only compute a changed-pixel patch when
    // the scratch destination changes, never on every animation frame.
    this.readCanvas = document.createElement("canvas");
    this.readCanvas.width = 582;
    this.readCanvas.height = 652;
    this.readCtx = this.readCanvas.getContext("2d", { willReadFrequently: true })!;
    this.readCtx.imageSmoothingEnabled = false;
    // The alpha-blended scratch patch is assembled offscreen, then composited
    // ABOVE the table and vinyl. putImageData directly on the final canvas
    // would punch transparent rectangles through the moving records.
    this.scratchCanvas = document.createElement("canvas");
    this.scratchCanvas.width = 582;
    this.scratchCanvas.height = 652;
    this.scratchCtx = this.scratchCanvas.getContext("2d", { alpha: true })!;
    this.scratchCtx.imageSmoothingEnabled = false;
    // Keep the static table and spinning album art mounted independently
    // from DJ poses. A sprite/rig swap can now never clear the deck canvas.
    this.vinylCanvas = document.createElement('canvas');
    this.vinylCanvas.id = 'djVinylCanvas';
    this.vinylCanvas.className = 'dj-frame-img dj-nes-frame-img dj-vinyl-canvas';
    this.vinylCanvas.width = 582;
    this.vinylCanvas.height = 652;
    this.vinylCanvas.setAttribute('aria-hidden', 'true');
    this.vinylCtx = this.vinylCanvas.getContext('2d', { alpha: true })!;
    this.vinylCtx.imageSmoothingEnabled = false;
    originalSprite.insertAdjacentElement('afterend', this.vinylCanvas);
    this.vinylCanvas.insertAdjacentElement('afterend', this.canvas);
    this.discCanvas = document.createElement('canvas');
    this.discCanvas.id = 'djVinylDiscCanvas';
    this.discCanvas.className = 'dj-frame-img dj-nes-frame-img dj-vinyl-disc-canvas';
    this.discCanvas.width = 582;
    this.discCanvas.height = 652;
    this.discCanvas.setAttribute('aria-hidden', 'true');
    this.discCtx = this.discCanvas.getContext('2d', { alpha: true })!;
    this.discCtx.imageSmoothingEnabled = false;
    this.canvas.insertAdjacentElement('afterend', this.discCanvas);
    this.armCanvas = document.createElement('canvas');
    this.armCanvas.id = 'djScratchArmCanvas';
    this.armCanvas.className = 'dj-frame-img dj-nes-frame-img dj-scratch-arm-canvas';
    this.armCanvas.width = 582;
    this.armCanvas.height = 652;
    this.armCanvas.setAttribute('aria-hidden', 'true');
    this.armCtx = this.armCanvas.getContext('2d', { alpha: true })!;
    this.armCtx.imageSmoothingEnabled = false;
    this.discCanvas.insertAdjacentElement('afterend', this.armCanvas);
    this.resetGroove();
  }

  setVinylPlayback(playback: NormalizedTrack, cinematicPhase: VinylCinematicPhase): void {
    this.vinyl.setPlayback(playback, cinematicPhase);
  }

  /** Preload queue artwork on the next alternating deck without changing
   * the current Spotify track or consuming the next deck assignment. */
  prepareUpcomingVinyl(upcoming: NormalizedTrack): void {
    this.vinyl.prepareUpcoming(upcoming);
  }

  getVinylStatus(): string {
    return this.vinyl.status;
  }

  /**
   * Persistent table/vinyl plane. Updated before pose selection so it keeps
   * rotating even while a new family rig or static pose is still decoding.
   * This surface is never cleared as part of a DJ pose transition.
   */
  private paintVinyl(now: number): void {
    if (!this.vinyl.ready) return;
    if (this.vinyl.moving || this.vinyl.revision !== this.vinylLastRevision) {
      this.vinylCtx.clearRect(0, 0, 582, 652);
      this.vinyl.paintBackground(this.vinylCtx, now);
      // The old sprite contains bits of static record/table pixels that don't
      // exactly match a8 and survive foreground extraction. Overlay the real
      // records above those pixels, then put scratch arms ABOVE the records.
      // Both canvases share a single VinylDeckStage rotation sample.
      this.discCtx.clearRect(0, 0, 582, 652);
      this.vinyl.paintDiscOverlays(this.discCtx);
      this.vinylLastRevision = this.vinyl.revision;
    }
    this.host.classList.add('dj-vinyl-active');
  }

  /**
   * Scratch frames glide independently of head motion. With head nods enabled
   * we blend only the changed body pixels and draw the common head once above
   * them. With head nods disabled we blend the original complete PNGs instead.
   */
  update(
    frame: string,
    headEnabled: boolean,
    performanceEligible: boolean,
    timing: BeatTiming | null,
    now: number,
    nextScratchFrameHoldMs: number,
    nodAllowed = true,
  ): void {
    // Compute hand movement before advancing the vinyl plane, so the hand
    // and album use one animation timestamp with no one-frame latency.
    const family = FAMILY_BY_FRAME[frame];
    if (!performanceEligible || !family) {
      this.vinyl.setScratchMotion(null);
      this.paintVinyl(now);
      this.scratchGroove.reset();
      this.resetHeadEligibility();
      this.resetScratchTransition();
      if (this.vinyl.ready) this.paintStaticPose(frame, now);
      else this.hide();
      return;
    }

    if (!SCRATCH_FAMILIES[family]) this.scratchGroove.reset();
    const useHead = headEnabled && timing !== null;
    const rig = this.ready.get(family) ?? null;
    // Scratch rigs and nod rigs share one 582x652 compositing surface.
    // Only enable scratch layers when the canonical vinyl table, both arms,
    // repaired body, and approved independent head are all decoded.
    const wantsScratch = !!SCRATCH_FAMILIES[family] && this.vinyl.ready;
    if ((useHead || wantsScratch) && !rig) this.ensureFamily(family);
    if (wantsScratch) this.scratchRigs.ensure(family);
    const scratchRig = wantsScratch && rig ? this.scratchRigs.get(family) : null;
    if (!useHead && !scratchRig && !this.rawReady.has(family)) this.ensureOriginalFamily(family);
    const renderMode: SpriteRenderMode = scratchRig ? "scratch-rig" :
      useHead ? "detached-head" : "original";
    const spriteFrames = scratchRig?.bodies ?? (useHead ? rig?.bodies : this.rawReady.get(family));
    if (!spriteFrames?.has(frame)) {
      this.vinyl.setScratchMotion(null);
      this.paintVinyl(now);
      // Retain the last complete DJ pose rather than switching back to the
      // original PNG (which can cover or flash the spinning vinyl).
      this.resetHeadEligibility();
      this.resetScratchTransition();
      if (!this.visible) this.hide();
      return;
    }

    if (family !== this.activeFamily || renderMode !== this.activeRenderMode) {
      this.activeFamily = family;
      this.activeRenderMode = renderMode;
      this.lastDrawn = "";
      this.lastDrawnPosition = -1;
      this.resetScratchTransition();
      // Keep the existing canvas visible until the next composited frame
      // has been painted. This prevents a frame of legacy black records.
    }

    if (scratchRig) {
      // A scratch rig never crossfades complete sprites. The same arm pixels
      // interpolate between the calibrated keyframes, with a fixed torso.
      this.scratchBlend = null;
      this.lastScratchFrame = frame;
    } else if (frame !== this.lastScratchFrame) {
      // Skip cross-family and first-frame changes. In-family variations are
      // already small: this is where a short eased dissolve is useful.
      const previous = spriteFrames.get(this.lastScratchFrame);
      const incoming = spriteFrames.get(frame);
      if (previous && incoming) {
        const cacheKey = `${this.vinyl.ready ? "layered" : "legacy"}:${renderMode}:${family}:${this.lastScratchFrame}>${frame}`;
        const cached = this.scratchBlendCache.get(cacheKey);
        if (cached !== undefined) {
          this.scratchBlendCache.delete(cacheKey);
          this.scratchBlendCache.set(cacheKey, cached);
          this.scratchBlend = cached;
        } else {
          this.scratchBlend = this.prepareScratchBlend(
            this.vinyl.foreground(previous), this.vinyl.foreground(incoming),
          );
          this.scratchBlendCache.set(cacheKey, this.scratchBlend);
          while (this.scratchBlendCache.size > this.maxScratchBlendCacheEntries) {
            const oldest = this.scratchBlendCache.keys().next().value;
            if (oldest) this.scratchBlendCache.delete(oldest);
          }
        }
      } else {
        this.scratchBlend = null;
      }
      this.scratchStartedAt = now;
      this.scratchDurationMs = scratchTransitionDuration(Math.max(0, nextScratchFrameHoldMs));
      this.scratchVinylFromFrame = this.lastScratchFrame || frame;
      this.lastScratchFrame = frame;
    }
    const scratchMoving = this.scratchBlend !== null &&
      now < this.scratchStartedAt + this.scratchDurationMs;
    const independentArms = scratchRig && rig ? {
      rig: scratchRig,
      motion: this.scratchGroove.update(scratchRig.rig, frame, now, nextScratchFrameHoldMs),
      head: rig.head,
    } : null;

    if (SCRATCH_FAMILIES[family]) {
      // Follow actual isolated-arm transforms whenever the approved rig exists.
      // The published legacy sprites use starter hand-position estimates,
      // sampled at the exact same interpolation fraction as the body blend.
      const scratchOffsets = independentArms
        ? scratchOffsetsFromArms(
            family, independentArms.motion, independentArms.rig.rig.pivots,
            independentArms.rig.rig.scratchFrames,
          )
        : this.scratchBlend
          ? scratchOffsetsFromLegacy(
              family, this.scratchVinylFromFrame, frame,
              this.scratchDurationMs > 0
                ? scratchEase((now - this.scratchStartedAt) / this.scratchDurationMs) : 1,
            )
          : EMPTY_SCRATCH;
      this.vinyl.setScratchMotion(family, scratchOffsets);
    } else {
      this.vinyl.setScratchMotion(null);
    }
    this.paintVinyl(now);

    // Disabled nodding must not stop the body scratch interpolation.
    if (!useHead || !rig || !timing) {
      const previouslyMoving = this.lastRenderWasMoving;
      this.resetHeadEligibility();
      if (frame !== this.lastDrawn || scratchMoving || independentArms?.motion.moving ||
          previouslyMoving || !this.visible || this.vinyl.moving ||
          this.lastVinylRevision !== this.vinyl.revision) {
        this.paintComposed(spriteFrames, frame, scratchMoving, null, now, independentArms);
      }
      this.lastRenderWasMoving = scratchMoving || !!independentArms?.motion.moving;
      if (!this.visible) this.show();
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

    // Music intros/outros and 35% of mid-song phrases keep the nodding head
    // resting naturally. Ease the current motion back to neutral rather than
    // snapping the face while scratching arms keep moving independently.
    if (!nodAllowed) {
      if (this.nodWasAllowed) {
        this.nodReleaseFrom = this.motionAt(progress);
        this.nodReleaseStartedAt = now;
      }
      this.nodWasAllowed = false;
      const fraction = this.nodReleaseStartedAt
        ? clamp01((now - this.nodReleaseStartedAt) / this.nodReleaseDurationMs)
        : 1;
      const t = easeInOutSine(fraction);
      const relaxing = t < 1;
      const restMotion: HeadMotion = {
        x: mix(this.nodReleaseFrom.x, 0, t),
        y: mix(this.nodReleaseFrom.y, 0, t),
        tilt: mix(this.nodReleaseFrom.tilt, 0, t),
      };
      if (frame !== this.lastDrawn || relaxing || scratchMoving ||
          independentArms?.motion.moving || this.lastRenderWasMoving ||
          !this.visible || this.vinyl.moving ||
          this.lastVinylRevision !== this.vinyl.revision) {
        this.paintComposed(spriteFrames, frame, scratchMoving,
          { rig, motion: restMotion }, now, independentArms);
      }
      this.lastRenderWasMoving = relaxing || scratchMoving ||
        !!independentArms?.motion.moving;
      if (!this.visible) this.show();
      return;
    }
    if (!this.nodWasAllowed) {
      // Restart phrases from the neutral position. Preserve the head rig
      // and underlying decks; only the head motion scheduler restarts.
      this.resetGroove();
      this.nodWasAllowed = true;
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
        moving || scratchMoving || independentArms?.motion.moving ||
        this.lastRenderWasMoving || !this.visible ||
        this.vinyl.moving || this.lastVinylRevision !== this.vinyl.revision) {
      this.paintComposed(spriteFrames, frame, scratchMoving,
        { rig, motion: this.motionAt(progress) }, now, independentArms);
    }
    // One final redraw lands both the scratch and nod at their exact target.
    this.lastRenderWasMoving = moving || scratchMoving || !!independentArms?.motion.moving;
    if (!this.visible) this.show();
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
    this.nodWasAllowed = false;
    this.nodReleaseFrom = { ...REST_POSE };
    this.nodReleaseStartedAt = 0;
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

  private paintComposed(
    sprites: Map<string, HTMLImageElement>,
    frame: string,
    scratchMoving: boolean,
    detached: { rig: DecodedRig; motion: HeadMotion } | null,
    now: number,
    independentArms: {
      rig: DecodedScratchRig;
      motion: ScratchRigMotion;
      head: HTMLImageElement;
    } | null = null,
  ): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.armCtx.clearRect(0, 0, 582, 652);
    ctx.imageSmoothingEnabled = false;
    // Persistent vinyl is BELOW body; the foreground record plane is ABOVE
    // body but BELOW the independently animated scratching arms.
    if (independentArms) {
      // Fixed torso and nodding head on the body canvas. The records are
      // painted by discCanvas above it; independent hands sit on armCanvas
      // above the discs. They can scratch without hiding the album texture.
      const { rig: armRig, motion } = independentArms;
      ctx.drawImage(this.vinyl.foreground(armRig.body), 0, 0);
      for (const side of ["left", "right"] as const) {
        const pivot = armRig.rig.pivots[side];
        const arm = motion[side];
        this.armCtx.save();
        this.armCtx.translate(pivot.x + arm.x, pivot.y + arm.y);
        this.armCtx.rotate(arm.tilt * Math.PI / 180);
        this.armCtx.translate(-pivot.x, -pivot.y);
        this.armCtx.drawImage(this.vinyl.foreground(armRig[side]), 0, 0);
        this.armCtx.restore();
      }
      // With nodding disabled, the same approved head remains on the body,
      // but stays in its original resting position.
      if (!detached) ctx.drawImage(independentArms.head, 0, 0);
    } else {
      const foreground = this.vinyl.foreground(sprites.get(frame)!);
      if (scratchMoving && this.scratchBlend) {
        const progress = scratchEase((now - this.scratchStartedAt) / this.scratchDurationMs);
        const { from, to, bounds, working } = this.scratchBlend;
        blendSpritePixels(from, to, working.data, progress);
        this.scratchCtx.clearRect(0, 0, this.scratchCanvas.width, this.scratchCanvas.height);
        this.scratchCtx.drawImage(foreground, 0, 0);
        this.scratchCtx.putImageData(working, bounds.x, bounds.y);
        ctx.drawImage(this.scratchCanvas, 0, 0);
      } else {
        ctx.drawImage(foreground, 0, 0);
      }
    }
    if (detached) {
      const { rig, motion } = detached;
      ctx.save();
      ctx.translate(rig.rig.rotationPivot.x + motion.x, rig.rig.rotationPivot.y + motion.y);
      ctx.rotate(motion.tilt * Math.PI / 180);
      ctx.translate(-rig.rig.rotationPivot.x, -rig.rig.rotationPivot.y);
      ctx.drawImage(rig.head, 0, 0);
      ctx.restore();
    }
    this.lastDrawn = frame;
    this.lastDrawnPosition = this.position;
    this.lastVinylRevision = this.vinyl.revision;
  }

  private paintStaticPose(frame: string, now: number): void {
    const image = this.staticPoses.get(frame);
    if (!image) {
      this.ensureStaticPose(frame);
      // Preserve the last DJ frame above the independently spinning decks
      // until the new static/cinematic image has decoded.
      if (!this.visible) this.hide();
      return;
    }
    // Keep the previous pose on the canvas when nothing changes; paused
    // albums remain visible and frozen without forcing a redraw every RAF.
    if (frame === this.lastDrawn && this.visible &&
        !this.vinyl.moving && this.vinyl.revision === this.lastVinylRevision) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.armCtx.clearRect(0, 0, 582, 652);
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.vinyl.foreground(image), 0, 0);
    this.lastDrawn = frame;
    this.lastDrawnPosition = -1;
    this.lastVinylRevision = this.vinyl.revision;
    if (!this.visible) this.show();
  }

  private ensureStaticPose(frame: string): void {
    if (this.staticPoses.has(frame) || this.staticPending.has(frame) || this.staticFailed.has(frame)) return;
    this.staticPending.add(frame);
    void loadImage("./assets/poses/final/" + frame)
      .then(img => {
        this.staticPoses.delete(frame);
        this.staticPoses.set(frame, img);
        // Bounded per-frame memory, including idle, speaking and cinematics.
        while (this.staticPoses.size > 10) {
          const oldest = this.staticPoses.keys().next().value;
          if (oldest) this.staticPoses.delete(oldest);
        }
      })
      .catch(error => {
        this.staticFailed.add(frame);
        console.warn("Static DJ pose unavailable; using the original PNG", error);
      })
      .finally(() => this.staticPending.delete(frame));
  }

  private prepareScratchBlend(from: HTMLImageElement | HTMLCanvasElement, to: HTMLImageElement | HTMLCanvasElement): ScratchBlend | null {
    const ctx = this.readCtx;
    try {
      ctx.clearRect(0, 0, 582, 652);
      ctx.drawImage(from, 0, 0);
      const before = ctx.getImageData(0, 0, 582, 652);
      ctx.clearRect(0, 0, 582, 652);
      ctx.drawImage(to, 0, 0);
      const after = ctx.getImageData(0, 0, 582, 652);
      const bounds = changedPixelBounds(before.data, after.data, 582, 652);
      if (!bounds) return null;
      const fromRegion = new Uint8ClampedArray(bounds.width * bounds.height * 4);
      const toRegion = new Uint8ClampedArray(fromRegion.length);
      for (let y = 0; y < bounds.height; y++) {
        const index = ((y + bounds.y) * 582 + bounds.x) * 4;
        const start = y * bounds.width * 4;
        fromRegion.set(before.data.subarray(index, index + bounds.width * 4), start);
        toRegion.set(after.data.subarray(index, index + bounds.width * 4), start);
      }
      return {
        bounds,
        from: fromRegion,
        to: toRegion,
        working: ctx.createImageData(bounds.width, bounds.height),
      };
    } catch (error) {
      // A transient failed readback should never disrupt the original scratch
      // pose animation. Return to the immediate full sprite as a fallback.
      console.warn("Scratch interpolation unavailable", error);
      return null;
    }
  }

  private resetHeadEligibility(): void {
    this.nodWasAllowed = false;
    this.nodReleaseFrom = { ...REST_POSE };
    this.nodReleaseStartedAt = 0;
    this.eligibleLastTick = false;
    this.timingTrackKey = "";
    this.lastRenderWasMoving = false;
  }

  private resetScratchTransition(): void {
    this.lastScratchFrame = "";
    this.scratchVinylFromFrame = "";
    this.scratchBlend = null;
    this.scratchStartedAt = 0;
    this.scratchDurationMs = 0;
  }

  private show(): void {
    this.visible = true;
    this.host.classList.add("dj-headbob-active");
  }

  private ensureOriginalFamily(family: string): void {
    if (this.rawReady.has(family) || this.rawPending.has(family) || this.rawFailed.has(family)) return;
    const promise = Promise.all(FAMILIES[family].map(frame =>
      loadImage("./assets/poses/final/" + frame)))
      .then(images => {
        this.rawReady.delete(family);
        this.rawReady.set(family, new Map(FAMILIES[family].map((frame, i) => [frame, images[i]])));
        while (this.rawReady.size > this.maxCachedFamilies) {
          const oldest = this.rawReady.keys().next().value;
          if (oldest) this.rawReady.delete(oldest);
        }
      })
      .catch(error => {
        this.rawFailed.add(family);
        console.warn("Smooth scratch assets unavailable; keeping original sprite", error);
      })
      .finally(() => { this.rawPending.delete(family); });
    this.rawPending.set(family, promise);
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
