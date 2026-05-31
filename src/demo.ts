import type { NormalizedTrack } from "./state/types";

const demoTracks = [
  { title: "Neon Side Quest", artist: "Pocket DJ", durationMs: 182_000, tempoBpm: 124 },
  { title: "Static on the Dancefloor", artist: "Analog Neptune", durationMs: 214_000, tempoBpm: 92 },
  { title: "Late Checkout Groove", artist: "The Tiny Speakers", durationMs: 196_000, tempoBpm: 108 }
];

let demoStartedAt = Date.now();
let demoIndex = 0;
let demoPlaying = false;

export function toggleDemo(): boolean {
  demoPlaying = !demoPlaying;
  if (demoPlaying) demoStartedAt = Date.now();
  return demoPlaying;
}

export function stopDemo(): void {
  demoPlaying = false;
}

export function getDemoTrack(): NormalizedTrack {
  const track = demoTracks[demoIndex % demoTracks.length];
  const elapsed = demoPlaying ? Date.now() - demoStartedAt : 0;

  if (elapsed >= track.durationMs) {
    demoIndex += 1;
    demoStartedAt = Date.now();
  }

  const activeTrack = demoTracks[demoIndex % demoTracks.length];
  const progress = demoPlaying ? Date.now() - demoStartedAt : 0;

  return {
    source: "demo",
    isAuthenticated: false,
    isPlaying: demoPlaying,
    trackId: `demo-${demoIndex}`,
    title: activeTrack.title,
    artist: activeTrack.artist,
    album: "Demo Crate",
    albumArtUrl: null,
    progressMs: Math.min(progress, activeTrack.durationMs),
    durationMs: activeTrack.durationMs,
    updatedAt: Date.now(),
    tempoBpm: activeTrack.tempoBpm
  };
}
