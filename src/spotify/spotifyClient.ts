import { createAuthorizeUrl, readAndClearVerifier, validateState } from "./pkce";
import { clearTokens, loadTokens, saveClientId, saveTokens, type TokenRecord } from "./tokenStore";
import type { NormalizedTrack } from "../state/types";

export const spotifyScopes = [
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-private",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-library-read",
  "user-read-recently-played",
  "streaming"
];

type SpotifyImage = { url: string; height?: number; width?: number };
type SpotifyArtist = { id?: string; uri?: string; name: string; images?: SpotifyImage[]; followers?: { total?: number }; };
type SpotifyTrackItem = {
  id: string;
  name: string;
  duration_ms: number;
  artists?: SpotifyArtist[];
  album?: { name?: string; uri?: string; images?: SpotifyImage[] };
};

type CurrentlyPlayingResponse = {
  is_playing?: boolean;
  progress_ms?: number;
  item?: SpotifyTrackItem | null;
  context?: { type?: string; uri?: string } | null;
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

export async function getSpotifyAccessToken(clientId: string): Promise<string | null> {
  return getUsableToken(clientId);
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
      updatedAt: Date.now(),
      playbackContextUri: null,
      playbackContextType: null
    };
  }

  const response = await fetch("https://api.spotify.com/v1/me/player", {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (response.status === 204) {
    return {
      source: "spotify",
      isAuthenticated: true,
      isPlaying: false,
      trackId: null,
      title: "Nothing is currently loaded",
      artist: "Choose music on Spotify or press Play Here",
      album: "",
      albumArtUrl: null,
      progressMs: 0,
      durationMs: 0,
      updatedAt: Date.now(),
      playbackContextUri: null,
      playbackContextType: null
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

  if (!response.ok) {
    throw new Error(`Spotify playback state request failed (${response.status}).`);
  }

  const json = (await response.json()) as CurrentlyPlayingResponse & { item?: SpotifyTrackItem | null };
  const item = json.item;

  if (!item) {
    return {
      source: "spotify",
      isAuthenticated: true,
      isPlaying: false,
      trackId: null,
      title: "No track loaded",
      artist: "Choose music on Spotify or press Play Here",
      album: "",
      albumArtUrl: null,
      progressMs: 0,
      durationMs: 0,
      updatedAt: Date.now(),
      playbackContextUri: null,
      playbackContextType: null
    };
  }

  return {
    source: "spotify",
    isAuthenticated: true,
    isPlaying: Boolean(json.is_playing),
    trackId: item.id,
    title: item.name,
    artist: item.artists?.map((artist) => artist.name).join(", ") || "Unknown artist",
    album: item.album?.name || "",
    albumArtUrl: item.album?.images?.[0]?.url || null,
    progressMs: Number(json.progress_ms || 0),
    durationMs: Number(item.duration_ms || 0),
    updatedAt: Date.now(),
    playbackContextUri: json.context?.uri || null,
    playbackContextType: json.context?.type || null
  };
}

export async function getTrackTempoBpm(clientId: string, trackId: string): Promise<number | null> {
  const cleanTrackId = trackId.trim();
  if (!cleanTrackId) return null;

  const token = await getUsableToken(clientId);
  if (!token) return null;

  const headers = { Authorization: `Bearer ${token}` };
  const encodedTrackId = encodeURIComponent(cleanTrackId);

  const readTempo = (value: unknown): number | null => {
    const tempo = Number(value || 0);
    return Number.isFinite(tempo) && tempo > 0 ? tempo : null;
  };

  const featuresResponse = await fetch(`https://api.spotify.com/v1/audio-features/${encodedTrackId}`, { headers });

  if (featuresResponse.status === 401) {
    clearTokens();
    return null;
  }

  if (featuresResponse.ok) {
    const json = (await featuresResponse.json()) as SpotifyAudioFeaturesResponse;
    const tempo = readTempo(json.tempo);
    if (tempo) return tempo;
  }

  // Some Spotify apps/accounts no longer receive audio-features data reliably.
  // Try audio-analysis as a second source before letting the UI use its local estimate.
  const analysisResponse = await fetch(`https://api.spotify.com/v1/audio-analysis/${encodedTrackId}`, { headers });

  if (analysisResponse.status === 401) {
    clearTokens();
    return null;
  }

  if (!analysisResponse.ok) return null;

  const analysisJson = (await analysisResponse.json()) as SpotifyAudioAnalysisResponse;
  return readTempo(analysisJson.track?.tempo);
}

export function disconnectSpotify(): void {
  clearTokens();
}


export type SpotifyCatalogTrack = {
  kind: "track";
  id: string;
  uri: string;
  name: string;
  artists: string;
  artistId: string | null;
  album: string;
  albumUri: string | null;
  albumArtUrl: string | null;
  durationMs: number;
};

export type SpotifyCatalogPlaylist = {
  kind: "playlist";
  id: string;
  uri: string;
  name: string;
  owner: string;
  imageUrl: string | null;
  trackCount: number;
};

export type SpotifyCatalogArtist = {
  kind: "artist";
  id: string;
  uri: string;
  name: string;
  imageUrl: string | null;
  followers: number;
};

export type SpotifyCatalogAlbum = {
  kind: "album";
  id: string;
  uri: string;
  name: string;
  artists: string;
  imageUrl: string | null;
  releaseYear: string;
  trackCount: number;
};

type SpotifyPlaylistItem = {
  id: string;
  uri: string;
  name: string;
  owner?: { display_name?: string };
  images?: SpotifyImage[];
  tracks?: { total?: number };
};

type SpotifyAlbumItem = {
  id: string;
  uri?: string;
  name: string;
  artists?: SpotifyArtist[];
  images?: SpotifyImage[];
  release_date?: string;
  total_tracks?: number;
};

type SpotifyAudioFeaturesResponse = {
  id?: string;
  tempo?: number;
};

type SpotifyAudioAnalysisResponse = {
  track?: {
    tempo?: number;
  };
};

type GetSongBpmSongCandidate = {
  id?: string | number;
  song_id?: string | number;
  title?: string;
  song_title?: string;
  artist?: string | { name?: string } | Array<{ name?: string }>;
  artist_name?: string;
  tempo?: number | string;
  bpm?: number | string;
};

type GetSongBpmSearchResponse = GetSongBpmSongCandidate[] | {
  search?: GetSongBpmSongCandidate[];
  songs?: GetSongBpmSongCandidate[];
  data?: GetSongBpmSongCandidate[];
  results?: GetSongBpmSongCandidate[];
};

type GetSongBpmSongResponse = GetSongBpmSongCandidate | {
  song?: GetSongBpmSongCandidate;
  data?: GetSongBpmSongCandidate;
};


function readTempoBpm(value: unknown): number | null {
  const tempo = Number(value || 0);
  return Number.isFinite(tempo) && tempo >= 40 && tempo <= 220 ? tempo : null;
}

function normalizeLookupText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\b(feat|ft|featuring|remaster(ed)?|explicit|clean|radio edit|single version|album version)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSongBpmCandidates(json: GetSongBpmSearchResponse): GetSongBpmSongCandidate[] {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.search)) return json.search;
  if (Array.isArray(json.songs)) return json.songs;
  if (Array.isArray(json.data)) return json.data;
  if (Array.isArray(json.results)) return json.results;
  return [];
}

function getSongBpmCandidateTempo(candidate: GetSongBpmSongCandidate | null | undefined): number | null {
  if (!candidate) return null;
  return readTempoBpm(candidate.tempo) || readTempoBpm(candidate.bpm);
}

function getSongBpmCandidateId(candidate: GetSongBpmSongCandidate): string {
  return String(candidate.id ?? candidate.song_id ?? "").trim();
}

function getSongBpmCandidateArtist(candidate: GetSongBpmSongCandidate): string {
  if (typeof candidate.artist === "string") return candidate.artist;
  if (Array.isArray(candidate.artist)) return candidate.artist.map((artist) => artist?.name || "").filter(Boolean).join(", ");
  return candidate.artist?.name || candidate.artist_name || "";
}

function pickBestGetSongBpmCandidate(
  candidates: GetSongBpmSongCandidate[],
  title: string,
  artist: string
): GetSongBpmSongCandidate | null {
  if (!candidates.length) return null;

  const targetTitle = normalizeLookupText(title);
  const targetArtist = normalizeLookupText(artist.split(",")[0] || artist);

  const scored = candidates.map((candidate, index) => {
    const candidateTitle = normalizeLookupText(candidate.title || candidate.song_title || "");
    const candidateArtist = normalizeLookupText(getSongBpmCandidateArtist(candidate));
    let score = 0;

    if (candidateTitle === targetTitle) score += 8;
    else if (candidateTitle.includes(targetTitle) || targetTitle.includes(candidateTitle)) score += 4;

    if (targetArtist && candidateArtist === targetArtist) score += 6;
    else if (targetArtist && (candidateArtist.includes(targetArtist) || targetArtist.includes(candidateArtist))) score += 3;

    if (getSongBpmCandidateTempo(candidate)) score += 2;
    return { candidate, score, index };
  });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored[0]?.candidate || null;
}

async function fetchGetSongBpmJson<T>(url: URL): Promise<T | null> {
  // Use URL_PARAM authorization only. A custom X-API-KEY header can trigger
  // browser CORS preflight behavior that prevents GitHub Pages from calling
  // the API directly, even when the key itself is valid.
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 6500);

  try {
    const response = await fetch(url.toString(), { signal: controller.signal });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function getGetSongBpmSongDetails(apiKey: string, candidateId: string): Promise<number | null> {
  const songUrl = new URL("https://api.getsong.co/song/");
  songUrl.searchParams.set("id", candidateId);
  songUrl.searchParams.set("api_key", apiKey);

  const songJson = await fetchGetSongBpmJson<GetSongBpmSongResponse>(songUrl);
  if (!songJson) return null;

  if ("song" in songJson) return getSongBpmCandidateTempo(songJson.song);
  if ("data" in songJson) return getSongBpmCandidateTempo(songJson.data);
  return getSongBpmCandidateTempo(songJson as GetSongBpmSongCandidate);
}

export async function getExternalTrackTempoBpm(apiKey: string, title: string, artist: string): Promise<number | null> {
  const cleanApiKey = apiKey.trim();
  const cleanTitle = title.trim();
  const cleanArtist = artist.trim();
  const primaryArtist = cleanArtist.split(",")[0].trim() || cleanArtist;

  if (!cleanApiKey || !cleanTitle || !primaryArtist) return null;

  const searchPlans = [
    {
      type: "both",
      lookup: `song:${cleanTitle} artist:${primaryArtist}`,
      limit: "10"
    },
    {
      type: "song",
      lookup: cleanTitle,
      limit: "15"
    }
  ];

  for (const plan of searchPlans) {
    const searchUrl = new URL("https://api.getsong.co/search/");
    searchUrl.searchParams.set("type", plan.type);
    searchUrl.searchParams.set("lookup", plan.lookup);
    searchUrl.searchParams.set("limit", plan.limit);
    searchUrl.searchParams.set("api_key", cleanApiKey);

    const json = await fetchGetSongBpmJson<GetSongBpmSearchResponse>(searchUrl);
    if (!json) continue;

    const candidate = pickBestGetSongBpmCandidate(getSongBpmCandidates(json), cleanTitle, primaryArtist);
    const immediateTempo = getSongBpmCandidateTempo(candidate);
    if (immediateTempo) return immediateTempo;

    const candidateId = candidate ? getSongBpmCandidateId(candidate) : "";
    if (!candidateId) continue;

    const detailedTempo = await getGetSongBpmSongDetails(cleanApiKey, candidateId);
    if (detailedTempo) return detailedTempo;
  }

  return null;
}


type SpotifySearchResponse = {
  tracks?: { items?: SpotifyTrackItem[] };
  playlists?: { items?: Array<SpotifyPlaylistItem | null> };
  artists?: { items?: SpotifyArtist[] };
  albums?: { items?: SpotifyAlbumItem[] };
};

type SpotifyPlaylistsResponse = {
  items?: Array<SpotifyPlaylistItem | null>;
};

type SpotifyPlaylistTracksResponse = {
  items?: Array<{ track?: SpotifyTrackItem | null }>;
};

type SpotifySavedTracksResponse = {
  items?: Array<{ track?: SpotifyTrackItem | null }>;
};

type SpotifyRecentlyPlayedResponse = {
  items?: Array<{ track?: SpotifyTrackItem | null }>;
};

type SpotifyQueueResponse = {
  currently_playing?: SpotifyTrackItem | null;
  queue?: Array<SpotifyTrackItem | null>;
};

function normalizeCatalogTrack(item: SpotifyTrackItem | null | undefined): SpotifyCatalogTrack | null {
  if (!item?.id) return null;
  return {
    kind: "track",
    id: item.id,
    uri: `spotify:track:${item.id}`,
    name: item.name || "Untitled track",
    artists: item.artists?.map((artist) => artist.name).filter(Boolean).join(", ") || "Unknown artist",
    artistId: item.artists?.[0]?.id || null,
    album: item.album?.name || "",
    albumUri: item.album?.uri || null,
    albumArtUrl: item.album?.images?.[0]?.url || null,
    durationMs: Number(item.duration_ms || 0)
  };
}

function normalizeCatalogPlaylist(item: SpotifyPlaylistItem | null | undefined): SpotifyCatalogPlaylist | null {
  if (!item?.id) return null;
  return {
    kind: "playlist",
    id: item.id,
    uri: item.uri || `spotify:playlist:${item.id}`,
    name: item.name || "Untitled playlist",
    owner: item.owner?.display_name || "Spotify playlist",
    imageUrl: item.images?.[0]?.url || null,
    trackCount: Number(item.tracks?.total || 0)
  };
}

function normalizeCatalogArtist(item: SpotifyArtist | null | undefined): SpotifyCatalogArtist | null {
  if (!item?.id) return null;
  return {
    kind: "artist",
    id: item.id,
    uri: item.uri || `spotify:artist:${item.id}`,
    name: item.name || "Unknown artist",
    imageUrl: item.images?.[0]?.url || null,
    followers: Number(item.followers?.total || 0)
  };
}

function normalizeCatalogAlbum(item: SpotifyAlbumItem | null | undefined): SpotifyCatalogAlbum | null {
  if (!item?.id) return null;
  return {
    kind: "album",
    id: item.id,
    uri: item.uri || `spotify:album:${item.id}`,
    name: item.name || "Untitled album",
    artists: item.artists?.map((artist) => artist.name).filter(Boolean).join(", ") || "Unknown artist",
    imageUrl: item.images?.[0]?.url || null,
    releaseYear: item.release_date?.slice(0, 4) || "",
    trackCount: Number(item.total_tracks || 0)
  };
}

async function spotifyApiJson<T>(clientId: string, endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = await getUsableToken(clientId);
  if (!token) {
    clearTokens();
    throw new Error("Spotify disconnected. Please connect again.");
  }

  const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });

  if (response.status === 401) {
    clearTokens();
    throw new Error("Spotify session expired. Please connect again.");
  }

  if (response.status === 403) {
    throw new Error("Spotify denied this request. Reconnect Spotify if new browser permissions were added, and confirm the account has access.");
  }

  if (response.status === 404) {
    throw new Error("Spotify could not find that item or no active Spotify device is available.");
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After") || "30";
    throw new Error(`Spotify rate limited this browser action. Retry after ${retryAfter} seconds.`);
  }

  if (!response.ok) {
    let detail = "";
    try {
      const errorJson = await response.json();
      detail = errorJson?.error?.message ? `: ${errorJson.error.message}` : "";
    } catch {
      detail = "";
    }
    throw new Error(`Spotify request failed (${response.status})${detail}`);
  }

  if (response.status === 204) return {} as T;
  return (await response.json()) as T;
}

