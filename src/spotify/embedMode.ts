/**
 * Spotify Android embedded-artwork presentation.
 * Activated only when the Android WebView opens /#spotify-embed.
 * OAuth returns to the canonical unfragmented redirect URI; sessionStorage
 * remembers the presentation across the cross-origin PKCE round trip.
 * Normal desktop/mobile PocketDJ never receives these styles.
 */
const EMBED_SESSION_KEY = "pocketdj_spotify_embed_v1";
let enabled = false;

export function initializeSpotifyEmbed(): void {
  const search = new URLSearchParams(window.location.search);
  // Two independent opt-ins: explicit URL query is reliable in Android WebView;
  // hash preserves compatibility with all existing v1.0 APK installations.
  const requested = search.get("spotify_embed") === "1" ||
    /(?:^|[&#])spotify-embed(?:$|[=&])/i.test(window.location.hash);
  try {
    if (requested) sessionStorage.setItem(EMBED_SESSION_KEY, "1");
    enabled = requested || sessionStorage.getItem(EMBED_SESSION_KEY) === "1";
  } catch {
    enabled = requested;
  }
  if (!enabled) return;
  document.documentElement.classList.add("spotify-embed-active", "spotify-embed-compact");
  // The Android WebView exposes Spotify's own background around the room.
  // Do not create or animate duplicate album-art gradients in compact mode.
  // Useful for diagnosing repeated login without ever exposing tokens.
  try {
    const raw = localStorage.getItem("pocket_dj_spotify_tokens");
    const session = raw ? JSON.parse(raw) as { refreshToken?: string; expiresAt?: number } : null;
    console.info("[PocketDJ auth] WebView session", {
      storedSession: Boolean(session),
      hasRefreshToken: Boolean(session?.refreshToken),
      expired: Boolean(session && Number(session.expiresAt || 0) <= Date.now())
    });
  } catch {
    console.info("[PocketDJ auth] Stored session unreadable");
  }
  // This method is invoked by the trusted Android container on Expand/Compact.
  // It carries no credentials, OAuth codes, or player data across the bridge.
  (window as Window & { pocketDjSpotifySetCompact?: (compact: boolean) => void })
    .pocketDjSpotifySetCompact = (compact: boolean) => {
      document.documentElement.classList.toggle("spotify-embed-compact", Boolean(compact));
    };
  console.info("[PocketDJ embed] Mode enabled", {
    query: search.has("spotify_embed"),
    hash: window.location.hash === "#spotify-embed",
    width: window.innerWidth,
    height: window.innerHeight
  });
}

/**
 * No album-wash work is required in transparent Spotify embed mode.
 * Keep this exported compatibility hook for existing playback updates.
 */
export function updateSpotifyEmbedArtwork(_url: string | null): void {
  // The room remains rendered normally; the surrounding area is native alpha.
}
