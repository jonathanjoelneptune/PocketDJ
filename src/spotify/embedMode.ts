/**
 * Spotify Android embedded-artwork presentation.
 * Activated only when the Android WebView opens /#spotify-embed.
 * OAuth returns to the canonical unfragmented redirect URI; sessionStorage
 * remembers the presentation across the cross-origin PKCE round trip.
 * Normal desktop/mobile PocketDJ never receives these styles.
 */
const EMBED_SESSION_KEY = "pocketdj_spotify_embed_v1";
let enabled = false;

// Keep the native compact-room layout on every device, but use the original
// full marquee presentation on the unfolded Fold/tablet display. The art-slot
// WebView may be a cropped rectangle, so detect using the SCREEN's short side,
// not the album-art viewport's aspect ratio or width.
const TABLET_MARQUEE_MIN_SHORT_SIDE_CSS_PX = 480;

function updateSpotifyTabletMarquee(): void {
  const root = document.documentElement;
  const shortSide = Math.min(window.screen.width, window.screen.height);
  const fullMarquee = enabled && root.classList.contains("spotify-embed-compact") &&
    shortSide >= TABLET_MARQUEE_MIN_SHORT_SIDE_CSS_PX;
  const wasFull = root.classList.contains("spotify-embed-tablet-marquee");
  root.classList.toggle("spotify-embed-tablet-marquee", fullMarquee);
  if (wasFull !== fullMarquee) {
    console.info("[PocketDJ embed] Marquee layout", {
      mode: fullMarquee ? "tablet-full" : "phone-compact",
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      viewportWidth: window.innerWidth
    });
  }
}

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

/**
 * Recover failed built-in speaker PNGs without re-rendering the room.
 *
 * The speaker cabinets and moving cones are separate PNGs. An intermittent
 * Android WebView image failure can leave both cabinets transparent while the
 * cones still animate. Warmup alone cannot guarantee a later decode succeeds.
 *
 * Track the existing DOM <img> elements, retry only missing images, and
 * recheck when Spotify returns the WebView to the foreground. A bounded
 * cache-busted retry avoids a poisoned image-cache entry without causing
 * continuous network traffic or changing other scene layers.
 */
function watchEmbeddedSpeakerAssets(): void {
  const selector = "#leftSpeaker .speaker-image, #rightSpeaker .speaker-image, " +
    "#leftSpeaker .speaker-driver, #rightSpeaker .speaker-driver";
  const tracked = Array.from(document.querySelectorAll<HTMLImageElement>(selector));
  if (tracked.length === 0) return;
  const maxAttempts = 3;
  const retries = new WeakMap<HTMLImageElement, number>();
  const pending = new WeakSet<HTMLImageElement>();
  const originals = new WeakMap<HTMLImageElement, string>();

  for (const img of tracked) {
    const src = img.getAttribute("src");
    if (!src) continue;
    originals.set(img, new URL(src, document.baseURI).href);
    retries.set(img, 0);
    img.loading = "eager";
    img.decoding = "sync";
  }

  const recover = (img: HTMLImageElement): void => {
    if (!document.documentElement.classList.contains("spotify-embed-compact")) return;
    if (img.complete && img.naturalWidth > 0) return;
    if (pending.has(img)) return;
    const original = originals.get(img);
    const attempt = retries.get(img) ?? 0;
    if (!original || attempt >= maxAttempts) return;
    retries.set(img, attempt + 1);
    pending.add(img);

    // Fetch into a detached image first. A successful decode is then swapped
    // onto the visible element; failed attempts never replace healthy imagery.
    const url = new URL(original);
    url.searchParams.set("pd_speaker_retry", String(attempt + 1));
    const probe = new Image();
    probe.decoding = "sync";
    const timeout = window.setTimeout(() => {
      probe.onload = null;
      probe.onerror = null;
      pending.delete(img);
    }, 5000);
    probe.onload = () => {
      window.clearTimeout(timeout);
      const finish = () => {
        pending.delete(img);
        if (probe.naturalWidth > 0 &&
            (!img.complete || img.naturalWidth === 0)) {
          img.src = url.href;
        }
      };
      if (typeof probe.decode === "function") {
        void probe.decode().then(finish, finish);
      } else {
        finish();
      }
    };
    probe.onerror = () => {
      window.clearTimeout(timeout);
      pending.delete(img);
    };
    probe.src = url.href;
  };

  const check = (): void => {
    if (document.hidden) return;
    for (const img of tracked) {
      if (img.isConnected && img.complete && img.naturalWidth === 0) recover(img);
    }
  };

  for (const img of tracked) {
    img.addEventListener("error", () => recover(img));
  }

  // The WebView can resume with only part of its image content decoded.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) window.setTimeout(check, 250);
  });
  window.addEventListener("pageshow", () => window.setTimeout(check, 250));
  window.addEventListener("pocketdj:embed-compact", () => window.setTimeout(check, 250));

  // Limited early-life checks: delayed failures do not always dispatch error
  // before Spotify makes the artwork carousel visible.
  const checks = [1600, 3500, 7000, 12000];
  for (const delay of checks) window.setTimeout(check, delay);
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
  updateSpotifyTabletMarquee();
  // Fold, rotate and split-window changes should re-evaluate the marquee only.
  // Room geometry, native carousel and WebView session remain untouched.
  window.addEventListener("resize", updateSpotifyTabletMarquee, { passive: true });
  window.addEventListener("orientationchange", () => {
    window.setTimeout(updateSpotifyTabletMarquee, 120);
  }, { passive: true });
  beginEmbeddedRoomWarmup();
  watchEmbeddedSpeakerAssets();
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
      updateSpotifyTabletMarquee();
      // Native carousel re-entry may occur without a page navigation.
      if (compact) window.dispatchEvent(new Event("pocketdj:embed-compact"));
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