export async function searchSpotifyCatalog(
  clientId: string,
  query: string,
  type: "track" | "artist" | "playlist" | "album" | "all" = "all",
  limit = 10,
  offset = 0
): Promise<{ tracks: SpotifyCatalogTrack[]; artists: SpotifyCatalogArtist[]; playlists: SpotifyCatalogPlaylist[]; albums: SpotifyCatalogAlbum[] }> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return { tracks: [], artists: [], playlists: [], albums: [] };

  const searchTypes = type === "all" ? "track,artist,playlist,album" : type;
  const endpoint = `/search?${new URLSearchParams({
    q: cleanQuery,
    type: searchTypes,
    limit: String(Math.max(1, Math.min(20, limit))),
    offset: String(Math.max(0, offset))
  }).toString()}`;
  const json = await spotifyApiJson<SpotifySearchResponse>(clientId, endpoint);

  return {
    tracks: (json.tracks?.items || []).map(normalizeCatalogTrack).filter((item): item is SpotifyCatalogTrack => Boolean(item)),
    artists: (json.artists?.items || []).map(normalizeCatalogArtist).filter((item): item is SpotifyCatalogArtist => Boolean(item)),
    playlists: (json.playlists?.items || []).map(normalizeCatalogPlaylist).filter((item): item is SpotifyCatalogPlaylist => Boolean(item)),
    albums: (json.albums?.items || []).map(normalizeCatalogAlbum).filter((item): item is SpotifyCatalogAlbum => Boolean(item))
  };
}

