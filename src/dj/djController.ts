import type { DjMode, NormalizedTrack } from "../state/types";
import { getPose, getPosesForMood, poseCatalog, transitionGraph, type PoseDefinition } from "./poseCatalog";

export class DjController {
  private currentPoseId = "idle-center";
  private lastTrackId: string | null = null;
  private nextPoseAt = 0;
  private burstUntil = 0;

  constructor(private readonly poseElement: HTMLElement, private readonly modeElement: HTMLElement) {}

  update(playback: NormalizedTrack, now = Date.now()): DjMode {
    const mode = this.resolveMode(playback, now);

    if (playback.trackId && playback.trackId !== this.lastTrackId) {
      this.lastTrackId = playback.trackId;
      this.burstUntil = now + 3600;
      this.setPose("burst-hands", now);
      this.paint(mode);
      return "burst";
    }

    if (now >= this.nextPoseAt) {
      this.advancePose(mode, now);
    }

    this.paint(mode);
    return mode;
  }

  setPose(id: string, now = Date.now()): void {
    const pose = getPose(id);
    this.currentPoseId = pose.id;
    this.nextPoseAt = now + pose.durationMs;
  }

  private resolveMode(playback: NormalizedTrack, now: number): DjMode {
    if (now < this.burstUntil) return "burst";
    if (playback.source === "demo") return playback.isPlaying ? "demo" : "paused";
    if (!playback.isAuthenticated) return "empty";
    if (!playback.trackId) return "idle";
    if (!playback.isPlaying) return "paused";
    return "playing";
  }

  private advancePose(mode: DjMode, now: number): void {
    const current = getPose(this.currentPoseId);
    const candidates = this.pickCandidateSet(mode, current);
    const next = candidates[Math.floor(Math.random() * candidates.length)] || poseCatalog[0];
    this.setPose(next.id, now);
  }

  private pickCandidateSet(mode: DjMode, current: PoseDefinition): PoseDefinition[] {
    const connected = (transitionGraph[current.id] || []).map(getPose);
    const mood = mode === "playing" || mode === "demo" ? "active" : mode === "burst" ? "burst" : mode === "paused" ? "paused" : "idle";
    const moodConnected = connected.filter((pose) => pose.mood === mood);
    if (moodConnected.length) return moodConnected;
    const moodPoses = getPosesForMood(mood);
    return moodPoses.length ? moodPoses : connected.length ? connected : poseCatalog;
  }

  private paint(mode: DjMode): void {
    const pose = getPose(this.currentPoseId);
    this.poseElement.dataset.pose = pose.id;
    this.poseElement.className = `dj-sprite ${pose.fallbackClass}`;
    this.poseElement.setAttribute("aria-label", pose.label);
    this.modeElement.textContent = mode.toUpperCase();
    document.documentElement.dataset.djMode = mode;
  }
}
