import type { AppState, NormalizedTrack } from "./state/types";
import { formatMs, qs } from "./utils/dom";

export function renderShell(state: AppState): void {
  qs<HTMLDivElement>("#app").innerHTML = `
    <main class="stage">
      <section class="room" aria-label="Pocket DJ room">
        <img class="room-bg" src="./assets/room/dj-room.png" alt="" />
        <div class="album-wash" id="albumWash"></div>

        <div class="marquee" aria-live="polite">
          <span id="marqueeText">Loading Pocket DJ...</span>
        </div>

        <div class="dj-wrap">
          <div id="djSprite" class="dj-sprite pose-idle-center" role="img" aria-label="Pocket DJ idle"></div>
          <div class="deck deck-left"></div>
          <div class="deck deck-right"></div>
          <div class="mixer"></div>
        </div>
      </section>

      <aside class="control-card">
        <div class="brand-row">
          <div>
            <p class="eyebrow">Spotify-reactive room</p>
            <h1>Pocket DJ</h1>
          </div>
          <div class="mode-pill" id="modePill">IDLE</div>
        </div>

        <div class="now-card">
          <div class="art" id="albumArt"><span>♪</span></div>
          <div class="track-copy">
            <div class="track-title" id="trackTitle">${state.playback.title}</div>
            <div class="track-artist" id="trackArtist">${state.playback.artist}</div>
            <div class="progress-row">
              <span id="progressNow">0:00</span>
              <div class="progress"><div id="progressFill"></div></div>
              <span id="progressEnd">0:00</span>
            </div>
          </div>
        </div>

        <div class="redirect-card">
          <div class="field-label">Spotify Redirect URI</div>
          <code>${escapeHtml(state.redirectUri)}</code>
          <p>Add this exact hosted page URL in Spotify before connecting. No localhost redirect is needed.</p>
        </div>

        <label class="field-label" for="clientIdInput">Spotify Client ID</label>
        <input id="clientIdInput" class="text-input" value="${escapeHtml(state.spotifyClientId)}" placeholder="Paste client ID from Spotify Dashboard" />

        <div class="button-grid">
          <button id="connectSpotify" class="primary">Connect Spotify</button>
          <button id="disconnectSpotify" class="secondary">Disconnect</button>
          <button id="demoButton" class="secondary">Demo Mode</button>
          <button id="debugButton" class="secondary">Debug</button>
        </div>

        <details class="setup-notes">
          <summary>GitHub Pages setup</summary>
          <ol>
            <li>Deploy this repo with GitHub Actions Pages.</li>
            <li>Copy the deployed HTTPS page URL.</li>
            <li>Add that exact URL as the Spotify Redirect URI.</li>
            <li>Paste the Spotify Client ID above and connect.</li>
          </ol>
        </details>

        <pre id="debugPanel" class="debug-panel" hidden></pre>
      </aside>
    </main>
  `;
}

export function updatePlaybackUi(track: NormalizedTrack, debugOpen: boolean): void {
  qs("#trackTitle").textContent = track.title;
  qs("#trackArtist").textContent = track.artist;
  qs("#marqueeText").textContent = `${track.title}  •  ${track.artist}`;
  qs("#progressNow").textContent = formatMs(getEstimatedProgress(track));
  qs("#progressEnd").textContent = formatMs(track.durationMs);

  const percent = track.durationMs > 0 ? Math.min(100, (getEstimatedProgress(track) / track.durationMs) * 100) : 0;
  qs<HTMLDivElement>("#progressFill").style.width = `${percent}%`;

  const art = qs<HTMLDivElement>("#albumArt");
  const wash = qs<HTMLDivElement>("#albumWash");
  if (track.albumArtUrl) {
    art.style.backgroundImage = `url(${track.albumArtUrl})`;
    art.innerHTML = "";
    wash.style.backgroundImage = `url(${track.albumArtUrl})`;
    wash.style.opacity = "0.11";
  } else {
    art.style.backgroundImage = "";
    art.innerHTML = "<span>♪</span>";
    wash.style.backgroundImage = "";
    wash.style.opacity = "0";
  }

  const debug = qs<HTMLPreElement>("#debugPanel");
  debug.hidden = !debugOpen;
  if (debugOpen) debug.textContent = JSON.stringify(track, null, 2);
}

function getEstimatedProgress(track: NormalizedTrack): number {
  if (!track.isPlaying) return track.progressMs;
  return Math.min(track.durationMs, track.progressMs + (Date.now() - track.updatedAt));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[char] || char));
}
