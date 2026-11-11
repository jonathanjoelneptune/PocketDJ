/**
 * Spotify Android embedded-artwork presentation.
 * Activated only when the Android WebView opens /#spotify-embed.
 * OAuth returns to the canonical unfragmented redirect URI; sessionStorage
 * remembers the presentation across the cross-origin PKCE round trip.
 * Normal desktop/mobile PocketDJ never receives these styles.
 */
const EMBED_SESSION_KEY = "pocketdj_spotify_embed_v1";
let enabled = false;
let lastArtwork: string | null = null;
let activeLayer = -1;
const atmosphereLayers: HTMLDivElement[] = [];

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
  const stage = document.querySelector<HTMLElement>(".stage");
  if (stage) {
    for (let i = 0; i < 2; i += 1) {
      const layer = document.createElement("div");
      layer.className = "spotify-embed-atmosphere";
      layer.setAttribute("aria-hidden", "true");
      stage.prepend(layer);
      atmosphereLayers.push(layer);
    }
  }
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

export function updateSpotifyEmbedArtwork(url: string | null): void {
  if (!enabled || url === lastArtwork) return;
  lastArtwork = url;
  let artwork = "";
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:") {
        const safe = parsed.href.replace(/[\\"]/g, (c) => "\\" + c);
        artwork = `url("${safe}")`;
      }
    } catch {
      // Use ambient gradient when cover image is unavailable.
    }
  }
  if (!atmosphereLayers.length) return;
  activeLayer = (activeLayer + 1) % atmosphereLayers.length;
  const next = atmosphereLayers[activeLayer];
  next.style.backgroundImage = artwork || "linear-gradient(135deg,#223850,#111725 60%,#492b2f)";
  // Insert image before changing opacity; crossfade after the next paint.
  requestAnimationFrame(() => {
    next.classList.add("spotify-embed-atmosphere-active");
    for (let i = 0; i < atmosphereLayers.length; i += 1) {
      if (i !== activeLayer) atmosphereLayers[i].classList.remove("spotify-embed-atmosphere-active");
    }
  });
}
