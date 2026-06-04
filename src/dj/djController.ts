import type { DjMode, NormalizedTrack } from "../state/types";

type ControlMode = "normal" | "audition" | "cinematic";
type LoopKind = "quick" | "cinematic" | "idle" | "paused";

type AnimationLoop = {
  id: string;
  label: string;
  kind: LoopKind;
  frames: string[];
  minFrameMs: number;
  maxFrameMs: number;
  endPauseMinMs: number;
  endPauseMaxMs: number;
  minLoopMs: number;
  maxLoopMs: number;
};

const POSE_BASE = "./assets/poses/final/";
const ALBUM_REVEAL_FRAME_HOLD_MULTIPLIER = 2;

/*
 * Important split:
 * - active/playing/demo lives mainly in calm scratch loops that can dwell for short or long organic stretches
 * - the A11/A11m cinematic record moves are used only when the active track changes
 * - idle/no-track uses only the approved calm idle poses: i6, i7, i9, i1, i10, i11, i12
 * - paused uses the same calm pose family by default so the DJ clearly stops performing
 */
const quickLoops: AnimationLoop[] = [
  makeLoop("left-scratch", "Left deck scratch", ["a10.png", "a10-2.png"], "quick", 120, 520, 0, 420, 4_000, 24_000),
  makeLoop("record-touch", "Record touch", ["a4.png", "a4-2.png"], "quick", 120, 520, 0, 420, 4_000, 22_000),
  makeLoop("low-hands-scratch", "Low hands scratch", ["a14.png", "a14-2.png"], "quick", 160, 620, 0, 520, 4_000, 20_000),
  makeLoop("two-hand-scratch-a", "Two-hand scratch A", ["a44.png", "a44-2.png", "a44-3.png"], "quick", 140, 640, 0, 650, 7_000, 34_000),
  makeLoop("two-hand-scratch-b", "Two-hand scratch B", ["a47.png", "a47-2.png", "a47-3.png"], "quick", 140, 640, 0, 650, 7_000, 34_000),
  makeLoop("two-hand-scratch-c", "Two-hand scratch C", ["a48.png", "a48-2.png", "a48-3.png"], "quick", 140, 640, 0, 650, 7_000, 34_000)
];

const cinematicLoops: AnimationLoop[] = [
  makeLoop("place-record-right", "Near-change record move right", ["a41.png", "a11.png", "a12.png", "a11-2.png"], "cinematic", 420, 780, 700, 1400),
  makeLoop("place-record-left", "Near-change record move left", ["a41.png", "a11m.png", "a12m.png", "a11-2m.png"], "cinematic", 420, 780, 700, 1400)
];

const idleLoops: AnimationLoop[] = [
  makeLoop("idle-i6", "Idle i6", ["i6.png"], "idle", 30_000, 60_000, 0, 0),
  makeLoop("idle-i7", "Idle i7", ["i7.png"], "idle", 30_000, 60_000, 0, 0),
  makeLoop("idle-i9", "Idle i9", ["i9.png"], "idle", 30_000, 60_000, 0, 0),
  makeLoop("idle-i1", "Idle i1", ["i1.png"], "idle", 30_000, 60_000, 0, 0),
  makeLoop("idle-i10", "Idle i10", ["i10.png"], "idle", 30_000, 60_000, 0, 0),
  makeLoop("idle-i11", "Idle i11", ["i11.png"], "idle", 30_000, 60_000, 0, 0),
  makeLoop("idle-i12", "Idle i12", ["i12.png"], "idle", 30_000, 60_000, 0, 0)
];

