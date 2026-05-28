import type { LyricsPayload } from "./lyrics/lyricsClient";
import type { AppState, NormalizedTrack } from "./state/types";
import { formatMs, qs } from "./utils/dom";


let lastLyricsRenderSignature = "";

type MarqueeState = "empty" | "paused" | "playing";

type MarqueePayload = {
  title: string;
  artist: string;
  state: MarqueeState;
  key: string;
  titleLong: boolean;
  artistLong: boolean;
};

let lastMarqueeKey = "";
let marqueeSwapTimer: number | null = null;
let marqueeTitleScrollTimer: number | null = null;

export function renderShell(state: AppState): void {
  qs<HTMLDivElement>("#app").innerHTML = `
    <main class="stage">
      <section class="room" aria-label="Pocket DJ room">
        <div class="room-bg" style="background-image:url(\'./assets/room/pocket-dj-room-offline-v1.png\')" aria-hidden="true"></div>
        <div class="album-wash" id="albumWash"></div>
        <div class="room-filter-overlay warm-club" id="roomFilterOverlay" aria-hidden="true"></div>

        <div id="lyricsCeiling" class="lyrics-ceiling lyric-poster-ceiling" aria-live="polite">
          <div class="lyrics-boundary-guides" aria-hidden="true">
            <div class="lyrics-boundary-guide lyrics-boundary-guide-video"></div>
          </div>
          <div id="activeLyricsBlock" class="active-lyrics-block lyric-poster-line" aria-hidden="true"></div>
        </div>

        <div class="room-speaker room-speaker-left" id="leftSpeaker" aria-hidden="true">
          <img class="speaker-image" src="./assets/Speaker.png" alt="" draggable="false" />
          <div class="speaker-driver-anchor">
            <img class="speaker-driver" src="./assets/Speaker Driver.png" alt="" draggable="false" />
          </div>
        </div>
        <div class="room-speaker room-speaker-right" id="rightSpeaker" aria-hidden="true">
          <img class="speaker-image" src="./assets/Speaker.png" alt="" draggable="false" />
          <div class="speaker-driver-anchor">
            <img class="speaker-driver" src="./assets/Speaker Driver.png" alt="" draggable="false" />
          </div>
        </div>

        <div class="floor-shadow table-floor-shadow" aria-hidden="true"></div>
        <div class="floor-shadow dj-feet-shadow" aria-hidden="true"></div>

        <div class="marquee marquee-empty" aria-live="polite">
          <div class="marquee-viewport">
            <div class="marquee-content" id="marqueeContent">
              <div class="marquee-title" id="marqueeTitle">POCKET DJ</div>
              <div class="marquee-artist" id="marqueeArtist">Listening lounge ready</div>
            </div>
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

        <div class="floor-player floor-player-hidden" id="floorPlayer" aria-label="Spotify floor playback controls">
          <button class="floor-control floor-control-prev" id="floorPrevButton" type="button" aria-label="Previous track" title="Previous track">
            <span class="floor-icon">⏮</span>
          </button>
          <button class="floor-control floor-control-play" id="floorPlayButton" type="button" aria-label="Play or pause" title="Play or pause">
            <span class="floor-icon" id="floorPlayIcon">▶</span>
          </button>
          <button class="floor-control floor-control-next" id="floorNextButton" type="button" aria-label="Next track" title="Next track">
            <span class="floor-icon">⏭</span>
          </button>
          <button class="floor-control floor-control-more" id="floorMoreButton" type="button" aria-label="More Spotify controls" title="More Spotify controls">
            <span class="floor-dot"></span>
            <span class="floor-dot"></span>
            <span class="floor-dot"></span>
          </button>
          <div id="floorSeekBar" class="floor-progress seek-surface" role="slider" aria-label="Track progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
            <div class="floor-progress-fill" id="floorProgressFill"></div>
          </div>
        </div>
      </section>

      <button id="panelToggle" class="panel-toggle" type="button" aria-label="Show Pocket DJ controls" title="Show controls">♪</button>

      <div class="floor-toggle-cluster" id="floorToggleCluster">
        <button id="floorControlsToggle" class="floor-controls-toggle" type="button" aria-label="Show floor playback controls" title="Show floor playback controls">Controls</button>
        <button id="floorControlsLock" class="floor-lock-toggle floor-lock-hidden" type="button" aria-label="Lock floor playback controls open" title="Lock controls open">🔒</button>
      </div>
      <pre id="animationDebugPanel" class="animation-debug-panel" hidden>frame: loading</pre>

      <aside id="controlCard" class="control-card control-card-open">
        <div class="brand-row compact-brand-row">
          <div class="mini-brand"><span>Pocket</span><span>DJ</span></div>
          <div class="brand-actions">
            <button id="lyricsToggle" class="lyrics-toggle lyrics-toggle-on lyrics-toggle-unknown" type="button" aria-pressed="true" title="Toggle ceiling lyrics">LYRICS</button>
            <div class="mode-pill" id="modePill">IDLE</div>
            <div class="connect-pill-wrap">
              <button id="connectSpotify" class="connect-pill disconnected" type="button" aria-haspopup="true" aria-expanded="false">Connect</button>
              <div id="connectDropdown" class="connect-dropdown">
                <button id="disconnectSpotify" type="button">Disconnect</button>
              </div>
            </div>
            <button id="panelLockToggle" class="panel-lock-toggle" type="button" aria-label="Lock side panel open" title="Lock side panel open">🔒</button>
          </div>
        </div>

        <div class="now-card now-card-compact">
          <div class="art" id="albumArt"><span>♪</span></div>
          <div class="track-copy">
            <div class="track-title" id="trackTitle">${state.playback.title}</div>
            <div class="track-artist" id="trackArtist">${state.playback.artist}</div>
            <div class="progress-row">
              <span id="progressNow">0:00</span>
              <div id="panelSeekBar" class="progress seek-surface" role="slider" aria-label="Track progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div id="progressFill"></div></div>
              <span id="progressEnd">0:00</span>
            </div>

            <div class="panel-playback-row" aria-label="Panel playback controls">
              <button id="panelShuffleButton" class="panel-icon-button panel-shuffle" type="button" aria-label="Shuffle" title="Shuffle off">⤨</button>
              <button id="panelPrevButton" class="panel-icon-button" type="button" aria-label="Previous or restart" title="Previous or restart">⏮</button>
              <button id="panelPlayButton" class="panel-play-button" type="button" aria-label="Play or pause" title="Play or pause"><span id="panelPlayIcon">▶</span></button>
              <button id="panelNextButton" class="panel-icon-button" type="button" aria-label="Next" title="Next">⏭</button>
              <button id="panelRepeatButton" class="panel-icon-button panel-repeat" type="button" aria-label="Repeat" title="Repeat off">↻</button>
            </div>

            <div class="panel-volume-row">
              <span>VOL</span>
              <input id="spotifyVolume" type="range" min="0" max="100" step="1" value="70" />
              <strong id="spotifyVolumeValue">70</strong>
            </div>
          </div>
        </div>

        <details class="dev-tools">
          <summary>Dev tools</summary>

          <div class="button-grid dev-button-grid">
            <button id="demoButton" class="secondary" type="button">Demo Mode</button>
            <button id="debugButton" class="secondary" type="button">Debug</button>
          </div>

          <input id="clientIdInput" type="hidden" value="${escapeHtml(state.spotifyClientId || "37da51db24384ad3a07c222f71b1525e")}" />

          <details class="room-utility-controls">
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
            <label>Left speaker X % <span id="speakerLeftXValue">36.9</span>
              <input id="speakerLeftX" type="range" min="0" max="100" step="0.1" value="36.9" />
            </label>
            <label>Right speaker X % <span id="speakerRightXValue">64.9</span>
              <input id="speakerRightX" type="range" min="0" max="100" step="0.1" value="64.9" />
            </label>
            <label>Speaker Y % <span id="speakerYValue">70.5</span>
              <input id="speakerY" type="range" min="0" max="100" step="0.1" value="70.5" />
            </label>
            <label>Speaker scale <span id="speakerScaleValue">1.47</span>
              <input id="speakerScale" type="range" min="0.25" max="1.8" step="0.01" value="1.47" />
            </label>
            <label>Speaker opacity <span id="speakerOpacityValue">1.0</span>
              <input id="speakerOpacity" type="range" min="0" max="1" step="0.01" value="1.0" />
            </label>
            <label>Speaker pulse <span id="speakerPulseValue">0.5</span>
              <input id="speakerPulse" type="range" min="0" max="1" step="0.01" value="0.5" />
            </label>
            <label>Speaker pulse X % <span id="speakerPulseXValue">50.9</span>
              <input id="speakerPulseX" type="range" min="20" max="80" step="0.1" value="50.9" />
            </label>
            <label>Speaker pulse Y % <span id="speakerPulseYValue">48.8</span>
              <input id="speakerPulseY" type="range" min="20" max="85" step="0.1" value="48.8" />
            </label>
            <label>Speaker pulse size % <span id="speakerPulseSizeValue">55.3</span>
              <input id="speakerPulseSize" type="range" min="12" max="80" step="0.1" value="55.3" />
            </label>
            <label>Driver warp opacity <span id="speakerWarpOpacityValue">1.0</span>
              <input id="speakerWarpOpacity" type="range" min="0" max="1" step="0.01" value="1.0" />
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

          <div class="lyrics-boundary-utility">
            <div class="utility-subhead">Ceiling lyric poster utility</div>
            <p class="utility-help">Poster mode shows only the active lyric as a huge transparent ceiling projection with a gray stroke. Tune the four green-dot corner points so the text fills the ceiling trapezoid without clipping.</p>

            <div class="lyric-utility-stack">
              <label>Poster X px <span id="lyricPosterXValue">882</span>
                <input id="lyricPosterX" type="range" min="0" max="1600" step="1" value="882" />
              </label>
              <label>Poster Y px <span id="lyricPosterYValue">128</span>
                <input id="lyricPosterY" type="range" min="0" max="520" step="1" value="128" />
              </label>
              <label>Poster width px <span id="lyricPosterWValue">1180</span>
                <input id="lyricPosterW" type="range" min="240" max="1600" step="1" value="1180" />
              </label>
              <label>Poster height px <span id="lyricPosterHValue">205</span>
                <input id="lyricPosterH" type="range" min="60" max="420" step="1" value="205" />
              </label>
              <label>Poster zoom <span id="lyricPosterZoomValue">1.00</span>
                <input id="lyricPosterZoom" type="range" min="0.55" max="1.8" step="0.01" value="1.00" />
              </label>
              <label>Ceiling tilt deg <span id="lyricPosterTiltValue">54.00</span>
                <input id="lyricPosterTilt" type="range" min="0" max="75" step="0.5" value="54" />
              </label>
              <label>Ceiling skew deg <span id="lyricPosterSkewValue">-4.00</span>
                <input id="lyricPosterSkew" type="range" min="-25" max="25" step="0.5" value="-4" />
              </label>
              <label>Top left X px <span id="lyricPosterTopLeftXValue">402</span>
                <input id="lyricPosterTopLeftX" type="range" min="0" max="1764" step="1" value="402" />
              </label>
              <label>Top left Y px <span id="lyricPosterTopLeftYValue">12</span>
                <input id="lyricPosterTopLeftY" type="range" min="0" max="520" step="1" value="12" />
              </label>
              <label>Top right X px <span id="lyricPosterTopRightXValue">1400</span>
                <input id="lyricPosterTopRightX" type="range" min="0" max="1764" step="1" value="1400" />
              </label>
              <label>Top right Y px <span id="lyricPosterTopRightYValue">12</span>
                <input id="lyricPosterTopRightY" type="range" min="0" max="520" step="1" value="12" />
              </label>
              <label>Bottom left X px <span id="lyricPosterBottomLeftXValue">582</span>
                <input id="lyricPosterBottomLeftX" type="range" min="0" max="1764" step="1" value="582" />
              </label>
              <label>Bottom left Y px <span id="lyricPosterBottomLeftYValue">178</span>
                <input id="lyricPosterBottomLeftY" type="range" min="0" max="520" step="1" value="178" />
              </label>
              <label>Bottom right X px <span id="lyricPosterBottomRightXValue">1228</span>
                <input id="lyricPosterBottomRightX" type="range" min="0" max="1764" step="1" value="1228" />
              </label>
              <label>Bottom right Y px <span id="lyricPosterBottomRightYValue">178</span>
                <input id="lyricPosterBottomRightY" type="range" min="0" max="520" step="1" value="178" />
              </label>
              <label>Stroke px <span id="lyricPosterStrokeValue">2.40</span>
                <input id="lyricPosterStroke" type="range" min="0.5" max="8" step="0.1" value="2.4" />
              </label>
              <label>Stroke opacity <span id="lyricPosterStrokeOpacityValue">0.52</span>
                <input id="lyricPosterStrokeOpacity" type="range" min="0" max="1" step="0.01" value="0.52" />
              </label>
              <label>Fill opacity <span id="lyricPosterFillOpacityValue">0.02</span>
                <input id="lyricPosterFillOpacity" type="range" min="0" max="0.35" step="0.01" value="0.02" />
              </label>
              <label>Glow strength <span id="lyricPosterGlowValue">0.18</span>
                <input id="lyricPosterGlow" type="range" min="0" max="1" step="0.01" value="0.18" />
              </label>
              <label>Row spacing <span id="lyricPosterRowGapValue">0.18</span>
                <input id="lyricPosterRowGap" type="range" min="-0.15" max="0.8" step="0.01" value="0.18" />
              </label>
              <label>Base lyric font size px <span id="lyricBaseFontSizeValue">12</span>
                <input id="lyricBaseFontSize" type="range" min="8" max="32" step="1" value="12" />
              </label>
              <label>Max rows
                <select id="lyricPosterMaxRows">
                  <option value="auto" selected>Auto 1 to 3 rows</option>
                  <option value="1">Force 1 row</option>
                  <option value="2">Force 2 rows</option>
                  <option value="3">Force 3 rows</option>
                </select>
              </label>
              <label>Transition
                <select id="lyricPosterTransition">
                  <option value="push-slide" selected>Quick push slide</option>
                  <option value="fade-slide">Subtle fade slide</option>
                </select>
              </label>
            </div>
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
        </details>
      </aside>

      <button id="sidePanelTab" class="side-panel-tab" type="button" aria-label="Open Pocket DJ panel" title="Open Pocket DJ panel">
        <span class="side-panel-tab-note">♫</span>
        <span class="side-panel-tab-arrow">‹</span>
      </button>
    </main>
  `;
}

