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
};

const POSE_BASE = "./assets/poses/final/";
const CINEMATIC_TRIGGER_MS = 30_000;

/*
 * Important split:
 * - active/playing/demo uses a*.png performance poses
 * - idle/no-track uses only the approved calm idle poses: i6, i7, i8, i9, i1, i10, i11, i12
 * - paused uses the same calm pose family by default so the DJ clearly stops performing
 */
const quickLoops: AnimationLoop[] = [
  makeLoop("left-scratch", "Left deck scratch", ["a10.png", "a10-2.png"], "quick"),
  makeLoop("record-flip", "Record flip", ["a4.png", "a4-2.png"], "quick"),
  makeLoop("hands-up", "Hands up pulse", ["a14.png", "a14-2.png"], "quick"),
  makeLoop("crowd-wave", "Crowd wave", ["a44.png", "a44-2.png", "a44-3.png"], "quick"),
  makeLoop("right-groove", "Right groove", ["a47.png", "a47-2.png", "a47-3.png"], "quick"),
  makeLoop("headphone-groove", "Headphone groove", ["a48.png", "a48-2.png", "a48-3.png"], "quick"),
  makeLoop("center-mix-a", "Center mix A", ["a1.png", "a2.png", "a3.png"], "quick"),
  makeLoop("center-mix-b", "Center mix B", ["a5.png", "a6.png", "a7.png"], "quick"),
  makeLoop("smile-mix", "Smile mix", ["a8.png", "a9.png", "a10.png"], "quick"),
  makeLoop("right-hand-mix", "Right hand mix", ["a15.png", "a16.png", "a17.png", "a18.png"], "quick"),
  makeLoop("build-up", "Build up", ["a30.png", "a31.png", "a32.png", "a33.png"], "quick"),
  makeLoop("locked-in", "Locked in", ["a34.png", "a35.png", "a36.png", "a37.png", "a38.png", "a39.png"], "quick")
];

const cinematicLoops: AnimationLoop[] = [
  makeLoop("place-record-right", "Place record right", ["a41.png", "a11.png", "a12.png", "a11-2.png"], "cinematic", 420, 780, 700, 1400),
  makeLoop("place-record-left", "Place record left", ["a41.png", "a11m.png", "a12m.png", "a11-2m.png"], "cinematic", 420, 780, 700, 1400),
  makeLoop("big-hype", "Big hype", ["a44.png", "a44-2.png", "a44-3.png", "a45.png", "a46.png"], "cinematic", 420, 760, 900, 1500)
];

const idleLoops: AnimationLoop[] = [
  makeLoop("idle-i6", "Idle i6", ["i6.png"], "idle", 30_000, 60_000, 0, 0),
  makeLoop("idle-i7", "Idle i7", ["i7.png"], "idle", 30_000, 60_000, 0, 0),
  makeLoop("idle-i8", "Idle i8", ["i8.png"], "idle", 30_000, 60_000, 0, 0),
  makeLoop("idle-i9", "Idle i9", ["i9.png"], "idle", 30_000, 60_000, 0, 0),
  makeLoop("idle-i1", "Idle i1", ["i1.png"], "idle", 30_000, 60_000, 0, 0),
  makeLoop("idle-i10", "Idle i10", ["i10.png"], "idle", 30_000, 60_000, 0, 0),
  makeLoop("idle-i11", "Idle i11", ["i11.png"], "idle", 30_000, 60_000, 0, 0),
  makeLoop("idle-i12", "Idle i12", ["i12.png"], "idle", 30_000, 60_000, 0, 0)
];