const pausedLoops: AnimationLoop[] = [
  makeLoop("paused-i6", "Paused i6", ["i6.png"], "paused", 25_000, 50_000, 0, 0),
  makeLoop("paused-i7", "Paused i7", ["i7.png"], "paused", 25_000, 50_000, 0, 0),
  makeLoop("paused-i9", "Paused i9", ["i9.png"], "paused", 25_000, 50_000, 0, 0),
  makeLoop("paused-i1", "Paused i1", ["i1.png"], "paused", 25_000, 50_000, 0, 0),
  makeLoop("paused-i10", "Paused i10", ["i10.png"], "paused", 25_000, 50_000, 0, 0),
  makeLoop("paused-i11", "Paused i11", ["i11.png"], "paused", 25_000, 50_000, 0, 0),
  makeLoop("paused-i12", "Paused i12", ["i12.png"], "paused", 25_000, 50_000, 0, 0)
];

export class DjController {
  private mode: DjMode = "idle";
  private controlMode: ControlMode = "normal";
  private currentLoop: AnimationLoop = idleLoops[0];
  private currentFrame = idleLoops[0].frames[0];
  private frameIndex = 0;
  private nextFrameAt = 0;
  private loopEndsAt = 0;
  private cinematicOnce = false;
  private auditionIndex = 0;
  private cinematicIndex = 0;
  private normalLoopIndex = -1;
  private lastTrackId: string | null = null;
  private cinematicFiredForTrack = false;
  private cinematicForCurrentTrack = 0;
  private nextCinematicForNewTrack = 0;
  private lastStatus = "";
  private previousFrame = "";
  private pendingSongChangeCinematic = false;

  constructor(private readonly poseElement: HTMLElement, private readonly modeElement: HTMLElement) {
    this.preload();
    this.bindKeyboardControls();
    this.startNormalLoop("idle", Date.now());
    this.currentFrame = this.currentLoop.frames[0] || "i1.png";
    this.paint();
  }

  update(playback: NormalizedTrack, now = Date.now(), songChangeCinematicReady = true): DjMode {
    const nextMode = this.resolveMode(playback);
    this.handleTrackTiming(playback, nextMode, now, songChangeCinematicReady);

    if (this.controlMode !== "normal") {
      this.mode = nextMode;
      this.stepControlledMode(now);
      this.paint();
      return this.mode;
    }

    if (nextMode !== this.mode && !this.cinematicOnce) {
      this.mode = nextMode;
      this.startNormalLoop(nextMode, now);
    } else {
      this.mode = nextMode;
    }

    this.stepNormalMode(now);
    this.paint();
    return this.mode;
  }

  setPose(id: string, now = Date.now()): void {
    this.currentFrame = this.frameForPoseId(id);
    this.nextFrameAt = now + 900;
    this.paint();
  }

  setAuditionMode(enabled: boolean): void {
    if (enabled) this.enterAuditionMode();
    else this.enterNormalMode(Date.now());
  }

  setCinematicMode(enabled: boolean): void {
    if (enabled) this.enterCinematicMode();
    else this.enterNormalMode(Date.now());
  }

  getDebugStatus(): Record<string, string | number | boolean> {
    return {
      mode: this.mode,
      controlMode: this.controlMode,
      pose: this.currentFrame,
      loop: this.currentLoop.label,
      quickLoops: quickLoops.length,
      cinematicLoops: cinematicLoops.length,
      cinematicOnce: this.cinematicOnce,
      cinematicLabel: this.cinematicOnce ? this.currentLoop.label : ""
    };
  }

  private resolveMode(playback: NormalizedTrack): DjMode {
    if (playback.source === "demo") return playback.isPlaying ? "demo" : "paused";
    if (!playback.isAuthenticated) return "idle";
    if (!playback.trackId) return "idle";
    if (!playback.isPlaying) return "paused";
    return "playing";
  }