export function updatePlaybackUi(track: NormalizedTrack, debugOpen: boolean): void {
  setTextIfChanged(qs("#trackTitle"), track.title);
  setTextIfChanged(qs("#trackArtist"), track.artist);
  updateMarquee(track);
  updateConnectionBanner(track);
  updateFloorControls(track);

  qs("#progressNow").textContent = formatMs(getEstimatedProgress(track));
  qs("#progressEnd").textContent = formatMs(track.durationMs);

  const percent = track.durationMs > 0 ? Math.min(100, (getEstimatedProgress(track) / track.durationMs) * 100) : 0;
  qs<HTMLDivElement>("#progressFill").style.width = `${percent}%`;
  qs<HTMLElement>("#panelSeekBar").setAttribute("aria-valuenow", String(Math.round(percent)));

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
  const tab = qs<HTMLButtonElement>("#sidePanelTab");

  card.classList.toggle("control-card-open", open);
  card.classList.toggle("control-card-hidden", !open);
  toggle.classList.toggle("panel-toggle-visible", !open);
  tab.classList.toggle("side-panel-tab-visible", !open);
  tab.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-expanded", String(open));
}


function updateFloorControls(track: NormalizedTrack): void {
  const floor = qs<HTMLElement>("#floorPlayer");
  const toggle = qs<HTMLButtonElement>("#floorControlsToggle");
  const playButton = qs<HTMLButtonElement>("#floorPlayButton");
  const playIcon = qs<HTMLElement>("#floorPlayIcon");
  const prevButton = qs<HTMLButtonElement>("#floorPrevButton");
  const nextButton = qs<HTMLButtonElement>("#floorNextButton");
  const progressFill = qs<HTMLDivElement>("#floorProgressFill");
  const panelPlayIcon = qs<HTMLElement>("#panelPlayIcon");
  const panelPlayButton = qs<HTMLButtonElement>("#panelPlayButton");
  const panelPrevButton = qs<HTMLButtonElement>("#panelPrevButton");
  const panelNextButton = qs<HTMLButtonElement>("#panelNextButton");

  const canControl = track.source === "spotify" && track.isAuthenticated;
  floor.classList.toggle("floor-player-playing", track.isPlaying);
  toggle.classList.toggle("floor-controls-toggle-playing", track.isPlaying);
  playIcon.textContent = track.isPlaying ? "||" : "▶";
  panelPlayIcon.textContent = track.isPlaying ? "||" : "▶";
  playButton.setAttribute("aria-label", track.isPlaying ? "Pause Spotify" : "Play Spotify");
  panelPlayButton.setAttribute("aria-label", track.isPlaying ? "Pause Spotify" : "Play Spotify");

  const progressPercent = track.durationMs > 0
    ? Math.min(100, (getEstimatedProgress(track) / track.durationMs) * 100)
    : 0;
  progressFill.style.width = `${progressPercent}%`;
  qs<HTMLElement>("#floorSeekBar").setAttribute("aria-valuenow", String(Math.round(progressPercent)));

  [playButton, prevButton, nextButton, panelPlayButton, panelPrevButton, panelNextButton].forEach((button) => {
    button.disabled = !canControl;
    button.classList.toggle("floor-control-disabled", !canControl);
  });
}