const pausedLoops: AnimationLoop[] = [
  makeLoop("paused-i6", "Paused i6", ["i6.png"], "paused", 25_000, 50_000, 0, 0),
  makeLoop("paused-i7", "Paused i7", ["i7.png"], "paused", 25_000, 50_000, 0, 0),
  makeLoop("paused-i8", "Paused i8", ["i8.png"], "paused", 25_000, 50_000, 0, 0),
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
  private hasSeenFirstTrack = false;
  private cinematicFiredForTrack = false;
  private cinematicForCurrentTrack = 0;
  private nextCinematicForNewTrack = 0;
  private lastStatus = "";

  constructor(private readonly poseElement: HTMLElement, private readonly modeElement: HTMLElement) {
    this.preload();
    this.bindKeyboardControls();
    this.startNormalLoop("idle", Date.now());
    this.currentFrame = this.currentLoop.frames[0] || "i1.png";
    this.paint();
  }

  update(playback: NormalizedTrack, now = Date.now()): DjMode {
    const nextMode = this.resolveMode(playback);
    this.handleTrackTiming(playback, nextMode, now);

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
      cinematicOnce: this.cinematicOnce
    };
  }

  private resolveMode(playback: NormalizedTrack): DjMode {
    if (playback.source === "demo") return playback.isPlaying ? "demo" : "paused";
    if (!playback.isAuthenticated) return "idle";
    if (!playback.trackId) return "idle";
    if (!playback.isPlaying) return "paused";
    return "playing";
  }

  private handleTrackTiming(playback: NormalizedTrack, nextMode: DjMode, now: number): void {
    const isActive = nextMode === "playing" || nextMode === "demo";
    const trackId = playback.trackId;

    if (trackId && trackId !== this.lastTrackId) {
      this.lastTrackId = trackId;
      this.cinematicFiredForTrack = false;
      this.cinematicForCurrentTrack = this.nextCinematicForNewTrack;
      this.nextCinematicForNewTrack = 1 - this.nextCinematicForNewTrack;

      if (this.hasSeenFirstTrack && isActive && this.controlMode === "normal") {
        this.triggerCinematicOnce(now);
      }
      this.hasSeenFirstTrack = true;
    }

    if (!trackId || !playback.durationMs || !isActive) return;

    const estimatedProgress = playback.isPlaying
      ? Math.min(playback.durationMs, playback.progressMs + (now - playback.updatedAt))
      : playback.progressMs;
    const remainingMs = Math.max(0, playback.durationMs - estimatedProgress);

    if (
      remainingMs <= CINEMATIC_TRIGGER_MS &&
      !this.cinematicFiredForTrack &&
      this.controlMode === "normal" &&
      !this.cinematicOnce
    ) {
      this.triggerCinematicOnce(now);
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
    this.currentFrame = frames[this.frameIndex % frames.length];
    this.frameIndex += 1;
    this.nextFrameAt = now + this.frameDuration(this.currentLoop, this.frameIndex);
  }

  private frameDuration(loop: AnimationLoop, advancedIndex: number): number {
    const base = randomInt(loop.minFrameMs, loop.maxFrameMs);
    const endPause = advancedIndex % loop.frames.length === 0
      ? randomInt(loop.endPauseMinMs, loop.endPauseMaxMs)
      : 0;
    return base + endPause;
  }

  private startNormalLoop(mode: DjMode, now: number): void {
    this.cinematicOnce = false;
    const pool = this.poolForMode(mode);
    if (!pool.length) return;

    let index: number;
    if (mode === "playing" || mode === "demo") {
      index = randomInt(0, pool.length - 1);
    } else {
      this.normalLoopIndex = wrapIndex(this.normalLoopIndex + 1, pool.length);
      index = this.normalLoopIndex;
    }

    this.currentLoop = pool[index];
    this.frameIndex = 0;
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
    if (mode === "playing" || mode === "demo" || mode === "burst") return randomInt(4_500, 9_000);
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
    }
  }

  private frameForPoseId(id: string): string {
    if (id.endsWith(".png")) return id;
    const legacyMap: Record<string, string> = {
      "idle-center": "i1.png",
      "idle-nod": "i7.png",
      "active-left": "a4.png",
      "active-right": "a5.png",
      "burst-hands": "a44.png",
      "paused-lean": "i8.png"
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
  endPauseMaxMs = 520
): AnimationLoop {
  return { id, label, frames, kind, minFrameMs, maxFrameMs, endPauseMinMs, endPauseMaxMs };
}

function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function wrapIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}
