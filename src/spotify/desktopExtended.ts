/**
 * Strictly opt-in Spicetify desktop room presentation.
 * Keep Spotify as the transport UI, but use full Pocket DJ marquee/room
 * geometry. Never touch normal web pages or Android WebView embed modes.
 */
export function applySpotifyDesktopExtendedLayout(): void {
  const search = new URLSearchParams(window.location.search);
  if (search.get("spotify_desktop") !== "1" || search.get("layout") !== "extended") return;
  const root = document.documentElement;
  root.classList.add("spotify-embed-desktop-extended", "spotify-embed-tablet-marquee");
  root.dataset.pocketDjDesktopLayout = "extended";
  if (document.getElementById("pocketdj-desktop-extended-style")) return;
  const style = document.createElement("style");
  style.id = "pocketdj-desktop-extended-style";
  style.textContent = `
    /* Overrides the Android-only tall/square media queries for desktop frames.
       Preserve sprite geometry and avoid mobile overflow/cropping rules. */
    html.spotify-embed-desktop-extended .stage {
      align-items: center !important;
      justify-content: center !important;
      overflow: hidden !important;
    }
    html.spotify-embed-desktop-extended .room {
      --room-w: min(100vw, calc(100vh * 16 / 9)) !important;
      --room-h: calc(var(--room-w) * 9 / 16) !important;
      width: var(--room-w) !important;
      height: var(--room-h) !important;
      max-height: 100vh !important;
      min-height: 0 !important;
      overflow: hidden !important;
      margin: auto !important;
      transform: none !important;
      border-radius: 2px;
      outline: 2px solid #050505 !important;
      outline-offset: -2px;
    }
    html.spotify-embed-desktop-extended .stage::after {
      display: none !important;
      content: none !important;
    }
    /* Restore full web presentation of marquee metadata, not the tiny
       phone-only artist/title variant. The renderer retains its animation. */
    html.spotify-embed-desktop-extended .marquee-content {
      gap: clamp(5px, 0.55vw, 10px) !important;
    }
    html.spotify-embed-desktop-extended .marquee-title,
    html.spotify-embed-desktop-extended .marquee-artist {
      letter-spacing: 0.045em !important;
      -webkit-text-size-adjust: none;
      text-size-adjust: none;
    }
  `;
  document.head.appendChild(style);
}