function updateMarquee(track: NormalizedTrack): void {
  const marquee = qs<HTMLElement>(".marquee");
  const content = qs<HTMLElement>("#marqueeContent");
  const titleEl = qs<HTMLElement>("#marqueeTitle");
  const artistEl = qs<HTMLElement>("#marqueeArtist");
  const payload = buildMarqueePayload(track);

  marquee.classList.toggle("marquee-paused", payload.state === "paused");
  marquee.classList.toggle("marquee-empty", payload.state === "empty");
  marquee.classList.toggle("marquee-playing", payload.state === "playing");
  // Title/artist long-vs-short classes are set from actual rendered width in
  // prepareMarqueeRowsForEntry/updateMarqueeRowPan. Do not use character-count
  // guesses here, or short titles can stay left-anchored after a long scrolling title.
  if (payload.key === lastMarqueeKey) return;
  lastMarqueeKey = payload.key;

  if (marqueeSwapTimer) window.clearTimeout(marqueeSwapTimer);

  // Always transition song changes using the single clean title, not the duplicated scroll train.
  clearTitleScrollLoop();
  titleEl.style.transition = "none";
  titleEl.style.transform = "translateX(0)";
  titleEl.textContent = titleEl.dataset.marqueeOriginal || titleEl.textContent || "";
  artistEl.textContent = artistEl.dataset.marqueeOriginal || artistEl.textContent || "";

  // Always transition old text out to the left first.
  content.classList.remove("marquee-entering");
  content.classList.add("marquee-exiting");
  marquee.classList.add("marquee-swap");

  marqueeSwapTimer = window.setTimeout(() => {
    titleEl.dataset.marqueeOriginal = payload.title;
    artistEl.dataset.marqueeOriginal = payload.artist;
    titleEl.textContent = payload.title;
    artistEl.textContent = payload.artist;
    prepareMarqueeRowsForEntry(marquee, titleEl, artistEl);

    content.style.animation = "none";
    titleEl.style.animation = "none";
    artistEl.style.animation = "none";
    void content.offsetWidth;
    content.style.animation = "";
    titleEl.style.animation = "";
    artistEl.style.animation = "";

    // Then bring the new song in from the right. Artist follows after title via CSS delay.
    content.classList.remove("marquee-exiting");
    content.classList.add("marquee-entering");

    marqueeSwapTimer = window.setTimeout(() => {
      content.classList.remove("marquee-entering");
      marquee.classList.remove("marquee-swap");
      updateMarqueeRowPan(marquee, titleEl, artistEl);
    }, 5200);
  }, 2300);
}