  private handleTrackTiming(playback: NormalizedTrack, nextMode: DjMode, now: number, songChangeCinematicReady: boolean): void {
    const isActive = nextMode === "playing" || nextMode === "demo";
    const trackId = playback.trackId;

    if (trackId && trackId !== this.lastTrackId) {
      const hadPreviousTrack = Boolean(this.lastTrackId);
      // If the page was hidden/throttled and we only discover the new track well into playback,
      // do not play a late song-change cinematic in the middle of the song.
      const discoveredNearTrackStart = playback.progressMs < 12_000 || playback.source === "demo";
      const shouldQueueSongChangeCinematic =
        hadPreviousTrack &&
        isActive &&
        discoveredNearTrackStart &&
        this.controlMode === "normal" &&
        !this.cinematicOnce;

      this.lastTrackId = trackId;
      this.cinematicFiredForTrack = false;
      this.cinematicForCurrentTrack = this.nextCinematicForNewTrack;
      this.nextCinematicForNewTrack = 1 - this.nextCinematicForNewTrack;
      this.pendingSongChangeCinematic = shouldQueueSongChangeCinematic;
    }

    // Gate the record-change cinematic until the new album artwork has either loaded
    // or the short fallback timeout has expired. This prevents the old album from
    // flashing on the A41 reveal frame.
    if (
      this.pendingSongChangeCinematic &&
      songChangeCinematicReady &&
      isActive &&
      this.controlMode === "normal" &&
      !this.cinematicOnce
    ) {
      this.pendingSongChangeCinematic = false;
      this.triggerCinematicOnce(now);
    }

    if (!trackId || !isActive) {
      this.pendingSongChangeCinematic = false;
    }
  }

  private triggerCinematicOnce(now: number): void {
    const loop = cinematicLoops[this.cinematicForCurrentTrack % cinematicLoops.length] || cinematicLoops[0];
    if (!loop) return;
    this.cinematicFiredForTrack = true;
    this.cinematicOnce = true;
    this.currentLoop = loop;
    this.frameIndex = 0;
    this.nextFrameAt = now;
    this.loopEndsAt = Number.POSITIVE_INFINITY;
  }

  private stepNormalMode(now: number): void {
    if (this.cinematicOnce) {
      this.stepCinematicOnce(now);
      return;
    }

    if (now >= this.loopEndsAt) {
      this.startNormalLoop(this.mode, now);
    }

    if (now >= this.nextFrameAt) {
      this.advanceFrame(now);
    }
  }

  private stepCinematicOnce(now: number): void {
    if (now < this.nextFrameAt) return;

    if (this.frameIndex >= this.currentLoop.frames.length) {
      this.cinematicOnce = false;
      this.startNormalLoop(this.mode, now);
      return;
    }

    this.currentFrame = this.currentLoop.frames[this.frameIndex];
    this.frameIndex += 1;
    this.nextFrameAt = now + this.frameDuration(this.currentLoop, this.frameIndex);
  }

  private stepControlledMode(now: number): void {
    if (now >= this.nextFrameAt) {
      this.advanceFrame(now);
    }
  }

  private advanceFrame(now: number): void {
    const frames = this.currentLoop.frames;
    if (!frames.length) return;

    if (this.shouldUseOrganicScratchOrder(this.currentLoop)) {
      this.currentFrame = this.pickOrganicScratchFrame(frames);
    } else {
      this.currentFrame = frames[this.frameIndex % frames.length];
    }

    this.frameIndex += 1;
    this.nextFrameAt = now + this.frameDuration(this.currentLoop, this.frameIndex);
  }

  private shouldUseOrganicScratchOrder(loop: AnimationLoop): boolean {
    return loop.kind === "quick" && loop.frames.length === 3;
  }

  private pickOrganicScratchFrame(frames: string[]): string {
    if (frames.length < 3) return frames[0] || this.currentFrame;

    const baseFrame = frames[0];
    const accentFrames = frames.slice(1);
    let candidates: string[];

    // Bias back toward the base frame so the motion reads like a DJ hand returning to
    // the record between varied scratch hits. This allows patterns such as:
    // a44 -> a44-3 -> a44 -> a44-2 -> a44-3 -> a44
    if (this.currentFrame === baseFrame) {
      candidates = accentFrames;
    } else {
      candidates = Math.random() < 0.68 ? [baseFrame] : frames.filter((frame) => frame !== this.currentFrame);
    }

    const next = candidates[randomInt(0, candidates.length - 1)] || baseFrame;
    this.previousFrame = this.currentFrame;
    return next;
  }