export async function getUserPlaylists(clientId: string, limit = 200): Promise<SpotifyCatalogPlaylist[]> {
  const all: SpotifyCatalogPlaylist[] = [];
  const pageSize = 50;
  let offset = 0;
  const maxToLoad = Math.max(1, Math.min(500, limit));

  while (all.length < maxToLoad) {
    const endpoint = `/me/playlists?${new URLSearchParams({
      limit: String(Math.min(pageSize, maxToLoad - all.length)),
      offset: String(offset)
    }).toString()}`;
    const json = await spotifyApiJson<SpotifyPlaylistsResponse>(clientId, endpoint);
    const page = (json.items || []).map(normalizeCatalogPlaylist).filter((item): item is SpotifyCatalogPlaylist => Boolean(item));
    all.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return all;
}

export async function getPlaylistSummary(clientId: string, playlistId: string): Promise<SpotifyCatalogPlaylist | null> {
  const cleanId = playlistId.trim();
  if (!cleanId) return null;
  const json = await spotifyApiJson<SpotifyPlaylistItem>(clientId, `/playlists/${encodeURIComponent(cleanId)}?fields=id,uri,name,owner(display_name),images,tracks(total)`);
  return normalizeCatalogPlaylist(json);
}

export async function getArtistRelatedPlaylists(clientId: string, artistName: string, limit = 8): Promise<SpotifyCatalogPlaylist[]> {
  const cleanName = artistName.trim();
  if (!cleanName) return [];
  const queries = [`This Is ${cleanName}`, `${cleanName} Radio`, cleanName];
  const merged: SpotifyCatalogPlaylist[] = [];
  const seen = new Set<string>();
  for (const query of queries) {
    const result = await searchSpotifyCatalog(clientId, query, "playlist", Math.max(3, limit), 0);
    for (const playlist of result.playlists) {
      if (seen.has(playlist.id)) continue;
      seen.add(playlist.id);
      merged.push(playlist);
    }
  }
  const normalized = cleanName.toLowerCase();
  return merged.sort((a, b) => {
    const score = (playlist: SpotifyCatalogPlaylist) => {
      const name = playlist.name.toLowerCase();
      let value = 0;
      if (name === `this is ${normalized}`) value += 100;
      if (name.includes(`this is ${normalized}`)) value += 70;
      if (name.includes(`${normalized} radio`)) value += 60;
      if ((playlist.owner || "").toLowerCase().includes("spotify")) value += 20;
      value += Math.min(10, playlist.trackCount / 20);
      return value;
    };
    return score(b) - score(a);
  }).slice(0, Math.max(1, Math.min(20, limit)));
}

export async function getPlaylistTracks(clientId: string, playlistId: string, limit = 50): Promise<SpotifyCatalogTrack[]> {
  const endpoint = `/playlists/${encodeURIComponent(playlistId)}/tracks?${new URLSearchParams({
    limit: String(Math.max(1, Math.min(100, limit))),
    fields: "items(track(id,name,uri,duration_ms,artists(name),album(name,images)))"
  }).toString()}`;
  const json = await spotifyApiJson<SpotifyPlaylistTracksResponse>(clientId, endpoint);
  return (json.items || [])
    .map((item) => normalizeCatalogTrack(item.track))
    .filter((item): item is SpotifyCatalogTrack => Boolean(item));
}

export async function getSavedTracks(clientId: string, limit = 30): Promise<SpotifyCatalogTrack[]> {
  const endpoint = `/me/tracks?${new URLSearchParams({
    limit: String(Math.max(1, Math.min(50, limit)))
  }).toString()}`;
  const json = await spotifyApiJson<SpotifySavedTracksResponse>(clientId, endpoint);
  return (json.items || [])
    .map((item) => normalizeCatalogTrack(item.track))
    .filter((item): item is SpotifyCatalogTrack => Boolean(item));
}

export async function getRecentlyPlayed(clientId: string, limit = 30): Promise<SpotifyCatalogTrack[]> {
  const endpoint = `/me/player/recently-played?${new URLSearchParams({
    limit: String(Math.max(1, Math.min(50, limit)))
  }).toString()}`;
  const json = await spotifyApiJson<SpotifyRecentlyPlayedResponse>(clientId, endpoint);
  return (json.items || [])
    .map((item) => normalizeCatalogTrack(item.track))
    .filter((item): item is SpotifyCatalogTrack => Boolean(item));
}

export async function getSpotifyQueue(clientId: string, limit = 20): Promise<SpotifyCatalogTrack[]> {
  const json = await spotifyApiJson<SpotifyQueueResponse>(clientId, "/me/player/queue");
  return (json.queue || [])
    .slice(0, Math.max(1, Math.min(50, limit)))
    .map(normalizeCatalogTrack)
    .filter((item): item is SpotifyCatalogTrack => Boolean(item));
}

export async function playSpotifyUri(clientId: string, uri: string): Promise<void> {
  await spotifyPlayerCommand(clientId, "/play", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uris: [uri] })
  });
}

