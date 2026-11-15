/**
 * Metadata-only playback bridge and MiniPlayer double-click relay for Spicetify.
 * Loaded only when ?spotify_desktop=1 is used inside a Spotify-owned iframe.
 * No OAuth code, access token, refresh token or Spotify API calls cross this bridge.
 */
import type { NormalizedTrack } from "../state/types";
import type { SpotifyCatalogTrack } from "./spotifyClient";

const HOST_ORIGINS = new Set([
  "https://xpui.app.spotify.com",
  "https://open.spotify.com",
  "https://app.spotify.com",
  "https://desktop.spotify.com"
]);

const desktopQuery = new URLSearchParams(window.location.search);
const isMiniPlayer = desktopQuery.get("surface") === "mini";

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


export type DesktopAlbumColors = { trackId: string; primary: string; secondary: string };

function artworkUrl(value: unknown): string | null {
  const raw = text(value, 1200);
  if (raw.startsWith("https://")) return raw;
  const match = /^spotify:image:([a-z0-9]+)$/i.exec(raw);
  return match ? "https://i.scdn.co/image/" + match[1] : null;
}

function desktopQueue(value: unknown): SpotifyCatalogTrack[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tracks: SpotifyCatalogTrack[] = [];
  for (const raw of value.slice(0, 6)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const id = text(row.id, 128);
    if (!id || !/^[a-zA-Z0-9]+$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    tracks.push({
      kind: "track",
      id,
      uri: text(row.uri, 160) || "spotify:track:" + id,
      name: text(row.name),
      artists: text(row.artists),
      artistId: null,
      album: text(row.album),
      albumUri: text(row.albumUri, 160) || null,
      albumArtUrl: artworkUrl(row.albumArtUrl),
      durationMs: finiteMs(row.durationMs)
    });
    if (tracks.length === 4) break;
  }
  return tracks;
}

function desktopColors(value: unknown, trackId: string): DesktopAlbumColors | null {
  if (!value || typeof value !== "object" || !trackId) return null;
  const row = value as Record<string, unknown>;
  if (text(row.trackId, 128) !== trackId) return null;
  const clean = (value: unknown): string | null => {
    const raw = text(value, 9);
    return /^#?[0-9a-f]{6}$/i.test(raw) ? "#" + raw.replace(/^#/, "").toLowerCase() : null;
  };
  const primary = clean(row.primary);
  const secondary = clean(row.secondary);
  return primary && secondary ? { trackId, primary, secondary } : null;
}

export function installSpotifyDesktopBridge(
  onPlayback: (track: NormalizedTrack) => void,
  onRoomMedia?: (queue: SpotifyCatalogTrack[], colors: DesktopAlbumColors | null) => void
): void {
  if (!isSpotifyDesktopEmbed) return;
  let connectedAcknowledged = false;
  const onMessage = (event: MessageEvent): void => {
    // This accepts playback metadata only from the immediate Spotify parent,
    // never messages from other frames or arbitrary browser origins.
    // The PiP window owns the iframe, but Spotify's main window sends the
    // playback packet. Accept that path only for the explicitly requested
    // MiniPlayer surface and only from a verified Spotify origin. No tokens
    // are exchanged. All other surfaces still require their direct parent.
    if (!HOST_ORIGINS.has(event.origin)) return;
    if (event.source !== window.parent && !isMiniPlayer) return;
    const packet = event.data as {type?: string; track?: Record<string, unknown>; queue?: unknown; albumColors?: unknown} | null;
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
    if (onRoomMedia) {
      onRoomMedia(desktopQueue(packet.queue), desktopColors(packet.albumColors, id));
    }
    document.documentElement.dataset.pocketDjDesktopConnected = "1";
    if (!connectedAcknowledged) {
      connectedAcknowledged = true;
      window.parent.postMessage({type: "pocketdj:desktop-connected"}, "*");
    }
  };

  // The room occupies a cross-origin iframe inside Chromium's PiP window.
  // DOM double-click events do not bubble from that iframe to the PiP parent,
  // so relay this *intent only* from inside the renderer. No credentials or
  // privileged instructions are carried in this message.
  if (isMiniPlayer) {
    document.addEventListener("dblclick", (event: MouseEvent) => {
      if (event.button !== 0 || !event.isTrusted) return;
      window.parent.postMessage({type: "pocketdj:desktop-return-to-spotify"}, "*");
    }, {capture: true});
  }

  window.addEventListener("message", onMessage);
  window.parent.postMessage({type: "pocketdj:desktop-ready"}, "*");
  console.info("[PocketDJ] Spotify Desktop bridge listening");
}