  private frameDuration(loop: AnimationLoop, advancedIndex: number): number {
    const base = randomInt(loop.minFrameMs, loop.maxFrameMs);
    const endPause = advancedIndex % loop.frames.length === 0
      ? randomInt(loop.endPauseMinMs, loop.endPauseMaxMs)
      : 0;
    const frameIndex = Math.max(0, (advancedIndex - 1) % Math.max(1, loop.frames.length));
    const frame = loop.frames[frameIndex];
    const holdMultiplier = loop.kind === "cinematic" && frame === "a41.png"
      ? ALBUM_REVEAL_FRAME_HOLD_MULTIPLIER
      : 1;
    return Math.round(base * holdMultiplier) + endPause;
  }

  private startNormalLoop(mode: DjMode, now: number): void {
    this.cinematicOnce = false;
    const pool = this.poolForMode(mode);
    if (!pool.length) return;

    let index: number;
    if (mode === "playing" || mode === "demo") {
      index = randomInt(0, pool.length - 1);
    } else {
      // Idle/paused should feel like a natural jump to a calm resting pose, not a predictable sequence.
      index = randomInt(0, pool.length - 1);
      this.normalLoopIndex = index;
    }

    this.currentLoop = pool[index];
    this.frameIndex = 0;
    this.previousFrame = "";
    this.currentFrame = this.currentLoop.frames[0] || this.currentFrame;
    this.nextFrameAt = now + this.frameDuration(this.currentLoop, 1);
    this.loopEndsAt = now + this.loopDurationForMode(mode);
  }

  private poolForMode(mode: DjMode): AnimationLoop[] {
    if (mode === "playing" || mode === "demo") return quickLoops;
    if (mode === "paused") return pausedLoops;
    return idleLoops;
  }

  private loopDurationForMode(mode: DjMode): number {
    if (mode === "playing" || mode === "demo" || mode === "burst") {
      return randomInt(this.currentLoop.minLoopMs, this.currentLoop.maxLoopMs);
    }
    if (mode === "paused") return randomInt(25_000, 50_000);
    return randomInt(30_000, 60_000);
  }

  private enterNormalMode(now: number): void {
    this.controlMode = "normal";
    this.startNormalLoop(this.mode, now);
  }

  private enterAuditionMode(): void {
    this.controlMode = "audition";
    this.currentLoop = quickLoops[this.auditionIndex] || quickLoops[0];
    this.frameIndex = 0;
    this.nextFrameAt = 0;
    this.loopEndsAt = Number.POSITIVE_INFINITY;
  }

  private enterCinematicMode(): void {
    this.controlMode = "cinematic";
    this.currentLoop = cinematicLoops[this.cinematicIndex] || cinematicLoops[0];
    this.frameIndex = 0;
    this.nextFrameAt = 0;
    this.loopEndsAt = Number.POSITIVE_INFINITY;
  }

  private stepLoop(delta: number): void {
    if (this.controlMode === "cinematic") {
      this.cinematicIndex = wrapIndex(this.cinematicIndex + delta, cinematicLoops.length);
      this.currentLoop = cinematicLoops[this.cinematicIndex] || this.currentLoop;
    } else if (this.controlMode === "audition") {
      this.auditionIndex = wrapIndex(this.auditionIndex + delta, quickLoops.length);
      this.currentLoop = quickLoops[this.auditionIndex] || this.currentLoop;
    } else {
      const pool = this.poolForMode(this.mode);
      this.normalLoopIndex = wrapIndex(this.normalLoopIndex + delta, pool.length);
      this.currentLoop = pool[this.normalLoopIndex] || this.currentLoop;
    }
    this.frameIndex = 0;
    this.previousFrame = "";
    this.currentFrame = this.currentLoop.frames[0] || this.currentFrame;
    this.nextFrameAt = 0;
    this.loopEndsAt = Number.POSITIVE_INFINITY;
    this.paint();
  }