export async function playSpotifyContext(clientId: string, contextUri: string, trackUri?: string): Promise<void> {
  await spotifyPlayerCommand(clientId, "/play", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      context_uri: contextUri,
      ...(trackUri ? { offset: { uri: trackUri } } : {})
    })
  });
}

export async function playSpotifyContextShuffled(clientId: string, contextUri: string): Promise<void> {
  await setSpotifyShuffle(clientId, true);
  await playSpotifyContext(clientId, contextUri);
}

export async function addSpotifyUriToQueue(clientId: string, uri: string): Promise<void> {
  await spotifyPlayerCommand(clientId, `/queue?${new URLSearchParams({ uri }).toString()}`, { method: "POST" });
}


export async function getArtistTopTracks(clientId: string, artistId: string): Promise<SpotifyCatalogTrack[]> {
  const endpoint = `/artists/${encodeURIComponent(artistId)}/top-tracks?market=US`;
  const json = await spotifyApiJson<{ tracks?: SpotifyTrackItem[] }>(clientId, endpoint);
  return (json.tracks || [])
    .map(normalizeCatalogTrack)
    .filter((item): item is SpotifyCatalogTrack => Boolean(item));
}


export type SpotifyDevice = {
  id: string | null;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  name: string;
  type: string;
  volume_percent: number | null;
};

