/**
 * Spotify Android embedded-artwork presentation.
 * Activated only when the Android WebView opens /#spotify-embed.
 * OAuth returns to the canonical unfragmented redirect URI; sessionStorage
 * remembers the presentation across the cross-origin PKCE round trip.
 * Normal desktop/mobile PocketDJ never receives these styles.
 */
const EMBED_SESSION_KEY = "pocketdj_spotify_embed_v1";
let enabled = false;

/**
 * WebView's onPageFinished is not a reliable readiness signal for the visual
 * room: HTML may be present while image decoding, the pixel font, and the
 * first sprite compositing are still pending. Explicitly warm only the
 * handful of assets required for the initial scene, and do it during native
 * artwork display rather than after the user's first swipe.
 *
 * All URLs stay on the existing PocketDJ origin. Normal website mode is not
 * affected. A missing image does not block the whole room indefinitely.
 */
function beginEmbeddedRoomWarmup(): void {
  const root = document.documentElement;
  root.dataset.pocketDjEmbedWarm = "loading";
  const criticalAssets = [
    "./assets/room/pocket-dj-room-offline-v1.png",
    "./assets/Speaker.png",
    "./assets/Speaker Driver.png",
  ];
  const images = Array.from(document.querySelectorAll<HTMLImageElement>(
    "#leftSpeaker img, #rightSpeaker img, #djSprite"
  ));
  for (const element of images) {
    element.loading = "eager";
    element.decoding = "sync";
    const src = element.getAttribute("src");
    if (src && !src.startsWith("data:")) criticalAssets.push(src);
  }

  const decode = async (path: string): Promise<boolean> => {
    try {
      const absolute = new URL(path, document.baseURI).href;
      const image = new Image();
      image.decoding = "sync";
      image.src = absolute;
      if (typeof image.decode === "function") {
        await image.decode();
        return image.naturalWidth > 0;
      }
      if (image.complete) return image.naturalWidth > 0;
      return await new Promise<boolean>(resolve => {
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  };

  const fontReady = document.fonts
    ? Promise.all([
        document.fonts.load('12px "Press Start 2P"'),
        document.fonts.ready
      ]).then(() => true, () => false)
    : Promise.resolve(true);

  void Promise.all([
    Promise.all([...new Set(criticalAssets)].map(decode)),
    fontReady
  ]).then(([results, fontLoaded]) => {
    // Retry only failed built-in sprite elements once; a cache miss on
    // startup should not permanently remove the speakers.
    images.forEach(image => {
      if (image.complete && image.naturalWidth === 0) {
        const original = image.getAttribute("src");
        if (original) image.src = new URL(original, document.baseURI).href;
      }
    });
    root.dataset.pocketDjEmbedWarm = results.every(Boolean) && fontLoaded
      ? "ready" : "partial";
    console.info("[PocketDJ embed] critical scene warmup", {
      ready: root.dataset.pocketDjEmbedWarm,
      loaded: results.filter(Boolean).length,
      requested: results.length,
      fontLoaded
    });
  });
}

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
  beginEmbeddedRoomWarmup();
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