function prepareMarqueeRowsForEntry(marquee: HTMLElement, titleEl: HTMLElement, artistEl: HTMLElement): void {
  clearTitleScrollLoop();

  const viewport = marquee.querySelector<HTMLElement>(".marquee-viewport");
  const availableWidth = Math.max(0, (viewport?.clientWidth || marquee.clientWidth) - 10);

  const titleText = titleEl.dataset.marqueeOriginal || titleEl.textContent || "";
  const artistText = artistEl.dataset.marqueeOriginal || artistEl.textContent || "";

  titleEl.textContent = titleText;
  titleEl.style.transition = "none";
  titleEl.style.transform = "translateX(0)";
  titleEl.style.marginLeft = "0";

  const titleIsLong = titleEl.scrollWidth > availableWidth + 6;
  marquee.classList.toggle("marquee-title-long", titleIsLong);
  marquee.classList.toggle("marquee-title-short", !titleIsLong);

  artistEl.textContent = artistText;
  artistEl.style.transition = "none";
  artistEl.style.transform = "translateX(0)";

  const artistIsLong = artistEl.scrollWidth > availableWidth + 6;
  marquee.classList.toggle("marquee-artist-long", artistIsLong);
  marquee.classList.toggle("marquee-artist-short", !artistIsLong);
}

