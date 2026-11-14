/**
 * Playback-only bridge from the Spicetify extension to the existing Pocket DJ renderer.
 * Loaded only when ?spotify_desktop=1 is used inside a Spotify-owned iframe.
 * No OAuth code, access token, refresh token or Spotify API calls cross this bridge.
 */
import type { NormalizedTrack } from "../state/types";

const HOST_ORIGINS = new Set([
  "https://xpui.app.spotify.com",
  "https://open.spotify.com",
  "https://app.spotify.com",
  "https://desktop.spotify.com"
]);

export const isSpotifyDesktopEmbed =
  new URLSearchParams(window.location.search).get("spotify_desktop") === "1" &&
  window.parent !== window;

function text(value: unknown, max = 300): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function finiteMs(value: unknown): number {
  const number = typeof value === "number" || typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

export function installSpotifyDesktopBridge(onPlayback: (track: NormalizedTrack) => void): void {
  if (!isSpotifyDesktopEmbed) return;
  const onMessage = (event: MessageEvent): void => {
    // This accepts playback metadata only from the immediate Spotify parent,
    // never messages from other frames or arbitrary browser origins.
    if (event.source !== window.parent || !HOST_ORIGINS.has(event.origin)) return;
    const packet = event.data as {type?: string; track?: Record<string, unknown>} | null;
    if (!packet || packet.type !== "pocketdj:desktop-playback" || !packet.track) return;
    const received = packet.track;
    const id = text(received.trackId, 128);
    const title = text(received.title);
    const artist = text(received.artist);
    const album = text(received.album);
    const art = text(received.albumArtUrl, 1200);
    const image = art.startsWith("https://") ? art : null;
    const playing = received.isPlaying === true;
    const incoming: NormalizedTrack = {
      source: id || title ? "spotify" : "none",
      isAuthenticated: true,
      isPlaying: playing,
      trackId: id || null,
      title: title || "No track playing",
      artist,
      album,
      albumArtUrl: image,
      progressMs: finiteMs(received.progressMs),
      durationMs: finiteMs(received.durationMs),
      updatedAt: Date.now(),
      tempoBpm: null,
      playbackContextUri: text(received.playbackContextUri) || null,
      playbackContextType: text(received.playbackContextType) || null
    };
    onPlayback(incoming);
    document.documentElement.dataset.pocketDjDesktopConnected = "1";
  };

  window.addEventListener("message", onMessage);
  window.parent.postMessage({type: "pocketdj:desktop-ready"}, "*");
  console.info("[PocketDJ] Spotify Desktop bridge listening");
}
