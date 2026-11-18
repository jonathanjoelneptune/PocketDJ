import type { DjMode, NormalizedTrack } from "../state/types";
import { HeadBobController } from "./headBobController";
import { headNodIntensityDuringTrack } from "./headNodPolicy";
import { shouldBeginEarlyCinematic } from "./earlyCinematicPolicy";
import { choosePerformancePose, performancePoseHoldMs, type PerformancePose } from "./performanceLoopPolicy";
import type { BeatTiming } from "./beatClock";
import type { HeldRecordSide } from "./heldRecordCalibration";

type ControlMode = "normal" | "audition" | "cinematic";
type LoopKind = "quick" | "vibe" | "cinematic" | "idle" | "paused";

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
// Dedicated commentary poses already present in the final asset directory.
// Keep these separate from scratching/idle/record-change pools.
const SPEAKING_POSES = ["a37.png", "a29.png", "a28.png", "a38.png"] as const;
const SPEAKING_POSE_HOLD_MS = 4_500;
const ALBUM_REVEAL_FRAME_HOLD_MULTIPLIER = 2;

/*
 * Important split:
 * - active/playing/demo alternates calm scratch loops and head-bobbing standing/vibe poses
 * - the A11/A11m cinematic record moves are used only when the active track changes
 * - idle/no-track keeps the existing calm idle poses; the vibe rigs are active playback only
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

// Single-frame standing poses: body/hands hold still while the independently
// cut head follows the same beat clock as the scratching families.
// a36 is explicitly reference-only and must not enter the runtime pool.
const vibeLoops: AnimationLoop[] = [
  makeLoop("vibe-i10", "Standing vibe I10", ["i10.png"], "vibe", 500, 900, 0, 0, 8_000, 18_000),
  makeLoop("vibe-i11", "Standing vibe I11", ["i11.png"], "vibe", 500, 900, 0, 0, 8_000, 18_000),
  makeLoop("vibe-i12", "Standing vibe I12", ["i12.png"], "vibe", 500, 900, 0, 0, 8_000, 18_000),
  makeLoop("vibe-a37", "Standing vibe A37", ["a37.png"], "vibe", 500, 900, 0, 0, 8_000, 18_000),
  makeLoop("vibe-a38", "Standing vibe A38", ["a38.png"], "vibe", 500, 900, 0, 0, 8_000, 18_000)
];
const activeLoops = [...quickLoops, ...vibeLoops];

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
  // Keep the previous playing performance across record-change cinematics.
  private lastPlayingLoop: PerformancePose | null = null;
  private lastTrackId: string | null = null;
  private cinematicFiredForTrack = false;
  private earlyCinematicSourceId: string | null = null;
  private earlyCinematicTarget: NormalizedTrack | null = null;
  private earlyCinematicLoopIndex = 0;
  private earlyCinematicAttemptedFor: string | null = null;
  private latestPlayback: NormalizedTrack | null = null;
  private cinematicForCurrentTrack = 0;
  private nextCinematicForNewTrack = 0;
  private lastStatus = "";
  private previousFrame = "";
  private pendingSongChangeCinematic = false;
  private tempoBpm = 96;
  private speakingRequested = false;
  private speakingVisualActive = false;
  private nextSpeakingPoseAt = 0;
  private lastSpeakingPose: string | null = null;
  // Only retain the small record-change pose set. Caching every large sprite
  // indefinitely would cost far more memory than the benefit on mobile.
  private readonly cinematicPoseBitmaps = new Map<string, HTMLImageElement>();
  private readonly decodedCinematicPoses = new Set<string>();
  private readonly headBob: HeadBobController | null;
  private headNodsEnabled = false;
  private beatTiming: BeatTiming | null = null;

  constructor(private readonly poseElement: HTMLElement, private readonly modeElement: HTMLElement) {
    this.headBob = poseElement instanceof HTMLImageElement ? new HeadBobController(poseElement) : null;
    this.preload();
    this.bindKeyboardControls();
    this.startNormalLoop("idle", Date.now());
    this.currentFrame = this.currentLoop.frames[0] || "i1.png";
    this.paint();
  }

  update(
    playback: NormalizedTrack,
    now = Date.now(),
    songChangeCinematicReady = true,
    upcoming: NormalizedTrack | null = null,
    upcomingArtworkDecoded = false,
  ): DjMode {
    this.latestPlayback = playback;
    const nextMode = this.resolveMode(playback);

    // Spotify AI DJ commentary looks like "no track" in the normalized playback.
    // While our independent detector reports speech, keep the visible DJ in the
    // speaking pose family instead of letting idle/paused overwrite each frame.
    // Do not consume track-change timing: the next actual song must still get its
    // existing album-reveal cinematic.
    if (this.speakingRequested && this.controlMode === "normal") {
      if (!this.speakingVisualActive) {
        this.speakingVisualActive = true;
        this.nextSpeakingPoseAt = 0;
      }
      if (now >= this.nextSpeakingPoseAt) this.advanceSpeakingPose(now);
      this.paint();
      return this.mode;
    }

    if (this.speakingVisualActive) {
      this.speakingVisualActive = false;
      this.nextSpeakingPoseAt = 0;
      // Restore the correct loop immediately so a talking pose cannot linger
      // through a normal music, paused, or idle transition.
      this.mode = nextMode;
      this.startNormalLoop(nextMode, now);
    }

    this.handleTrackTiming(
      playback, nextMode, now, songChangeCinematicReady,
      upcoming, upcomingArtworkDecoded,
    );

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

  setSpeakingActive(active: boolean): void {
    this.speakingRequested = active;
  }

  private advanceSpeakingPose(now: number): void {
    // Pick a fresh random pose at the start of each commentary segment and
    // another different pose only if the DJ keeps talking for ~4.5 seconds.
    // Brief updates naturally use a single pose throughout.
    const choices = SPEAKING_POSES.filter((pose) => pose !== this.lastSpeakingPose);
    this.currentFrame = choices[randomInt(0, choices.length - 1)] || SPEAKING_POSES[0];
    this.lastSpeakingPose = this.currentFrame;
    this.nextSpeakingPoseAt = now + SPEAKING_POSE_HOLD_MS;
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

  setTempoBpm(bpm: number): void {
    if (!Number.isFinite(bpm) || bpm <= 0) return;
    this.tempoBpm = Math.max(55, Math.min(190, bpm));
  }

  setBeatTiming(timing: BeatTiming | null): void {
    this.beatTiming = timing;
  }

  /** The queued album, only while pre-rolling the ending track's cinematic. */
  getEarlyCinematicArtworkTrack(track: NormalizedTrack): NormalizedTrack | null {
    return track.trackId === this.earlyCinematicSourceId ? this.earlyCinematicTarget : null;
  }

  setVinylPlayback(track: NormalizedTrack): void {
    const upcoming = this.getEarlyCinematicArtworkTrack(track);
    if (upcoming) this.headBob?.prepareUpcomingVinyl(upcoming);
    // DJ cinematic state, not album decode or song elapsed time, determines
    // when the newly assigned vinyl can actually appear on the platter.
    // During Spotify DJ commentary, handleTrackTiming intentionally waits
    // until the commentary ends to detect the following song. If its track ID
    // already arrived, keep the vinyl staged rather than dropping it early.
    const trackStillAwaitingSpeechHandoff = Boolean(
      this.controlMode === "normal" && this.speakingRequested &&
      this.lastTrackId && track.trackId && this.lastTrackId !== track.trackId
    );
    const cinematicPhase =
      this.cinematicOnce || (this.controlMode === "cinematic" && this.currentLoop.kind === "cinematic")
        ? "active"
        : (this.pendingSongChangeCinematic || trackStillAwaitingSpeechHandoff)
          ? "pending"
          : "none";
    this.headBob?.setVinylPlayback(track, cinematicPhase);
  }

  /** Use the *visible* sprite (not the next undecoded target frame) to
   * keep the held album in the correct location through pose transitions.
   * Only the true record-change loop may display these overlays.
   */
  getHeldRecordCinematic(): { side: HeldRecordSide; pose: string } | null {
    const inCinematic = this.cinematicOnce ||
      (this.controlMode === "cinematic" && this.currentLoop.kind === "cinematic");
    if (!inCinematic) return null;
    const side: HeldRecordSide | null =
      this.currentLoop.id === "place-record-right" ? "right" :
      this.currentLoop.id === "place-record-left" ? "left" : null;
    if (!side) return null;
    const pose = this.poseElement instanceof HTMLImageElement
      ? this.poseElement.dataset.pose || this.currentFrame
      : this.currentFrame;
    return { side, pose };
  }

  setHeadNodsEnabled(enabled: boolean): void {
    if (this.headNodsEnabled === enabled) return;
    this.headNodsEnabled = enabled;
    // Turning nods off restores the original DJ immediately, even between
    // playback polls or after the animation frame is throttled.
    this.paint();
  }

  getDebugStatus(): Record<string, string | number | boolean> {
    return {
      mode: this.mode,
      controlMode: this.controlMode,
      speakingPoseActive: this.speakingVisualActive,
      beatPhaseSource: this.beatTiming?.phaseSource || "none",
      beatTempoSource: this.beatTiming?.tempoSource || "none",
      beatBpm: this.beatTiming ? Number(this.beatTiming.bpm.toFixed(2)) : 0,
      vinyl: this.headBob?.getVinylStatus() ?? "unavailable",
      pose: this.currentFrame,
      loop: this.currentLoop.label,
      quickLoops: quickLoops.length,
      vibeLoops: vibeLoops.length,
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

  private handleTrackTiming(
    playback: NormalizedTrack,
    nextMode: DjMode,
    now: number,
    songChangeCinematicReady: boolean,
    upcoming: NormalizedTrack | null,
    upcomingArtworkDecoded: boolean,
  ): void {
    const isActive = nextMode === "playing" || nextMode === "demo";
    const trackId = playback.trackId;

    if (trackId && trackId !== this.lastTrackId) {
      const hadPreviousTrack = Boolean(this.lastTrackId);
      const matchedEarly = Boolean(
        this.earlyCinematicTarget?.trackId === trackId &&
        this.earlyCinematicSourceId === this.lastTrackId
      );
      const earlyLoopIndex = this.earlyCinematicLoopIndex;
      // A skip can replace the predicted next queue item. If so, the early
      // cinematic was about the wrong track and must not suppress the real one.
      if (this.earlyCinematicSourceId && !matchedEarly) this.cinematicOnce = false;
      this.earlyCinematicSourceId = null;
      this.earlyCinematicTarget = null;
      this.earlyCinematicAttemptedFor = null;
      // If the page was hidden/throttled and we only discover the new track well into playback,
      // do not play a late song-change cinematic in the middle of the song.
      const discoveredNearTrackStart = playback.progressMs < 12_000 || playback.source === "demo";
      const shouldQueueSongChangeCinematic =
        hadPreviousTrack &&
        isActive &&
        discoveredNearTrackStart &&
        this.controlMode === "normal" &&
        !this.cinematicOnce && !matchedEarly;

      this.lastTrackId = trackId;
      this.cinematicFiredForTrack = matchedEarly;
      this.cinematicForCurrentTrack = matchedEarly ? earlyLoopIndex : this.nextCinematicForNewTrack;
      this.nextCinematicForNewTrack = 1 - this.cinematicForCurrentTrack;
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

    // The next-up queue gives us the actual next album early enough to pick
    // up/place it during the current song's final five seconds.
    if (isActive && this.controlMode === "normal" &&
        !this.cinematicOnce && !this.pendingSongChangeCinematic &&
        !this.speakingRequested && trackId &&
        this.earlyCinematicAttemptedFor !== trackId &&
        shouldBeginEarlyCinematic({
          ...playback,
          progressMs: Math.min(
            playback.durationMs || playback.progressMs,
            playback.progressMs + Math.max(0, now - playback.updatedAt),
          ),
        }, upcoming, upcomingArtworkDecoded) &&
        upcoming) {
      this.earlyCinematicSourceId = trackId;
      this.earlyCinematicTarget = upcoming;
      this.earlyCinematicAttemptedFor = trackId;
      this.earlyCinematicLoopIndex = this.nextCinematicForNewTrack;
      this.triggerCinematicOnce(now, this.earlyCinematicLoopIndex);
    }
  }

  private triggerCinematicOnce(now: number, index = this.cinematicForCurrentTrack): void {
    const loop = cinematicLoops[index % cinematicLoops.length] || cinematicLoops[0];
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
    const base = this.frameBaseDuration(loop);
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

  private frameBaseDuration(loop: AnimationLoop): number {
    const organicBase = randomInt(loop.minFrameMs, loop.maxFrameMs);
    // About half of the core scratch frame changes lock to the BPM grid. The
    // other half stay organic/random so DJ NES feels musical without becoming a
    // rigid metronome. Cinematics and idle/paused poses are never beat-quantized.
    if (loop.kind !== "quick" || Math.random() >= 0.5) return organicBase;

    const beatMs = 60_000 / Math.max(55, Math.min(190, this.tempoBpm || 96));
    const grid = beatMs * (Math.random() < 0.72 ? 0.5 : 1);
    const jitter = beatMs * (Math.random() * 0.10 - 0.05);
    const beatDuration = Math.max(loop.minFrameMs, Math.min(loop.maxFrameMs, grid + jitter));
    return Math.round(organicBase * 0.35 + beatDuration * 0.65);
  }

  private startNormalLoop(mode: DjMode, now: number): void {
    this.cinematicOnce = false;
    const pool = this.poolForMode(mode);
    if (!pool.length) return;

    if (mode === "playing" || mode === "demo") {
      this.currentLoop = choosePerformancePose(quickLoops, vibeLoops, this.lastPlayingLoop);
      this.lastPlayingLoop = this.currentLoop;
    } else {
      // Idle and paused retain their independent, calm random selection.
      this.currentLoop = pool[randomInt(0, pool.length - 1)];
      this.lastPlayingLoop = null;
    }
    this.normalLoopIndex = pool.indexOf(this.currentLoop);
    this.frameIndex = 0;
    this.previousFrame = "";
    this.currentFrame = this.currentLoop.frames[0] || this.currentFrame;
    this.loopEndsAt = now + this.loopDurationForMode(mode);
    // A standing pose has no body frames to cycle; only its separate head moves.
    this.nextFrameAt = this.currentLoop.kind === "vibe"
      ? this.loopEndsAt
      : now + this.frameDuration(this.currentLoop, 1);
  }

  private poolForMode(mode: DjMode): AnimationLoop[] {
    if (mode === "playing" || mode === "demo") return activeLoops;
    if (mode === "paused") return pausedLoops;
    return idleLoops;
  }

  private loopDurationForMode(mode: DjMode): number {
    if (mode === "playing" || mode === "demo") {
      return performancePoseHoldMs(this.currentLoop.kind === "vibe" ? "vibe" : "quick", this.currentLoop.maxLoopMs);
    }
    if (mode === "burst") return randomInt(this.currentLoop.minLoopMs, this.currentLoop.maxLoopMs);
    if (mode === "paused") return randomInt(25_000, 50_000);
    return randomInt(30_000, 60_000);
  }

  private enterNormalMode(now: number): void {
    this.controlMode = "normal";
    this.startNormalLoop(this.mode, now);
  }

  private enterAuditionMode(): void {
    this.controlMode = "audition";
    this.currentLoop = activeLoops[this.auditionIndex] || activeLoops[0];
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
      this.auditionIndex = wrapIndex(this.auditionIndex + delta, activeLoops.length);
      this.currentLoop = activeLoops[this.auditionIndex] || this.currentLoop;
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
    // The composite renderer handles both scratch and standing-vibe loops.
    // Scratch body transitions still work with head nods Off; standing bodies
    // remain static while their heads move on the existing beat clock.
    // Never bob record changes, AI commentary, idle or paused poses.
    const now = Date.now();
    const performanceEligible =
      this.controlMode === "normal" &&
      (this.currentLoop.kind === "quick" || this.currentLoop.kind === "vibe") &&
      (this.mode === "playing" || this.mode === "demo") &&
      !this.cinematicOnce && !this.pendingSongChangeCinematic &&
      !this.speakingRequested && !this.speakingVisualActive;
    const nodPlayback = this.latestPlayback;
    // Head bobbing stays active for the full middle of the song. Around 35%
    // of 12-second phrases use a smooth 25–100% amplitude dip instead of
    // disabling nodding. First and last 15 seconds remain head-nod free.
    const nodIntensity = nodPlayback?.isPlaying && this.beatTiming
      ? headNodIntensityDuringTrack(
          this.beatTiming.trackKey,
          this.beatTiming.trackProgressMs,
          nodPlayback.durationMs,
        )
      : 0;
    this.headBob?.update(
      this.currentFrame,
      this.headNodsEnabled,
      performanceEligible,
      this.beatTiming,
      now,
      Math.max(0, this.nextFrameAt - now),
      nodIntensity,
    );
    if (this.poseElement instanceof HTMLImageElement) {
      // Hold the outgoing image during the record-change cinematic until the
      // next pose is decoded. Otherwise Chrome can briefly display empty or
      // incomplete portions of a transparent sprite after an src swap.
      if (this.cinematicPoseBitmaps.has(this.currentFrame) &&
          !this.decodedCinematicPoses.has(this.currentFrame)) return;
      const nextSrc = `${POSE_BASE}${this.currentFrame}`;
      if (this.poseElement.getAttribute("src") !== nextSrc) {
        this.poseElement.src = nextSrc;
      }
    }

    const label = this.speakingVisualActive ? "speaking" : this.controlMode === "normal" ? this.mode : this.controlMode;
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
      `order: ${this.shouldUseOrganicScratchOrder(this.currentLoop) ? "organic/random scratch" : "sequential"}`,
      `beat clock: ${this.beatTiming?.phaseSource || "none"} / ${this.beatTiming?.tempoSource || "none"} / ${this.beatTiming?.bpm.toFixed(1) || "--"} BPM`,
      `vinyl: ${this.headBob?.getVinylStatus() ?? "unavailable"}`
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
    [...activeLoops, ...cinematicLoops, ...idleLoops, ...pausedLoops].forEach((loop) => {
      loop.frames.forEach((frame) => unique.add(frame));
    });
    SPEAKING_POSES.forEach((pose) => unique.add(pose));
    const cinematicFrames = new Set(cinematicLoops.flatMap((loop) => loop.frames));
    unique.forEach((frame) => {
      const img = new Image();
      img.src = `${POSE_BASE}${frame}`;
      if (!cinematicFrames.has(frame)) return;
      this.cinematicPoseBitmaps.set(frame, img);
      if (typeof img.decode === "function") {
        void img.decode()
          .then(() => { this.decodedCinematicPoses.add(frame); })
          .catch(() => {
            // On older browsers a valid decoded source can still reject.
            if (img.complete && img.naturalWidth > 0) this.decodedCinematicPoses.add(frame);
          });
      } else {
        img.onload = () => { this.decodedCinematicPoses.add(frame); };
        if (img.complete && img.naturalWidth > 0) this.decodedCinematicPoses.add(frame);
      }
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
