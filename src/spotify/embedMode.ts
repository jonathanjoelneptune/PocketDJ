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
  const requested = /(?:^|[&#])spotify-embed(?:$|[=&])/i.test(window.location.hash);
  try {
    if (requested) sessionStorage.setItem(EMBED_SESSION_KEY, "1");
    enabled = requested || sessionStorage.getItem(EMBED_SESSION_KEY) === "1";
  } catch {
    enabled = requested;
  }
  if (!enabled) return;
  document.documentElement.classList.add("spotify-embed-active", "spotify-embed-compact");
  // This method is invoked by the trusted Android container on Expand/Compact.
  // It carries no credentials, OAuth codes, or player data across the bridge.
  (window as Window & { pocketDjSpotifySetCompact?: (compact: boolean) => void })
    .pocketDjSpotifySetCompact = (compact: boolean) => {
      document.documentElement.classList.toggle("spotify-embed-compact", Boolean(compact));
    };
  console.info("[PocketDJ embed] Mode enabled; compact artwork view");
}

export function updateSpotifyEmbedArtwork(url: string | null): void {
  if (!enabled) return;
  const root = document.documentElement;
  if (!url) {
    root.style.removeProperty("--spotify-embed-album-art");
    return;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return;
    // Escape quotes and backslashes before inserting into a CSS url().
    const safe = parsed.href.replace(/[\\"]/g, (c) => "\\" + c);
    root.style.setProperty("--spotify-embed-album-art", `url("${safe}")`);
  } catch {
    root.style.removeProperty("--spotify-embed-album-art");
  }
}