function updateMarqueeRowPan(marquee: HTMLElement, titleEl: HTMLElement, artistEl: HTMLElement): void {
  const viewport = marquee.querySelector<HTMLElement>(".marquee-viewport");
  const availableWidth = Math.max(0, (viewport?.clientWidth || marquee.clientWidth) - 10);

  configureTitleMarqueeRow({
    marquee,
    element: titleEl,
    originalText: titleEl.dataset.marqueeOriginal || titleEl.textContent || "",
    availableWidth
  });

  configureStaticArtistRow({
    marquee,
    element: artistEl,
    originalText: artistEl.dataset.marqueeOriginal || artistEl.textContent || "",
    availableWidth
  });
}

function configureTitleMarqueeRow(options: {
  marquee: HTMLElement;
  element: HTMLElement;
  originalText: string;
  availableWidth: number;
}): void {
  const separator = "     ✦     ";
  const { marquee, element, originalText, availableWidth } = options;

  clearTitleScrollLoop();

  element.textContent = originalText;
  element.dataset.marqueeOriginal = originalText;
  element.style.transition = "none";
  element.style.transform = "translateX(0)";

  const originalWidth = element.scrollWidth;
  const isLong = originalWidth > availableWidth + 6;

  marquee.classList.toggle("marquee-title-long", isLong);
  marquee.classList.toggle("marquee-title-short", !isLong);

  if (!isLong) {
    element.textContent = originalText;
    return;
  }

  element.textContent = `${originalText}${separator}${originalText}`;
  const fullLoopWidth = element.scrollWidth;
  const loopDistance = Math.max(1, fullLoopWidth - originalWidth);

  // Constant visual speed. The title always pauses for 10 seconds when the T in TITLE is at the left edge.
  const pxPerSecond = 34;
  const scrollSeconds = Math.max(10, Math.min(44, loopDistance / pxPerSecond));

  startTitleScrollLoop(element, loopDistance, scrollSeconds);
}

function startTitleScrollLoop(element: HTMLElement, loopDistance: number, scrollSeconds: number): void {
  clearTitleScrollLoop();

  const holdMs = 10_000;
  const scrollMs = Math.round(scrollSeconds * 1000);

  element.style.transition = "none";
  element.style.transform = "translateX(0)";
  void element.offsetWidth;

  marqueeTitleScrollTimer = window.setTimeout(() => {
    element.style.transition = `transform ${scrollSeconds.toFixed(2)}s linear`;
    element.style.transform = `translateX(${-loopDistance}px)`;

    marqueeTitleScrollTimer = window.setTimeout(() => {
      // At -loopDistance, the repeated title copy is visually at the start. Reset invisibly and hold again.
      element.style.transition = "none";
      element.style.transform = "translateX(0)";
      void element.offsetWidth;
      startTitleScrollLoop(element, loopDistance, scrollSeconds);
    }, scrollMs);
  }, holdMs);
}

