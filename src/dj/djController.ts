import type { DjMode, NormalizedTrack } from "../state/types";

type FrameSet = {
  idle: string[];
  paused: string[];
  playing: string[];
  burst: string[];
};

const POSE_BASE = "./assets/poses/final/";

const frames: FrameSet = {
  idle: [
    "a1.png", "a7.png", "a8.png", "a9.png", "a10.png", "a10-2.png",
    "a13.png", "a13-2.png", "a15.png", "a16.png"
  ],
  paused: [
    "a7.png", "a8.png", "a9.png", "a13.png", "a13-2.png", "a15.png", "a16.png"
  ],
  playing: [
    "a1.png", "a2.png", "a3.png", "a4.png", "a4-2.png", "a5.png", "a6.png",
    "a10.png", "a10-2.png", "a11.png", "a11-2.png", "a11m.png", "a11-2m.png",
    "a12.png", "a12m.png", "a14.png", "a14-2.png", "a17.png", "a18.png",
    "a19.png", "a20.png", "a21.png", "a22.png", "a23.png", "a24.png",
    "a25.png", "a26.png", "a27.png", "a28.png", "a29.png", "a30.png",
    "a31.png", "a32.png", "a33.png", "a34.png", "a35.png", "a36.png",
    "a37.png", "a38.png", "a39.png", "a40.png", "a41.png", "a42.png",
    "a43.png", "a44.png", "a44-2.png", "a44-3.png", "a45.png", "a46.png"
  ],
  burst: [
    "a41.png", "a42.png", "a43.png", "a44.png", "a44-2.png", "a44-3.png",
    "a45.png", "a46.png"
  ]
};

export class DjController {
  private currentMode: DjMode = "idle";
  private currentFrame = "a1.png";
  private lastTrackId: string | null = null;
  private nextFrameAt = 0;
  private burstUntil = 0;

  constructor(private readonly poseElement: HTMLElement, private readonly modeElement: HTMLElement) {
    this.preload();
    this.paint("idle");
  }

  update(playback: NormalizedTrack, now = Date.now()): DjMode {
    const mode = this.resolveMode(playback, now);

    if (playback.trackId && playback.trackId !== this.lastTrackId) {
      this.lastTrackId = playback.trackId;
      this.burstUntil = now + 3400;
      this.currentMode = "burst";
      this.pickNextFrame("burst", now);
      this.paint("burst");
      return "burst";
    }

    if (mode !== this.currentMode) {
      this.currentMode = mode;
      this.pickNextFrame(mode, now);
      this.paint(mode);
      return mode;
    }

    if (now >= this.nextFrameAt) {
      this.pickNextFrame(mode, now);
    }

    this.paint(mode);
    return mode;
  }

  setPose(id: string, now = Date.now()): void {
    this.currentFrame = this.frameForPoseId(id);
    this.nextFrameAt = now + 900;
    this.paint(this.currentMode);
  }

  private resolveMode(playback: NormalizedTrack, now: number): DjMode {
    if (now < this.burstUntil) return "burst";
    if (playback.source === "demo") return playback.isPlaying ? "demo" : "paused";
    if (!playback.isAuthenticated) return "idle";
    if (!playback.trackId) return "idle";
    if (!playback.isPlaying) return "paused";
    return "playing";
  }

  private pickNextFrame(mode: DjMode, now: number): void {
    const frameSet = this.framesForMode(mode);
    const next = frameSet[Math.floor(Math.random() * frameSet.length)] || "a1.png";
    this.currentFrame = next;
    this.nextFrameAt = now + this.durationForMode(mode);
  }

  private framesForMode(mode: DjMode): string[] {
    if (mode === "playing" || mode === "demo") return frames.playing;
    if (mode === "burst") return frames.burst;
    if (mode === "paused") return frames.paused;
    return frames.idle;
  }

  private durationForMode(mode: DjMode): number {
    if (mode === "playing" || mode === "demo") return randomInt(560, 1050);
    if (mode === "burst") return randomInt(420, 780);
    if (mode === "paused") return randomInt(1500, 2800);
    return randomInt(1400, 3200);
  }

  private paint(mode: DjMode): void {
    if (this.poseElement instanceof HTMLImageElement) {
      this.poseElement.src = `${POSE_BASE}${this.currentFrame}`;
    }

    this.poseElement.dataset.pose = this.currentFrame;
    this.poseElement.setAttribute("aria-label", `Pocket DJ ${mode}: ${this.currentFrame}`);
    this.modeElement.textContent = mode.toUpperCase();
    document.documentElement.dataset.djMode = mode;
  }

  private frameForPoseId(id: string): string {
    if (id.endsWith(".png")) return id;
    const legacyMap: Record<string, string> = {
      "idle-center": "a1.png",
      "idle-nod": "a7.png",
      "active-left": "a4.png",
      "active-right": "a5.png",
      "burst-hands": "a44.png",
      "paused-lean": "a9.png"
    };
    return legacyMap[id] || "a1.png";
  }

  private preload(): void {
    const unique = new Set([...frames.idle, ...frames.paused, ...frames.playing, ...frames.burst]);
    unique.forEach((frame) => {
      const img = new Image();
      img.src = `${POSE_BASE}${frame}`;
    });
  }
}

function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}
