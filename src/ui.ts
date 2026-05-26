import type { AppState, NormalizedTrack } from "./state/types";
import { formatMs, qs } from "./utils/dom";

type MarqueeState = "empty" | "paused" | "playing";

type MarqueePayload = {
  text: string;
  state: MarqueeState;
  key: string;
};

let lastMarqueeKey = "";
let marqueeSwapTimer: number | null = null;

export function renderShell(state: AppState): void {
  qs<HTMLDivElement>("#app").innerHTML = `
    <main class="stage">
      <section class="room" aria-label="Pocket DJ room">
        <div class="room-bg" style="background-image:url(\'./assets/room/pocket-dj-room-offline-v1.png\')" aria-hidden="true"></div>
        <div class="album-wash" id="albumWash"></div>
        <div class="room-filter-overlay warm-club" id="roomFilterOverlay" aria-hidden="true"></div>

        <div class="room-speaker room-speaker-left" id="leftSpeaker" aria-hidden="true">
          <div class="speaker-pulse"></div>
          <img class="speaker-image" src="./assets/Speaker.png" alt="" draggable="false" />
        </div>
        <div class="room-speaker room-speaker-right" id="rightSpeaker" aria-hidden="true">
          <div class="speaker-pulse"></div>
          <img class="speaker-image" src="./assets/Speaker.png" alt="" draggable="false" />
        </div>

        <div class="floor-shadow table-floor-shadow" aria-hidden="true"></div>
        <div class="floor-shadow dj-feet-shadow" aria-hidden="true"></div>

        <div class="marquee" aria-live="polite">
          <div class="marquee-viewport">
            <span id="marqueeText">Nothing is currently playing • Start Spotify and Pocket DJ will wake up</span>
          </div>
        </div>

        <div class="dj-wrap">
          <img
            id="djSprite"
            class="dj-frame-img"
            src="./assets/poses/final/i1.png"
            alt="Pocket DJ"
            draggable="false"
          />
        </div>
      </section>

      <button id="panelToggle" class="panel-toggle" type="button" aria-label="Show Pocket DJ controls" title="Show controls">♪</button>

      <button id="animationDebugToggle" class="animation-debug-toggle" type="button" aria-label="Show current animation frame" title="Show current animation frame">Frame</button>
      <pre id="animationDebugPanel" class="animation-debug-panel" hidden>frame: loading</pre>

      <aside id="controlCard" class="control-card control-card-open">
        <div class="brand-row">
          <div>
            <p class="eyebrow">Spotify-reactive room</p>
            <h1>Pocket DJ</h1>
          </div>
          <div class="brand-actions">
            <div class="mode-pill" id="modePill">IDLE</div>
            <button id="hidePanel" class="panel-close" type="button" aria-label="Hide controls">×</button>
          </div>
        </div>

        <div id="connectionBanner" class="connection-banner disconnected">
          <strong>Spotify is not connected</strong>
          <span>Paste your Client ID, then connect Spotify from this hosted GitHub Pages URL.</span>
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


        <details class="room-utility-controls" open>
          <summary>Room utility controls</summary>

          <label class="field-label" for="sceneFilterSelect">Scene filter</label>
          <select id="sceneFilterSelect" class="text-input">
            <option value="none">None</option>
            <option value="warm-club">Warm club</option>
            <option value="dreamy-blue">Dreamy blue</option>
            <option value="deep-night">Deep night</option>
            <option value="retro-vhs">Retro VHS</option>
            <option value="neon-purple" selected>Neon purple</option>
            <option value="cinematic-amber">Cinematic amber</option>
            <option value="moody-lowlight">Moody lowlight</option>
          </select>

          <div class="utility-grid">
            <label>Left speaker X % <span id="speakerLeftXValue">38.6</span>
              <input id="speakerLeftX" type="range" min="0" max="100" step="0.1" value="38.6" />
            </label>
            <label>Right speaker X % <span id="speakerRightXValue">63.1</span>
              <input id="speakerRightX" type="range" min="0" max="100" step="0.1" value="63.1" />
            </label>
            <label>Speaker Y % <span id="speakerYValue">70.5</span>
              <input id="speakerY" type="range" min="0" max="100" step="0.1" value="70.5" />
            </label>
            <label>Speaker scale <span id="speakerScaleValue">1.15</span>
              <input id="speakerScale" type="range" min="0.25" max="1.8" step="0.01" value="1.15" />
            </label>
            <label>Speaker opacity <span id="speakerOpacityValue">1.0</span>
              <input id="speakerOpacity" type="range" min="0" max="1" step="0.01" value="1.0" />
            </label>
            <label>Speaker pulse <span id="speakerPulseValue">0.5</span>
              <input id="speakerPulse" type="range" min="0" max="1" step="0.01" value="0.5" />
            </label>
          </div>

          <div class="utility-grid">
            <label>Filter strength <span id="filterStrengthValue">0.2</span>
              <input id="filterStrength" type="range" min="0" max="0.5" step="0.01" value="0.2" />
            </label>
            <label>Vignette strength <span id="vignetteStrengthValue">0.2</span>
              <input id="vignetteStrength" type="range" min="0" max="0.55" step="0.01" value="0.2" />
            </label>
            <label>Shadow opacity <span id="shadowOpacityValue">1.0</span>
              <input id="shadowOpacity" type="range" min="0" max="1" step="0.01" value="1.0" />
            </label>
            <label>Table shadow size <span id="tableShadowScaleValue">1.16</span>
              <input id="tableShadowScale" type="range" min="0.4" max="1.8" step="0.01" value="1.16" />
            </label>
          </div>

          <div class="button-grid utility-buttons">
            <button id="saveRoomUtility" class="secondary" type="button">Save room utility</button>
            <button id="resetRoomUtility" class="secondary" type="button">Reset utility</button>
          </div>
        </details>

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
  setTextIfChanged(qs("#trackTitle"), track.title);
  setTextIfChanged(qs("#trackArtist"), track.artist);
  updateMarquee(track);
  updateConnectionBanner(track);

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
    wash.style.opacity = "0.10";
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

export function setControlPanelOpen(open: boolean): void {
  const card = qs<HTMLElement>("#controlCard");
  const toggle = qs<HTMLButtonElement>("#panelToggle");

  card.classList.toggle("control-card-open", open);
  card.classList.toggle("control-card-hidden", !open);
  toggle.classList.toggle("panel-toggle-visible", !open);
  toggle.setAttribute("aria-expanded", String(open));
}

function updateMarquee(track: NormalizedTrack): void {
  const marquee = qs<HTMLElement>(".marquee");
  const textElement = qs<HTMLElement>("#marqueeText");
  const payload = buildMarqueePayload(track);

  marquee.classList.toggle("marquee-paused", payload.state === "paused");
  marquee.classList.toggle("marquee-empty", payload.state === "empty");

  if (payload.key === lastMarqueeKey) return;
  lastMarqueeKey = payload.key;

  textElement.classList.add("marquee-text-changing");
  marquee.classList.remove("marquee-swap");
  void marquee.offsetWidth;
  marquee.classList.add("marquee-swap");

  window.setTimeout(() => {
    textElement.style.animation = "none";
    textElement.textContent = payload.text;
    void textElement.offsetWidth;
    textElement.style.animation = "";
    textElement.classList.remove("marquee-text-changing");
  }, 110);

  if (marqueeSwapTimer) window.clearTimeout(marqueeSwapTimer);
  marqueeSwapTimer = window.setTimeout(() => {
    marquee.classList.remove("marquee-swap");
  }, 520);
}

function buildMarqueePayload(track: NormalizedTrack): MarqueePayload {
  let text: string;
  let state: MarqueeState;

  if (track.source === "demo") {
    state = track.isPlaying ? "playing" : "paused";
    text = track.isPlaying
      ? `${track.title} • ${track.artist}`
      : `Paused • ${track.title} • ${track.artist}`;
  } else if (!track.isAuthenticated || !track.trackId) {
    state = "empty";
    text = "Nothing is currently playing • Start Spotify and Pocket DJ will wake up";
  } else if (!track.isPlaying) {
    state = "paused";
    text = `Paused • ${track.title} • ${track.artist}`;
  } else {
    state = "playing";
    text = `${track.title} • ${track.artist}`;
  }

  return {
    text,
    state,
    key: `${state}::${text.toUpperCase()}`
  };
}

function updateConnectionBanner(track: NormalizedTrack): void {
  const banner = qs<HTMLDivElement>("#connectionBanner");

  if (track.source === "demo") {
    banner.className = "connection-banner demo";
    banner.innerHTML = "<strong>Demo mode is running</strong><span>Spotify is not connected. The room is using sample playback data.</span>";
    return;
  }

  if (track.isAuthenticated) {
    banner.className = "connection-banner connected";
    banner.innerHTML = "<strong>Spotify connected</strong><span>The control panel is hidden automatically so the room stays clean.</span>";
    return;
  }

  banner.className = "connection-banner disconnected";
  banner.innerHTML = "<strong>Spotify is not connected</strong><span>Paste your Client ID, then connect Spotify from this hosted GitHub Pages URL.</span>";
}

function setTextIfChanged(element: Element, value: string): void {
  if (element.textContent !== value) element.textContent = value;
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