function clearTitleScrollLoop(): void {
  if (marqueeTitleScrollTimer) {
    window.clearTimeout(marqueeTitleScrollTimer);
    marqueeTitleScrollTimer = null;
  }
}

function configureStaticArtistRow(options: {
  marquee: HTMLElement;
  element: HTMLElement;
  originalText: string;
  availableWidth: number;
}): void {
  const { marquee, element, originalText, availableWidth } = options;

  element.textContent = originalText;
  element.dataset.marqueeOriginal = originalText;
  element.dataset.marqueeStaticArtist = "true";
  element.style.transition = "none";
  element.style.transform = "translateX(0)";

  const originalWidth = element.scrollWidth;
  const isLong = originalWidth > availableWidth + 6;

  marquee.classList.toggle("marquee-artist-long", isLong);
  marquee.classList.toggle("marquee-artist-short", !isLong);

  // Artist row is fully decoupled from title scrolling. It remains centered and static.
  element.textContent = originalText;
}

function buildMarqueePayload(track: NormalizedTrack): MarqueePayload {
  let title: string;
  let artist: string;
  let state: MarqueeState;

  const artistRaw = cleanMarqueeText(track.artist || "Spotify");
  const hasMultipleArtists =
    artistRaw.includes(",") ||
    artistRaw.includes("&") ||
    artistRaw.includes(" feat.") ||
    artistRaw.includes(" ft.") ||
    artistRaw.includes(" x ");

  const artistPrefix = hasMultipleArtists
    ? "ARTISTS: "
    : "ARTIST: ";

  if (track.source === "demo") {
    state = track.isPlaying ? "playing" : "paused";
    title = track.isPlaying ? `TITLE: ${cleanMarqueeText(track.title)}` : `PAUSED: ${cleanMarqueeText(track.title)}`;
    artist = `${artistPrefix}${artistRaw || "Demo mode"}`;
  } else if (!track.isAuthenticated || !track.trackId) {
    state = "empty";
    title = "POCKET DJ";
    artist = idleMarqueePhrase();
  } else if (!track.isPlaying) {
    state = "paused";
    title = `PAUSED: ${cleanMarqueeText(track.title)}`;
    artist = `${artistPrefix}${artistRaw}`;
  } else {
    state = "playing";
    title = `TITLE: ${cleanMarqueeText(track.title)}`;
    artist = `${artistPrefix}${artistRaw}`;
  }

  return {
    title,
    artist,
    state,
    titleLong: title.length > 24,
    artistLong: artist.length > 34,
    key: `${state}::${title.toUpperCase()}::${artist.toUpperCase()}`
  };
}

function cleanMarqueeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function idleMarqueePhrase(): string {
  const phrases = [
    "Listening lounge ready",
    "Start Spotify and Pocket DJ will wake up",
    "Late night session standby",
    "Vinyl dreams loading",
    "Connect Spotify to begin"
  ];

  const index = Math.floor(Date.now() / 12_000) % phrases.length;
  return phrases[index];
}

function updateConnectionBanner(track: NormalizedTrack): void {
  const pill = qs<HTMLButtonElement>("#connectSpotify");
  const dropdown = qs<HTMLElement>("#connectDropdown");

  if (track.source === "demo") {
    pill.className = "connect-pill demo";
    pill.textContent = "Demo";
    dropdown.classList.remove("connect-dropdown-open");
    return;
  }

  if (track.isAuthenticated) {
    pill.className = "connect-pill connected";
    pill.textContent = "Connected";
    return;
  }

  pill.className = "connect-pill disconnected";
  pill.textContent = "Connect";
  dropdown.classList.remove("connect-dropdown-open");
}

function setTextIfChanged(element: Element, value: string): void {
  if (element.textContent !== value) element.textContent = value;
}

function getEstimatedProgress(track: NormalizedTrack): number {
  if (!track.isPlaying) return track.progressMs;
  return Math.min(track.durationMs, track.progressMs + (Date.now() - track.updatedAt));
}

