/**
 * Opt-in full web room presentation for Spicetify Desktop.
 *
 * Desktop Spotify already has its own controls and mini/fullscreen chrome.
 * We render the original Pocket DJ room and full marquee while suppressing
 * duplicate standalone web controls inside the iframe. Android and the
 * normal website retain their existing layouts.
 */
export function applySpotifyDesktopExtendedLayout(): void {
  const search = new URLSearchParams(window.location.search);
  if (search.get("spotify_desktop") !== "1" || search.get("layout") !== "extended") return;
  const root = document.documentElement;
  root.classList.add("spotify-embed-desktop-extended");
  root.classList.remove("spotify-embed-tablet-marquee");
  root.dataset.pocketDjDesktopLayout = "extended";
  if (document.getElementById("pocketdj-desktop-extended-style")) return;
  const style = document.createElement("style");
  style.id = "pocketdj-desktop-extended-style";
  style.textContent = `
    html.spotify-embed-desktop-extended,
    html.spotify-embed-desktop-extended body,
    html.spotify-embed-desktop-extended #app {
      width: 100% !important;
      height: 100% !important;
      min-height: 0 !important;
      overflow: hidden !important;
      background: transparent !important;
    }
    html.spotify-embed-desktop-extended .stage {
      width: 100% !important;
      height: 100% !important;
      min-height: 0 !important;
      position: fixed !important;
      inset: 0 !important;
      display: grid !important;
      place-items: center !important;
      overflow: hidden !important;
      background: transparent !important;
    }
    html.spotify-embed-desktop-extended .room {
      --room-w: min(100vw, calc(100vh * 16 / 9)) !important;
      --room-h: calc(var(--room-w) * 9 / 16) !important;
      width: var(--room-w) !important;
      height: var(--room-h) !important;
      max-width: 100vw !important;
      max-height: 100vh !important;
      min-height: 0 !important;
      overflow: hidden !important;
      margin: auto !important;
      transform: none !important;
      border: 0 !important;
      border-radius: 2px;
      box-shadow: none !important;
      outline: 2px solid #050505 !important;
      outline-offset: -2px;
    }
    html.spotify-embed-desktop-extended .stage::before,
    html.spotify-embed-desktop-extended .stage::after,
    html.spotify-embed-desktop-extended .spotify-embed-atmosphere {
      display: none !important;
    }
    /* Spotify owns transport, menus and lyrics controls outside the iframe.
       Hide duplicate standalone chrome without touching the scene itself. */
    html.spotify-embed-desktop-extended :is(
      #controlCard, #panelToggle, #sidePanelTab, #menu2Panel,
      #floorPlayer, #animationDebugPanel,
      .control-card, .panel-toggle, .side-panel-tab,
      .menu2-panel, .menu2-rail, .menu2-bubble, .menu2-fold-dock,
      .floor-player, .side-panel, .pocket-title-pill
    ) {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
    /* The full browser marquee implementation handles title, artist and
       album rotation; do not activate the phone's tiny text-fitting variant. */
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
