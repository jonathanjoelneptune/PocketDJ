import type { NormalizedTrack } from "../state/types";

export type LyricLine = {
  timeMs: number | null;
  text: string;
};

export type LyricsPayload = {
  source: "lrclib" | "none";
  status: "idle" | "loading" | "found" | "not-found" | "instrumental" | "error";
  trackKey: string;
  plainLyrics: string;
  syncedLyrics: LyricLine[];
  error?: string;
};

const LRCLIB_BASE = "https://lrclib.net/api/search";

export const emptyLyrics = (status: LyricsPayload["status"] = "idle"): LyricsPayload => ({
  source: "none",
  status,
  trackKey: "",
  plainLyrics: "",
  syncedLyrics: [],
});

export function getLyricsTrackKey(track: NormalizedTrack): string {
  if (!track.trackId && !track.title) return "";

  return [
    track.trackId || "",
    normalizeKey(track.title),
    normalizeKey(track.artist),
    normalizeKey(track.album),
    Math.round((track.durationMs || 0) / 1000),
  ].join("|");
}

export async function fetchLyricsForTrack(track: NormalizedTrack): Promise<LyricsPayload> {
  const trackKey = getLyricsTrackKey(track);

  if (!track.title || track.source === "none") {
    return emptyLyrics("idle");
  }

  const params = new URLSearchParams({
    track_name: stripSpotifyDecorations(track.title),
    artist_name: primaryArtist(track.artist),
  });

  if (track.album) params.set("album_name", track.album);

  try {
    const response = await fetch(`${LRCLIB_BASE}?${params.toString()}`, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return {
        ...emptyLyrics("error"),
        trackKey,
        error: `LRCLIB request failed: ${response.status}`,
      };
    }

    const results = (await response.json()) as Array<{
      id: number;
      trackName: string;
      artistName: string;
      albumName?: string;
      duration?: number;
      instrumental?: boolean;
      plainLyrics?: string | null;
      syncedLyrics?: string | null;
    }>;

    const best = pickBestLyricsMatch(results, track);

    if (!best) {
      return {
        ...emptyLyrics("not-found"),
        trackKey,
      };
    }

    if (best.instrumental) {
      return {
        ...emptyLyrics("instrumental"),
        source: "lrclib",
        trackKey,
      };
    }

    const syncedLyrics = parseLrc(best.syncedLyrics || "");
    const plainLyrics = best.plainLyrics || syncedLyrics.map((line) => line.text).join("\n");

    if (!plainLyrics.trim() && syncedLyrics.length === 0) {
      return {
        ...emptyLyrics("not-found"),
        source: "lrclib",
        trackKey,
      };
    }

    return {
      source: "lrclib",
      status: "found",
      trackKey,
      plainLyrics,
      syncedLyrics,
    };
  } catch (error) {
    return {
      ...emptyLyrics("error"),
      trackKey,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function getActiveLyricIndex(lyrics: LyricLine[], playbackMs: number): number {
  let active = -1;

  for (let index = 0; index < lyrics.length; index += 1) {
    const timeMs = lyrics[index].timeMs;
    if (timeMs === null) continue;
    if (timeMs <= playbackMs) active = index;
    else break;
  }

  return active;
}

function parseLrc(raw: string): LyricLine[] {
  return raw
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)$/);
      if (!match) return null;

      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = match[3] || "0";
      const ms = Number(fraction.padEnd(3, "0").slice(0, 3));
      const text = match[4].trim();

      return {
        timeMs: minutes * 60_000 + seconds * 1000 + ms,
        text,
      };
    })
    .filter((line): line is LyricLine => Boolean(line && line.text));
}

function pickBestLyricsMatch<T extends { trackName: string; artistName: string; albumName?: string; duration?: number }>(
  results: T[],
  track: NormalizedTrack,
): T | null {
  if (!results.length) return null;

  const targetTitle = normalizeKey(stripSpotifyDecorations(track.title));
  const targetArtist = normalizeKey(primaryArtist(track.artist));
  const targetAlbum = normalizeKey(track.album);
  const targetDurationSeconds = Math.round((track.durationMs || 0) / 1000);

  return [...results]
    .sort((a, b) => {
      const scoreA = scoreMatch(a, targetTitle, targetArtist, targetAlbum, targetDurationSeconds);
      const scoreB = scoreMatch(b, targetTitle, targetArtist, targetAlbum, targetDurationSeconds);
      return scoreB - scoreA;
    })[0];
}

function scoreMatch(
  candidate: { trackName: string; artistName: string; albumName?: string; duration?: number },
  title: string,
  artist: string,
  album: string,
  durationSeconds: number,
): number {
  let score = 0;

  const candidateTitle = normalizeKey(candidate.trackName);
  const candidateArtist = normalizeKey(candidate.artistName);
  const candidateAlbum = normalizeKey(candidate.albumName || "");

  if (candidateTitle === title) score += 50;
  else if (candidateTitle.includes(title) || title.includes(candidateTitle)) score += 20;

  if (candidateArtist.includes(artist) || artist.includes(candidateArtist)) score += 30;
  if (album && candidateAlbum === album) score += 10;

  if (durationSeconds && candidate.duration) {
    const delta = Math.abs(Number(candidate.duration) - durationSeconds);
    if (delta <= 2) score += 20;
    else if (delta <= 5) score += 10;
  }

  return score;
}

function primaryArtist(artist: string): string {
  return artist.split(",")[0]?.trim() || artist;
}

function stripSpotifyDecorations(title: string): string {
  return title
    .replace(/\s+-\s+Remaster(ed)?\s*\d*/gi, "")
    .replace(/\s+\((?:feat\.|with|from|remaster).*?\)/gi, "")
    .replace(/\s+\[(?:feat\.|with|from|remaster).*?\]/gi, "")
    .trim();
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