export function updateLyricsCeiling(
  lyrics: LyricsPayload,
  playbackMs: number,
  activeIndex: number,
  enabled = true,
): void {
  const ceiling = qs<HTMLElement>("#lyricsCeiling");
  const activeBlock = qs<HTMLElement>("#activeLyricsBlock");

  updateLyricsToggleUi(lyrics.status, enabled);

  ceiling.classList.toggle("lyrics-ceiling-hidden", !enabled);
  ceiling.classList.toggle("lyrics-ceiling-visible", enabled && lyrics.status === "found");

  const clearLyrics = () => {
    lastLyricsRenderSignature = "";
    activeBlock.innerHTML = "";
    activeBlock.style.setProperty("--lyric-line-visibility", "0");
  };

  if (!enabled) {
    clearLyrics();
    return;
  }

  if (lyrics.status === "loading" || lyrics.status === "idle") {
    clearLyrics();
    return;
  }

  if (lyrics.status === "instrumental" || lyrics.status === "not-found" || lyrics.status === "error") {
    clearLyrics();
    return;
  }

  const sourceLines =
    lyrics.syncedLyrics.length > 0
      ? lyrics.syncedLyrics
      : lyrics.plainLyrics.split(/\r?\n/).map((text) => ({ timeMs: null, text }));

  const cleanLines = sourceLines.filter((line) => line.text.trim());
  if (cleanLines.length === 0) {
    clearLyrics();
    return;
  }

  const centerIndex = Math.max(0, Math.min(cleanLines.length - 1, activeIndex >= 0 ? activeIndex : 0));
  const activeLine = cleanLines[centerIndex];
  const rootStyles = getComputedStyle(document.documentElement);

  const baseFontSize = Number.parseFloat(rootStyles.getPropertyValue("--lyrics-base-font-size")) || 12;
  const maxRowsValue = (qs<HTMLSelectElement>("#lyricPosterMaxRows")?.value || "auto") as "auto" | "1" | "2" | "3";
  const animationRevision = rootStyles.getPropertyValue("--lyrics-animation-revision").trim();
  const rootClassSignature = document.documentElement.className;

  const trapezoid = readLyricPosterTrapezoid(rootStyles);
  const renderSignature = `${lyrics.trackKey}|${centerIndex}|${activeLine.text}|${JSON.stringify(trapezoid)}|${baseFontSize}|${maxRowsValue}|${animationRevision}|${rootClassSignature}`;

  if (renderSignature === lastLyricsRenderSignature) {
    activeBlock.style.setProperty("--lyric-line-visibility", "1");
    return;
  }

  lastLyricsRenderSignature = renderSignature;
  activeBlock.style.setProperty("--lyric-line-visibility", "1");

  const layout = buildPosterLyricLayout(activeLine.text, trapezoid, baseFontSize, maxRowsValue);

  activeBlock.innerHTML = `
    <div class="lyric-poster-text" data-time="${activeLine.timeMs ?? ""}">
      ${layout.rows
        .map(
          (row) => `
            <div
              class="lyric-poster-row"
              style="
                left: ${row.left}px;
                top: ${row.top}px;
                width: ${row.width}px;
                --poster-font-size: ${row.fontSize}px;
              "
            >
              ${escapeHtml(row.text)}
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

type LyricPosterTrapezoid = {
  topLeftX: number;
  topLeftY: number;
  topRightX: number;
  topRightY: number;
  bottomLeftX: number;
  bottomLeftY: number;
  bottomRightX: number;
  bottomRightY: number;
};

type LyricPosterRowLayout = {
  text: string;
  left: number;
  top: number;
  width: number;
  fontSize: number;
};

function readLyricPosterTrapezoid(rootStyles: CSSStyleDeclaration): LyricPosterTrapezoid {
  return {
    topLeftX: Number.parseFloat(rootStyles.getPropertyValue("--lyric-poster-top-left-x")) || 402,
    topLeftY: Number.parseFloat(rootStyles.getPropertyValue("--lyric-poster-top-left-y")) || 12,
    topRightX: Number.parseFloat(rootStyles.getPropertyValue("--lyric-poster-top-right-x")) || 1400,
    topRightY: Number.parseFloat(rootStyles.getPropertyValue("--lyric-poster-top-right-y")) || 12,
    bottomLeftX: Number.parseFloat(rootStyles.getPropertyValue("--lyric-poster-bottom-left-x")) || 582,
    bottomLeftY: Number.parseFloat(rootStyles.getPropertyValue("--lyric-poster-bottom-left-y")) || 178,
    bottomRightX: Number.parseFloat(rootStyles.getPropertyValue("--lyric-poster-bottom-right-x")) || 1228,
    bottomRightY: Number.parseFloat(rootStyles.getPropertyValue("--lyric-poster-bottom-right-y")) || 178,
  };
}

function buildPosterLyricLayout(
  text: string,
  trapezoid: LyricPosterTrapezoid,
  baseFontSize: number,
  maxRowsValue: "auto" | "1" | "2" | "3",
): { rows: LyricPosterRowLayout[] } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { rows: [] };

  const forcedRows = maxRowsValue === "auto" ? 0 : Number(maxRowsValue);
  const candidateRowCounts =
    forcedRows > 0
      ? [forcedRows]
      : words.length <= 3
        ? [1, 2]
        : words.length <= 7
          ? [1, 2, 3]
          : [2, 3];

  let best: { rows: LyricPosterRowLayout[]; score: number } = { rows: [], score: -Infinity };

  for (const rowCount of candidateRowCounts) {
    const rows = balanceWordsIntoRows(words, Math.max(1, Math.min(rowCount, words.length)));
    const rowLayouts = layoutRowsInsideTrapezoid(rows, trapezoid, baseFontSize);
    const avgFill = rowLayouts.reduce((sum, row) => {
      const estimate = weightedPosterLength(row.text) * row.fontSize * 0.64;
      return sum + Math.min(1, estimate / Math.max(1, row.width));
    }, 0) / Math.max(1, rowLayouts.length);
    const minFont = Math.min(...rowLayouts.map((row) => row.fontSize));
    const score = minFont * 0.75 + avgFill * 120 - Math.abs(rowLayouts.length - rows.length) * 80 - rowLayouts.length * 4;

    if (score > best.score) best = { rows: rowLayouts, score };
  }

  return { rows: best.rows };
}