type SpotifyDevicesResponse = {
  devices?: SpotifyDevice[];
};

export async function getSpotifyDevices(clientId: string): Promise<SpotifyDevice[]> {
  const token = await getUsableToken(clientId);
  if (!token) {
    clearTokens();
    throw new Error("Spotify disconnected. Please connect again.");
  }

  const response = await fetch("https://api.spotify.com/v1/me/player/devices", {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (response.status === 401) {
    clearTokens();
    throw new Error("Spotify session expired. Please connect again.");
  }

  if (response.status === 403) {
    throw new Error("Spotify denied device access. Reconnect Spotify and confirm Premium is active.");
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After") || "30";
    throw new Error(`Spotify rate limited device requests. Retry after ${retryAfter} seconds.`);
  }

  if (!response.ok) {
    throw new Error(`Spotify devices request failed (${response.status}).`);
  }

  const json = (await response.json()) as SpotifyDevicesResponse;
  return json.devices || [];
}

export async function transferSpotifyPlayback(clientId: string, deviceId: string, play = true): Promise<void> {
  const token = await getUsableToken(clientId);
  if (!token) {
    clearTokens();
    throw new Error("Spotify disconnected. Please connect again.");
  }

  const response = await fetch("https://api.spotify.com/v1/me/player", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      device_ids: [deviceId],
      play
    })
  });

  if (response.status === 401) {
    clearTokens();
    throw new Error("Spotify session expired. Please connect again.");
  }

  if (response.status === 403) {
    throw new Error("Spotify playback transfer requires Premium. Confirm this account has Premium and reconnect if needed.");
  }

  if (response.status === 404) {
    throw new Error("Spotify could not find that playback device. Refresh devices and try again.");
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After") || "30";
    throw new Error(`Spotify rate limited device transfer. Retry after ${retryAfter} seconds.`);
  }

  if (!response.ok && response.status !== 204) {
    throw new Error(`Spotify playback transfer failed (${response.status}).`);
  }
}
