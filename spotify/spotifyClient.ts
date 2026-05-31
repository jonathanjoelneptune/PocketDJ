import { createAuthorizeUrl, readAndClearVerifier, validateState } from "./pkce";
import { clearTokens, loadTokens, saveClientId, saveTokens, type TokenRecord } from "./tokenStore";
import type { NormalizedTrack } from "../state/types";

export const spotifyScopes = [
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-private"
];

type SpotifyImage = { url: string; height?: number; width?: number };
type SpotifyArtist = { name: string };
type SpotifyTrackItem = {
  id: string;
  name: string;
  duration_ms: number;
  artists?: SpotifyArtist[];
  album?: { name?: string; images?: SpotifyImage[] };
};

type CurrentlyPlayingResponse = {
  is_playing?: boolean;
  progress_ms?: number;
  item?: SpotifyTrackItem | null;
};

export function getDefaultRedirectUri(): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return url.toString();
}

export async function startSpotifyLogin(clientId: string, redirectUri = getDefaultRedirectUri()): Promise<void> {
  const cleanClientId = clientId.trim();
  if (!cleanClientId) throw new Error("Spotify Client ID is required.");
  saveClientId(cleanClientId);
  const authorizeUrl = await createAuthorizeUrl({ clientId: cleanClientId, redirectUri, scopes: spotifyScopes });
  window.location.assign(authorizeUrl);
}

export async function handleSpotifyCallback(clientId: string, redirectUri = getDefaultRedirectUri()): Promise<boolean> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) throw new Error(`Spotify authorization failed: ${error}`);
  if (!code) return false;
  if (!validateState(state)) throw new Error("Spotify auth state mismatch. Please connect again.");

  const verifier = readAndClearVerifier();
  if (!verifier) throw new Error("Missing PKCE verifier. Please connect again.");

  const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier
    })
  });

  const json = await tokenResponse.json();
  if (!tokenResponse.ok) throw new Error(`Token exchange failed: ${json.error_description || json.error || tokenResponse.status}`);

  saveTokens({
    accessToken: json.access_token,
    refreshToken: json.refresh_token || null,
    expiresAt: Date.now() + Number(json.expires_in || 3600) * 1000
  });

  url.searchParams.delete("code");
  url.searchParams.delete("state");
  window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
  return true;
}

async function refreshAccessToken(clientId: string, tokens: TokenRecord): Promise<TokenRecord | null> {
  if (!tokens.refreshToken) return null;

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken
    })
  });

  const json = await response.json();
  if (!response.ok) return null;

  const refreshed: TokenRecord = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || tokens.refreshToken,
    expiresAt: Date.now() + Number(json.expires_in || 3600) * 1000
  };
  saveTokens(refreshed);
  return refreshed;
}

async function getUsableToken(clientId: string): Promise<string | null> {
  let tokens = loadTokens();
  if (!tokens) return null;
  if (tokens.expiresAt <= Date.now() + 60_000) {
    tokens = await refreshAccessToken(clientId, tokens);
  }
  return tokens?.accessToken || null;
}