function layoutRowsInsideTrapezoid(
  rows: string[],
  trapezoid: LyricPosterTrapezoid,
  baseFontSize: number,
): LyricPosterRowLayout[] {
  const topY = (trapezoid.topLeftY + trapezoid.topRightY) / 2;
  const bottomY = (trapezoid.bottomLeftY + trapezoid.bottomRightY) / 2;
  const height = Math.max(20, bottomY - topY);
  const n = rows.length;
  const verticalPad = Math.max(4, height * 0.08);
  const rowGapRatio = 0.16;

  const candidateYs = rows.map((_, index) => {
    const t = n === 1 ? 0.50 : index / (n - 1);
    return topY + verticalPad + t * Math.max(1, height - verticalPad * 2);
  });

  const maxByHeight = height / Math.max(1, n + Math.max(0, n - 1) * rowGapRatio);
  const safeRows = rows.map((row, index) => {
    const y = candidateYs[index];
    const bounds = trapezoidHorizontalBoundsAtY(trapezoid, y);
    const safeLeft = bounds.left + Math.max(6, bounds.width * 0.035);
    const safeWidth = Math.max(20, bounds.width - Math.max(12, bounds.width * 0.07));
    const textWeight = Math.max(1, weightedPosterLength(row));
    const maxByWidth = safeWidth / (textWeight * 0.64);
    const fontSize = Math.max(baseFontSize * 1.35, Math.min(maxByWidth, maxByHeight * 0.98));

    return {
      text: row,
      left: safeLeft,
      top: y,
      width: safeWidth,
      fontSize,
    };
  });

  return safeRows;
}

function trapezoidHorizontalBoundsAtY(trapezoid: LyricPosterTrapezoid, y: number): { left: number; right: number; width: number } {
  const leftDenominator = trapezoid.bottomLeftY - trapezoid.topLeftY;
  const rightDenominator = trapezoid.bottomRightY - trapezoid.topRightY;
  const leftT = leftDenominator === 0 ? 0 : (y - trapezoid.topLeftY) / leftDenominator;
  const rightT = rightDenominator === 0 ? 0 : (y - trapezoid.topRightY) / rightDenominator;

  const left = lerp(trapezoid.topLeftX, trapezoid.bottomLeftX, Math.max(0, Math.min(1, leftT)));
  const right = lerp(trapezoid.topRightX, trapezoid.bottomRightX, Math.max(0, Math.min(1, rightT)));
  return { left, right, width: Math.max(1, right - left) };
}


function getLyricLineScale(textLength: number, isActive: boolean): number {
  const activeAllowance = isActive ? 44 : 34;
  const softLimit = isActive ? 62 : 46;

  if (textLength <= activeAllowance) return 1;
  if (textLength <= softLimit) return isActive ? 0.88 : 0.84;
  if (textLength <= 78) return isActive ? 0.76 : 0.72;
  return isActive ? 0.66 : 0.62;
}

export function updateLyricsToggleUi(status: LyricsPayload["status"], enabled: boolean): void {
  const toggle = qs<HTMLButtonElement>("#lyricsToggle");

  toggle.classList.toggle("lyrics-toggle-on", enabled);
  toggle.classList.toggle("lyrics-toggle-off", !enabled);
  toggle.classList.toggle("lyrics-toggle-found", enabled && status === "found");
  toggle.classList.toggle("lyrics-toggle-missing", enabled && (status === "not-found" || status === "instrumental" || status === "error"));
  toggle.classList.toggle("lyrics-toggle-searching", enabled && status === "loading");
  toggle.classList.toggle("lyrics-toggle-unknown", enabled && (status === "idle" || status === "loading"));

  toggle.setAttribute("aria-pressed", String(enabled));
  toggle.setAttribute("title", enabled ? "Hide ceiling lyrics" : "Show ceiling lyrics");
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