  private paint(): void {
    if (this.poseElement instanceof HTMLImageElement) {
      this.poseElement.src = `${POSE_BASE}${this.currentFrame}`;
    }

    const label = this.controlMode === "normal" ? this.mode : this.controlMode;
    const status = `${label}:${this.currentFrame}:${this.currentLoop.id}`;
    if (status !== this.lastStatus) {
      this.lastStatus = status;
      this.poseElement.dataset.pose = this.currentFrame;
      this.poseElement.dataset.loop = this.currentLoop.id;
      this.poseElement.dataset.controlMode = this.controlMode;
      this.poseElement.setAttribute("aria-label", `Pocket DJ ${label}: ${this.currentFrame}`);
      this.modeElement.textContent = label.toUpperCase();
      document.documentElement.dataset.djMode = label;
      document.documentElement.classList.toggle("dj-pose-i6", this.currentFrame === "i6.png");
      document.documentElement.classList.toggle("dj-pose-a41", this.currentFrame === "a41.png");
      this.updateAnimationDebug(label);
    }
  }

  private updateAnimationDebug(label: string): void {
    const panel = document.getElementById("animationDebugPanel");
    if (!panel) return;

    const cinematicState = this.cinematicOnce
      ? "near-change cinematic active"
      : this.controlMode === "cinematic"
        ? "manual cinematic mode"
        : "none";

    panel.textContent = [
      `frame: ${this.currentFrame}`,
      `mode: ${label}`,
      `loop: ${this.currentLoop.id}`,
      `loop label: ${this.currentLoop.label}`,
      `control: ${this.controlMode}`,
      `cinematic: ${cinematicState}`,
      `loop dwell: ${this.currentLoop.minLoopMs}-${this.currentLoop.maxLoopMs} ms`,
      `order: ${this.shouldUseOrganicScratchOrder(this.currentLoop) ? "organic/random scratch" : "sequential"}`
    ].join("\n");
  }

  private frameForPoseId(id: string): string {
    if (id.endsWith(".png")) return id;
    const legacyMap: Record<string, string> = {
      "idle-center": "i1.png",
      "idle-nod": "i7.png",
      "active-left": "a4.png",
      "active-right": "a5.png",
      "burst-hands": "a44.png",
      "paused-lean": "i9.png"
    };
    return legacyMap[id] || "i1.png";
  }

  private preload(): void {
    const unique = new Set<string>();
    [...quickLoops, ...cinematicLoops, ...idleLoops, ...pausedLoops].forEach((loop) => {
      loop.frames.forEach((frame) => unique.add(frame));
    });
    unique.forEach((frame) => {
      const img = new Image();
      img.src = `${POSE_BASE}${frame}`;
    });
  }

  private bindKeyboardControls(): void {
    document.addEventListener("keydown", (event) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT") return;

      if (event.key.toLowerCase() === "l") {
        event.preventDefault();
        if (this.controlMode === "audition") this.enterNormalMode(Date.now());
        else this.enterAuditionMode();
        return;
      }

      if (event.key.toLowerCase() === "c") {
        event.preventDefault();
        if (this.controlMode === "cinematic") this.enterNormalMode(Date.now());
        else this.enterCinematicMode();
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        this.stepLoop(1);
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        this.stepLoop(-1);
      }
    });
  }
}

function makeLoop(
  id: string,
  label: string,
  frames: string[],
  kind: LoopKind,
  minFrameMs = 420,
  maxFrameMs = 780,
  endPauseMinMs = 180,
  endPauseMaxMs = 520,
  minLoopMs = 4_500,
  maxLoopMs = 9_000
): AnimationLoop {
  return { id, label, frames, kind, minFrameMs, maxFrameMs, endPauseMinMs, endPauseMaxMs, minLoopMs, maxLoopMs };
}

function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function wrapIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}