async function spotifyPlayerCommand(clientId: string, endpoint: string, options: RequestInit = {}): Promise<void> {
  const token = await getUsableToken(clientId);
  if (!token) {
    clearTokens();
    throw new Error("Spotify disconnected. Please connect again.");
  }

  const response = await fetch(`https://api.spotify.com/v1/me/player${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  if (response.status === 401) {
    clearTokens();
    throw new Error("Spotify session expired. Please connect again.");
  }

  if (response.status === 403) {
    throw new Error("Spotify playback control requires Premium and the playback-control permission. Reconnect Spotify if needed.");
  }

  if (response.status === 404) {
    throw new Error("No active Spotify device found. Open Spotify on a device, start playback once, then try again.");
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After") || "30";
    throw new Error(`Spotify rate limited playback controls. Retry after ${retryAfter} seconds.`);
  }

  if (!response.ok && response.status !== 204) {
    throw new Error(`Spotify playback command failed (${response.status}).`);
  }
}

export async function playSpotify(clientId: string): Promise<void> {
  await spotifyPlayerCommand(clientId, "/play", { method: "PUT" });
}

export async function pauseSpotify(clientId: string): Promise<void> {
  await spotifyPlayerCommand(clientId, "/pause", { method: "PUT" });
}

export async function nextSpotifyTrack(clientId: string): Promise<void> {
  await spotifyPlayerCommand(clientId, "/next", { method: "POST" });
}

export async function previousSpotifyTrack(clientId: string): Promise<void> {
  await spotifyPlayerCommand(clientId, "/previous", { method: "POST" });
}

export async function seekSpotify(clientId: string, positionMs: number): Promise<void> {
  const clampedPosition = Math.max(0, Math.round(positionMs));
  await spotifyPlayerCommand(clientId, `/seek?position_ms=${clampedPosition}`, { method: "PUT" });
}

export async function setSpotifyVolume(clientId: string, volumePercent: number): Promise<void> {
  const clampedVolume = Math.max(0, Math.min(100, Math.round(volumePercent)));
  await spotifyPlayerCommand(clientId, `/volume?volume_percent=${clampedVolume}`, { method: "PUT" });
}

export async function setSpotifyShuffle(clientId: string, enabled: boolean): Promise<void> {
  await spotifyPlayerCommand(clientId, `/shuffle?state=${enabled ? "true" : "false"}`, { method: "PUT" });
}

export async function setSpotifyRepeat(clientId: string, mode: "off" | "track" | "context"): Promise<void> {
  await spotifyPlayerCommand(clientId, `/repeat?state=${mode}`, { method: "PUT" });
}

export async function getCurrentlyPlaying(clientId: string): Promise<NormalizedTrack> {
  const token = await getUsableToken(clientId);
  if (!token) {
    clearTokens();
    return {
      source: "none",
      isAuthenticated: false,
      isPlaying: false,
      trackId: null,
      title: "Spotify disconnected",
      artist: "Connect Spotify to start the room",
      album: "",
      albumArtUrl: null,
      progressMs: 0,
      durationMs: 0,
      updatedAt: Date.now()
    };
  }

  const response = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (response.status === 204) {
    return {
      source: "spotify",
      isAuthenticated: true,
      isPlaying: false,
      trackId: null,
      title: "Nothing is currently playing",
      artist: "Start Spotify and Pocket DJ will wake up",
      album: "",
      albumArtUrl: null,
      progressMs: 0,
      durationMs: 0,
      updatedAt: Date.now()
    };
  }

  if (response.status === 401) {
    clearTokens();
    throw new Error("Spotify session expired. Please connect again.");
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After") || "30";
    throw new Error(`Spotify rate limited requests. Retry after ${retryAfter} seconds.`);
  }

  const json = (await response.json()) as CurrentlyPlayingResponse;
  const item = json.item;

  if (!item) {
    return {
      source: "spotify",
      isAuthenticated: true,
      isPlaying: false,
      trackId: null,
      title: "No track available",
      artist: "Spotify returned an empty player state",
      album: "",
      albumArtUrl: null,
      progressMs: 0,
      durationMs: 0,
      updatedAt: Date.now()
    };
  }

  const image = item.album?.images?.[0]?.url || null;
  return {
    source: "spotify",
    isAuthenticated: true,
    isPlaying: Boolean(json.is_playing),
    trackId: item.id,
    title: item.name,
    artist: item.artists?.map((artist) => artist.name).join(", ") || "Unknown artist",
    album: item.album?.name || "",
    albumArtUrl: image,
    progressMs: Number(json.progress_ms || 0),
    durationMs: Number(item.duration_ms || 0),
    updatedAt: Date.now()
  };
}

export function disconnectSpotify(): void {
  clearTokens();
}
