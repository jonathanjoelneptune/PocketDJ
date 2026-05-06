export type PlaybackSource = "spotify" | "demo" | "none";

export type NormalizedTrack = {
  source: PlaybackSource;
  isAuthenticated: boolean;
  isPlaying: boolean;
  trackId: string | null;
  title: string;
  artist: string;
  album: string;
  albumArtUrl: string | null;
  progressMs: number;
  durationMs: number;
  updatedAt: number;
};

export type DjMode = "idle" | "playing" | "burst" | "paused" | "empty" | "demo";

export type AppState = {
  spotifyClientId: string;
  redirectUri: string;
  playback: NormalizedTrack;
  djMode: DjMode;
  debugOpen: boolean;
};

export const emptyTrack = (): NormalizedTrack => ({
  source: "none",
  isAuthenticated: false,
  isPlaying: false,
  trackId: null,
  title: "No track connected",
  artist: "Connect Spotify or start demo mode",
  album: "",
  albumArtUrl: null,
  progressMs: 0,
  durationMs: 0,
  updatedAt: Date.now()
});
