import type { LyricsPayload } from "./lyrics/lyricsClient";
import type { AppState, NormalizedTrack } from "./state/types";
import { formatMs, qs } from "./utils/dom";


let lastLyricsRenderSignature = "";
let previousLyricPosterText = "";
let lyricPosterTransitionFlip = false;
let lyricClearFadeTimer: number | null = null;

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
        <div class="room-base-layer" aria-hidden="false">
        <div id="sessionAlbumFrameOverlay" class="session-album-frame-overlay" aria-hidden="true"></div>
        <canvas id="sessionAlbumWarpCanvas" class="session-album-warp-canvas" width="1764" height="992" aria-hidden="true"></canvas>
        <svg id="sessionAlbumGuideOverlay" class="session-album-guide-overlay" viewBox="0 0 1764 992" preserveAspectRatio="none" aria-hidden="true"></svg>
        <div id="stringLightOverlay" class="string-light-overlay" aria-hidden="true"></div>
        <div id="ambientMusicGlow" class="ambient-music-glow" aria-hidden="true"></div>

        <div id="lyricsCeiling" class="lyrics-ceiling lyric-poster-ceiling" aria-live="polite">
          <div class="lyrics-boundary-guides" aria-hidden="true">
            <div class="lyrics-boundary-guide lyrics-boundary-guide-video"></div>
          </div>
          <div id="activeLyricsBlock" class="active-lyrics-block lyric-poster-line" aria-hidden="true"></div>
        </div>
        <svg id="tallLyricGuideOverlay" class="tall-lyric-guide-overlay" viewBox="0 0 1764 529" preserveAspectRatio="none" aria-hidden="true"></svg>

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
          <div id="songChangeAlbumLayer" class="song-change-album-layer" aria-hidden="true">
            <img id="songChangeAlbumCover" class="song-change-album-cover" src="" alt="" draggable="false" />
          </div>
          <img
            id="songChangeHands"
            class="song-change-hands"
            src="./assets/poses/final/a41-Hands.png"
            alt=""
            draggable="false"
            aria-hidden="true"
          />
          <div id="mixerTempoLed" class="mixer-status-led mixer-tempo-led" aria-label="Tempo source indicator" title="Tempo source: fallback" aria-hidden="true">
            <span class="mixer-status-led-glow mixer-tempo-led-glow"></span>
            <span class="mixer-status-led-core mixer-tempo-led-core"></span>
          </div>
          <div id="mixerLyricsLed" class="mixer-status-led mixer-lyrics-led" aria-label="Lyrics availability indicator" title="Lyrics: unknown" aria-hidden="true">
            <span class="mixer-status-led-glow mixer-lyrics-led-glow"></span>
            <span class="mixer-status-led-core mixer-lyrics-led-core"></span>
          </div>
        </div>

        <div class="floor-player floor-player-visible" id="floorPlayer" aria-label="Spotify floor playback controls">
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
          <button id="floorControlsLock" class="floor-controls-lock" type="button" aria-label="Lock floor controls open" aria-pressed="false" title="Lock floor controls open"></button>
        </div>
        </div>
      </section>

      <button id="panelToggle" class="panel-toggle" type="button" aria-label="Show Pocket DJ controls" title="Show controls">♪</button>

      <pre id="animationDebugPanel" class="animation-debug-panel" hidden>frame: loading</pre>

      <aside id="controlCard" class="control-card control-card-open">
        <div class="brand-row compact-brand-row">
          <div class="mini-brand pocket-title-pill">PocketDJ</div>
          <div class="brand-actions">
            <button id="lyricsToggle" class="lyrics-toggle lyrics-toggle-on lyrics-toggle-unknown" type="button" aria-pressed="true" title="Toggle ceiling lyrics">LYRICS</button>
            <div class="mode-pill mode-pill-hidden" id="modePill" aria-hidden="true">IDLE</div>
            <div class="connect-pill-wrap">
              <button id="connectSpotify" class="connect-pill disconnected" type="button" aria-haspopup="true" aria-expanded="false">Connect</button>
              <div id="connectDropdown" class="connect-dropdown">
                <button id="disconnectSpotify" type="button">Disconnect</button>
              </div>
            </div>
            <button id="aspectModeToggle" class="aspect-pill" type="button" aria-pressed="false" title="Toggle Wide / Fill scene">WIDE</button>
            <button id="compactPanelToggle" class="compact-pill" type="button" aria-pressed="false" title="Show compact panel">COMPACT</button>
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

        <div id="panelScrollBody" class="panel-scroll-body">
        <section class="spotify-browser" id="spotifyBrowserPanel" aria-label="Spotify browser">
          <details class="spotify-source-panel" id="spotifySourcePanel">
            <summary class="spotify-source-summary">
              <span>Playback Source</span>
              <button id="spotifyPlayHereButton" class="spotify-browser-action spotify-play-here-inline" type="button">Play Here</button>
            </summary>
            <div class="spotify-source-header">
              <div id="spotifyActiveDeviceLabel" class="spotify-source-active">Audio output: Spotify Connect</div>
            </div>
            <div id="spotifySourceStatus" class="spotify-browser-status spotify-source-status">Connect Spotify, then activate Pocket DJ.</div>
            <div id="spotifyDeviceList" class="spotify-device-list"></div>
          </details>

          <div class="spotify-browser-tabs" role="tablist" aria-label="Spotify browser tabs">
            <button id="spotifyTabHome" class="spotify-browser-tab spotify-browser-tab-active" type="button" data-browser-tab="home">Home</button>
            <button id="spotifyTabPlaylists" class="spotify-browser-tab" type="button" data-browser-tab="playlists">Playlists</button>
            <button id="spotifyTabVibes" class="spotify-browser-tab" type="button" data-browser-tab="vibes">Vibes</button>
            <button id="spotifyTabSearch" class="spotify-browser-tab" type="button" data-browser-tab="search">Search</button>
          </div>

          <div id="spotifyBrowserStatus" class="spotify-browser-status">Home, Playlists, Vibes, and Search are ready.</div>

          <div id="spotifyHomePane" class="spotify-browser-pane spotify-browser-pane-active">
            <div id="spotifyHomeResults" class="spotify-browser-results spotify-home-results spotify-browser-empty">Home will load suggestions after Spotify connects.</div>
          </div>

          <div id="spotifyPlaylistsPane" class="spotify-browser-pane">
            <div class="spotify-browser-toolbar">
              <input id="playlistSearchInput" class="spotify-search-input spotify-playlist-search-input" type="search" placeholder="Search Playlists" autocomplete="off" />
              <button id="playlistClearSearchButton" class="spotify-browser-action secondary" type="button">Clear</button>
              <select id="playlistSortSelect" class="spotify-search-type spotify-sort-select" aria-label="Playlist sort">
                <option value="recent" selected>Recent / Pinned</option>
                <option value="alpha">A-Z</option>
              </select>
              <button id="playlistBackButton" class="spotify-browser-action secondary" type="button">Back</button>
            </div>
            <div id="spotifyPlaylistsResults" class="spotify-browser-results spotify-browser-empty">Playlists will load automatically.</div>
          </div>

          <div id="spotifyVibesPane" class="spotify-browser-pane">
            <div id="spotifyVibesResults" class="spotify-vibes-grid"></div>
          </div>

          <div id="spotifySearchPane" class="spotify-browser-pane">
            <div class="spotify-search-row">
              <input id="spotifySearchInput" class="spotify-search-input" type="search" placeholder="Search tracks, artists, playlists, or albums" autocomplete="off" />
              <select id="spotifySearchType" class="spotify-search-type" aria-label="Search type">
                <option value="all">All</option>
                <option value="track">Tracks</option>
                <option value="artist">Artists</option>
                <option value="playlist">Playlists</option>
                <option value="album">Albums</option>
              </select>
              <button id="spotifySearchButton" class="spotify-browser-action" type="button">Search</button>
              <button id="spotifyClearSearchButton" class="spotify-browser-action secondary" type="button">Clear</button>
            </div>
            <div id="spotifySearchResults" class="spotify-browser-results spotify-browser-empty">Search results will show here.</div>
          </div>
        </section>

        <details id="devToolsPanel" class="dev-tools">
          <summary>Dev tools</summary>

          <p class="utility-help">Slim tools only. Demo, debug, clock, full wall-layout editing, and advanced lyric geometry are removed from the normal panel for smoother room performance.</p>

          <input id="clientIdInput" type="hidden" value="${escapeHtml(state.spotifyClientId || "37da51db24384ad3a07c222f71b1525e")}" />

          <details class="session-wall-albums-controls">
            <summary>Session Wall Albums</summary>
            <p class="utility-help">Runtime album-wall controls only. The 56-slot layout is locked into the app, so the heavy coordinate editor is no longer rendered during normal use.</p>
            <label class="utility-checkbox">
              <input id="sessionAlbumShowGuides" type="checkbox" />
              Show session album guides
            </label>
            <label class="utility-checkbox">
              <input id="sessionAlbumPlaceFrames" type="checkbox" checked />
              Place albums in frames
            </label>
            <label class="utility-checkbox">
              <input id="sessionAlbumWarpMode" type="checkbox" checked />
              Warp albums to frame corners
            </label>
            <label class="session-album-pixel-control">Album pixel effect <span id="sessionAlbumPixelAmountValue">0.72</span>
              <input id="sessionAlbumPixelAmount" type="range" min="0" max="1" step="0.01" value="0.72" />
            </label>
            <label class="session-album-pixel-control">Album warm blend <span id="sessionAlbumWarmBlendValue">0.54</span>
              <input id="sessionAlbumWarmBlend" type="range" min="0" max="1" step="0.01" value="0.54" />
            </label>
          </details>

          <details class="string-light-utility">
            <summary>String light utility</summary>
            <p class="utility-help">Temporary bulb placement tool. Turn on edit mode, select a light, then click the room to move it. Points use the same 1764 x 992 room coordinates as the album wall.</p>
            <div class="utility-grid">
              <label class="utility-checkbox"><input id="stringLightsEnabled" type="checkbox" checked /> Enable string light glow</label>
              <label class="utility-checkbox"><input id="stringLightsEditMode" type="checkbox" /> Edit light points</label>
              <label class="utility-checkbox"><input id="stringLightsShowGuides" type="checkbox" /> Show point labels</label>
              <label>Global glow <span id="stringLightGlowValue">0.75</span>
                <input id="stringLightGlow" type="range" min="0" max="1.5" step="0.01" value="0.75" />
              </label>
              <label>Global pulse <span id="stringLightPulseValue">0.22</span>
                <input id="stringLightPulse" type="range" min="0" max="1" step="0.01" value="0.22" />
              </label>
              <label>Global flicker <span id="stringLightFlickerValue">0.18</span>
                <input id="stringLightFlicker" type="range" min="0" max="1" step="0.01" value="0.18" />
              </label>
            </div>
            <div class="button-grid utility-buttons">
              <button id="stringLightAdd" class="secondary" type="button">Add Light Point</button>
              <button id="stringLightPrev" class="secondary" type="button">Previous</button>
              <button id="stringLightNext" class="secondary" type="button">Next</button>
              <button id="stringLightDelete" class="secondary" type="button">Delete Selected</button>
              <button id="stringLightReset" class="secondary" type="button">Reset Defaults</button>
              <button id="stringLightCopyJson" class="secondary" type="button">Copy Light JSON</button>
            </div>
            <div class="utility-readout">Selected light: <span id="stringLightSelectedLabel">none</span></div>
            <div class="utility-grid">
              <label>Light X px <span id="stringLightXValue">0</span>
                <input id="stringLightX" type="range" min="0" max="1764" step="1" value="0" />
              </label>
              <label>Light Y px <span id="stringLightYValue">0</span>
                <input id="stringLightY" type="range" min="0" max="992" step="1" value="0" />
              </label>
              <label>Light size px <span id="stringLightSizeValue">14</span>
                <input id="stringLightSize" type="range" min="4" max="42" step="1" value="14" />
              </label>
              <label>Light intensity <span id="stringLightIntensityValue">1.00</span>
                <input id="stringLightIntensity" type="range" min="0" max="2" step="0.01" value="1" />
              </label>
              <label>Light warmth <span id="stringLightWarmthValue">0.70</span>
                <input id="stringLightWarmth" type="range" min="0" max="1" step="0.01" value="0.70" />
              </label>
              <label>Light flicker <span id="stringLightPointFlickerValue">0.22</span>
                <input id="stringLightPointFlicker" type="range" min="0" max="1" step="0.01" value="0.22" />
              </label>
            </div>
            <textarea id="stringLightJson" class="session-album-export-text string-light-json" readonly spellcheck="false"></textarea>
          </details>

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
            <label>Left speaker X % <span id="speakerLeftXValue">33</span>
              <input id="speakerLeftX" type="range" min="0" max="100" step="0.1" value="33" />
            </label>
            <label>Right speaker X % <span id="speakerRightXValue">68</span>
              <input id="speakerRightX" type="range" min="0" max="100" step="0.1" value="68" />
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
            <label>Speaker pulse amount <span id="speakerPulseValue">0.5</span>
              <input id="speakerPulse" type="range" min="0" max="1" step="0.01" value="0.5" />
            </label>
            <label class="utility-checkbox">
              <input id="speakerPulseUseTempo" type="checkbox" />
              Pulse speakers to song BPM
            </label>
            <label class="utility-checkbox">
              <input id="speakerPulseUseExternalTempo" type="checkbox" />
              Use GetSongBPM tempo lookup
            </label>
            <div class="utility-readout">Current pulse BPM: <span id="speakerPulseBpmValue">--</span></div>
            <div class="utility-readout tempo-credit">
              Tempo lookup by <a href="https://getsongbpm.com/" target="_blank" rel="noreferrer">GetSongBPM</a>
            </div>
            <label>Tempo LED X % <span id="mixerTempoLedXValue">45</span>
              <input id="mixerTempoLedX" type="range" min="30" max="70" step="0.1" value="45" />
            </label>
            <label>Tempo LED Y % <span id="mixerTempoLedYValue">63</span>
              <input id="mixerTempoLedY" type="range" min="45" max="78" step="0.1" value="63" />
            </label>
            <label>Tempo LED size % <span id="mixerTempoLedSizeValue">2</span>
              <input id="mixerTempoLedSize" type="range" min="0.5" max="4" step="0.05" value="2" />
            </label>
            <label>Lyrics LED X % <span id="mixerLyricsLedXValue">55</span>
              <input id="mixerLyricsLedX" type="range" min="30" max="70" step="0.1" value="55" />
            </label>
            <label>Lyrics LED Y % <span id="mixerLyricsLedYValue">63</span>
              <input id="mixerLyricsLedY" type="range" min="45" max="78" step="0.1" value="63" />
            </label>
            <label>Lyrics LED size % <span id="mixerLyricsLedSizeValue">1.6</span>
              <input id="mixerLyricsLedSize" type="range" min="0.5" max="4" step="0.05" value="1.6" />
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
            <label>Floor controls idle opacity <span id="floorControlsIdleOpacityValue">0.15</span>
              <input id="floorControlsIdleOpacity" type="range" min="0" max="1" step="0.01" value="0.15" />
            </label>

            <label class="utility-checkbox">
              <input id="songChangeMode" type="checkbox" />
              Song Change Mode
            </label>
            <label>Album X % <span id="songChangeAlbumXValue">49</span>
              <input id="songChangeAlbumX" type="range" min="0" max="100" step="0.1" value="49" />
            </label>
            <label>Album Y % <span id="songChangeAlbumYValue">45</span>
              <input id="songChangeAlbumY" type="range" min="0" max="100" step="0.1" value="45" />
            </label>
            <label>Album size % <span id="songChangeAlbumSizeValue">12</span>
              <input id="songChangeAlbumSize" type="range" min="5" max="55" step="0.1" value="12" />
            </label>
            <label>Panel starting Y % <span id="panelStartYValue">39</span>
              <input id="panelStartY" type="range" min="4" max="86" step="0.1" value="39" />
            </label>

          <label class="utility-checkbox">
            <input id="panelHeightAdjustEnabled" type="checkbox" />
            Adjust panel height by dragging side tab
          </label>
          <label class="utility-checkbox">
            <input id="roomFillStretchMode" type="checkbox" />
            Fill/stretch scene to browser
          </label>
          <label class="utility-checkbox">
            <input id="utilityPanelLeftSide" type="checkbox" />
            Utility menu on left side
          </label>
          </div>

          <div class="lyrics-boundary-utility lyrics-boundary-utility-slim">
            <div class="utility-subhead">Ceiling lyric style</div>
            <p class="utility-help">High-level lyric controls only. Advanced projection geometry remains locked to the saved defaults for performance.</p>
            <div class="lyric-utility-stack">
              <div class="utility-minihead">Poster style</div>
              <label>Stroke px <span id="lyricPosterStrokeValue">8</span>
                <input id="lyricPosterStroke" type="range" min="0" max="20" step="0.1" value="8" />
              </label>
              <label>Stroke color
                <input id="lyricPosterStrokeColor" type="color" value="#000000" />
              </label>
              <label>Fill color
                <input id="lyricPosterFillColor" type="color" value="#000000" />
              </label>
              <label>Stroke opacity <span id="lyricPosterStrokeOpacityValue">0.30</span>
                <input id="lyricPosterStrokeOpacity" type="range" min="0" max="1" step="0.01" value="0.30" />
              </label>
              <label>Fill opacity <span id="lyricPosterFillOpacityValue">0.70</span>
                <input id="lyricPosterFillOpacity" type="range" min="0" max="1" step="0.01" value="0.70" />
              </label>
              <label>Glow strength <span id="lyricPosterGlowValue">0.00</span>
                <input id="lyricPosterGlow" type="range" min="0" max="1" step="0.01" value="0.00" />
              </label>

              <div class="utility-minihead">Ceiling lyric effects</div>
              <label class="utility-checkbox"><input id="lyricPosterEffectDropShadow" type="checkbox" checked /> Drop shadow</label>
              <label class="utility-checkbox"><input id="lyricPosterEffectEmboss" type="checkbox" /> Emboss</label>
              <label class="utility-checkbox"><input id="lyricPosterEffectInsetEmboss" type="checkbox" /> Inset emboss</label>
              <label class="utility-checkbox"><input id="lyricPosterEffectBevel" type="checkbox" /> Bevel</label>
              <label class="utility-checkbox"><input id="lyricPosterEffectSoftBlur" type="checkbox" /> Soft blur</label>

              <div class="utility-minihead">Mode</div>
              <label>Rows
                <select id="lyricPosterMaxRows">
                  <option value="auto" selected>Auto</option>
                  <option value="1">Force 1 row</option>
                  <option value="2">Force 2 rows</option>
                </select>
              </label>
              <label>1-to-2 row breakpoint chars <span id="lyricPosterRowBreakpointValue">28</span>
                <input id="lyricPosterRowBreakpoint" type="range" min="10" max="80" step="1" value="28" />
              </label>
              <label>Transition
                <select id="lyricPosterTransition">
                  <option value="none" selected>No transition</option>
                  <option value="soft-dissolve">Soft dissolve</option>
                  <option value="ghost-drift">Ghost drift</option>
                  <option value="back-push">Back ceiling push</option>
                  <option value="fade-slide">Subtle fade slide</option>
                  <option value="shadow-slide">Shadow slide</option>
                  <option value="ceiling-stamp">Ceiling stamp</option>
                  <option value="push-slide">Quick push slide</option>
                </select>
              </label>

              <details class="lyric-tall-calibration">
                <summary>Tall-window lyric calibration</summary>
                <p class="utility-help">Use this when the ceiling reveal is active. These are the full-height target coordinates. Pocket DJ interpolates between the normal 16:9 coordinates and these tall-window values based on how much extra ceiling is visible.</p>
                <label class="utility-checkbox"><input id="lyricPosterTallGuideEnabled" type="checkbox" /> Show tall-window lyric guides</label>
                <label>Tall guide opacity <span id="lyricPosterTallGuideOpacityValue">0.60</span>
                  <input id="lyricPosterTallGuideOpacity" type="range" min="0" max="1" step="0.01" value="0.60" />
                </label>
                <div class="utility-readout tall-guide-readout">
                  Tall guide status: <span id="lyricPosterTallGuideStatus">hidden</span> | Reveal ratio: <span id="lyricPosterTallGuideRevealRatio">0.00</span>
                </div>
                <details class="lyric-tall-calibration-group lyric-geometry-monitor-group" open>
                  <summary>Lyric geometry monitor</summary>
                  <p class="utility-help">Shows the active lyric type and compares the actual text projection corners against the guide corners. Deltas should be near 0 when the tall layout is behaving correctly.</p>
                  <pre id="lyricGeometryMonitor" class="lyric-geometry-monitor">No active lyric geometry yet.</pre>
                </details>
                <details class="lyric-tall-calibration-group">
                <summary>Tall ceiling top clamp</summary>
                <p class="utility-help">Absolute top limits for the dynamic tall-window lyric trapezoid. The computed top-left and top-right points will not go above these coordinates.</p>
                <div class="lyric-utility-stack lyric-tall-grid">
              <label>Clamp TL X <span id="lyricPosterTallClampTopLeftXValue">0</span>
                <input id="lyricPosterTallClampTopLeftX" type="range" min="-400" max="2200" step="1" value="0" />
              </label>
              <label>Clamp TL Y <span id="lyricPosterTallClampTopLeftYValue">0</span>
                <input id="lyricPosterTallClampTopLeftY" type="range" min="-360" max="360" step="1" value="0" />
              </label>
              <label>Clamp TR X <span id="lyricPosterTallClampTopRightXValue">0</span>
                <input id="lyricPosterTallClampTopRightX" type="range" min="-400" max="2200" step="1" value="0" />
              </label>
              <label>Clamp TR Y <span id="lyricPosterTallClampTopRightYValue">0</span>
                <input id="lyricPosterTallClampTopRightY" type="range" min="-360" max="360" step="1" value="0" />
              </label>
                </div>
              </details>
                              <details class="lyric-tall-calibration-group">
                <summary>Main ceiling boundary target</summary>
                <div class="lyric-utility-stack lyric-tall-grid">
              <label>Main TL X <span id="lyricPosterTallTopLeftXValue">0</span>
                <input id="lyricPosterTallTopLeftX" type="range" min="-400" max="2200" step="1" value="0" />
              </label>
              <label>Main TL Y <span id="lyricPosterTallTopLeftYValue">0</span>
                <input id="lyricPosterTallTopLeftY" type="range" min="-360" max="360" step="1" value="0" />
              </label>
              <label>Main TR X <span id="lyricPosterTallTopRightXValue">0</span>
                <input id="lyricPosterTallTopRightX" type="range" min="-400" max="2200" step="1" value="0" />
              </label>
              <label>Main TR Y <span id="lyricPosterTallTopRightYValue">0</span>
                <input id="lyricPosterTallTopRightY" type="range" min="-360" max="360" step="1" value="0" />
              </label>
              <label>Main BL X <span id="lyricPosterTallBottomLeftXValue">0</span>
                <input id="lyricPosterTallBottomLeftX" type="range" min="-400" max="2200" step="1" value="0" />
              </label>
              <label>Main BL Y <span id="lyricPosterTallBottomLeftYValue">0</span>
                <input id="lyricPosterTallBottomLeftY" type="range" min="-360" max="360" step="1" value="0" />
              </label>
              <label>Main BR X <span id="lyricPosterTallBottomRightXValue">0</span>
                <input id="lyricPosterTallBottomRightX" type="range" min="-400" max="2200" step="1" value="0" />
              </label>
              <label>Main BR Y <span id="lyricPosterTallBottomRightYValue">0</span>
                <input id="lyricPosterTallBottomRightY" type="range" min="-360" max="360" step="1" value="0" />
              </label>
                </div>
              </details>
                              <details class="lyric-tall-calibration-group">
                <summary>Short lyric profile target</summary>
                <div class="lyric-utility-stack lyric-tall-grid">
              <label>Short TL X <span id="lyricPosterTallShortTopLeftXValue">0</span>
                <input id="lyricPosterTallShortTopLeftX" type="range" min="-400" max="2200" step="1" value="0" />
              </label>
              <label>Short TL Y <span id="lyricPosterTallShortTopLeftYValue">0</span>
                <input id="lyricPosterTallShortTopLeftY" type="range" min="-360" max="360" step="1" value="0" />
              </label>
              <label>Short TR X <span id="lyricPosterTallShortTopRightXValue">0</span>
                <input id="lyricPosterTallShortTopRightX" type="range" min="-400" max="2200" step="1" value="0" />
              </label>
              <label>Short TR Y <span id="lyricPosterTallShortTopRightYValue">0</span>
                <input id="lyricPosterTallShortTopRightY" type="range" min="-360" max="360" step="1" value="0" />
              </label>
              <label>Short BL X <span id="lyricPosterTallShortBottomLeftXValue">0</span>
                <input id="lyricPosterTallShortBottomLeftX" type="range" min="-400" max="2200" step="1" value="0" />
              </label>
              <label>Short BL Y <span id="lyricPosterTallShortBottomLeftYValue">0</span>
                <input id="lyricPosterTallShortBottomLeftY" type="range" min="-360" max="360" step="1" value="0" />
              </label>
              <label>Short BR X <span id="lyricPosterTallShortBottomRightXValue">0</span>
                <input id="lyricPosterTallShortBottomRightX" type="range" min="-400" max="2200" step="1" value="0" />
              </label>
              <label>Short BR Y <span id="lyricPosterTallShortBottomRightYValue">0</span>
                <input id="lyricPosterTallShortBottomRightY" type="range" min="-360" max="360" step="1" value="0" />
              </label>
                </div>
              </details>
                              <details class="lyric-tall-calibration-group">
                <summary>1-row projection target offsets</summary>
                <div class="lyric-utility-stack lyric-tall-grid">
              <label>1-row TL X offset <span id="lyricPosterTallOneRowTextTopLeftXValue">0</span>
                <input id="lyricPosterTallOneRowTextTopLeftX" type="range" min="-400" max="2200" step="1" value="0" />
              </label>
              <label>1-row TL Y offset <span id="lyricPosterTallOneRowTextTopLeftYValue">0</span>
                <input id="lyricPosterTallOneRowTextTopLeftY" type="range" min="-320" max="320" step="1" value="0" />
              </label>
              <label>1-row TR X offset <span id="lyricPosterTallOneRowTextTopRightXValue">0</span>
                <input id="lyricPosterTallOneRowTextTopRightX" type="range" min="-400" max="2200" step="1" value="0" />
              </label>
              <label>1-row TR Y offset <span id="lyricPosterTallOneRowTextTopRightYValue">0</span>
                <input id="lyricPosterTallOneRowTextTopRightY" type="range" min="-320" max="320" step="1" value="0" />
              </label>
              <label>1-row BL X offset <span id="lyricPosterTallOneRowTextBottomLeftXValue">0</span>
                <input id="lyricPosterTallOneRowTextBottomLeftX" type="range" min="-400" max="2200" step="1" value="0" />
              </label>
              <label>1-row BL Y offset <span id="lyricPosterTallOneRowTextBottomLeftYValue">0</span>
                <input id="lyricPosterTallOneRowTextBottomLeftY" type="range" min="-320" max="320" step="1" value="0" />
              </label>
              <label>1-row BR X offset <span id="lyricPosterTallOneRowTextBottomRightXValue">0</span>
                <input id="lyricPosterTallOneRowTextBottomRightX" type="range" min="-400" max="2200" step="1" value="0" />
              </label>
              <label>1-row BR Y offset <span id="lyricPosterTallOneRowTextBottomRightYValue">0</span>
                <input id="lyricPosterTallOneRowTextBottomRightY" type="range" min="-320" max="320" step="1" value="0" />
              </label>
                </div>
              </details>
                              <details class="lyric-tall-calibration-group">
                <summary>2-row band target Y values</summary>
                <div class="lyric-utility-stack lyric-tall-grid">
              <label>2-row top band top Y <span id="lyricPosterTallTwoRowTopBandTopYValue">0</span>
                <input id="lyricPosterTallTwoRowTopBandTopY" type="range" min="-360" max="360" step="1" value="0" />
              </label>
              <label>2-row top band bottom Y <span id="lyricPosterTallTwoRowTopBandBottomYValue">0</span>
                <input id="lyricPosterTallTwoRowTopBandBottomY" type="range" min="-360" max="360" step="1" value="0" />
              </label>
              <label>2-row bottom band top Y <span id="lyricPosterTallTwoRowBottomBandTopYValue">0</span>
                <input id="lyricPosterTallTwoRowBottomBandTopY" type="range" min="-360" max="360" step="1" value="0" />
              </label>
              <label>2-row bottom band bottom Y <span id="lyricPosterTallTwoRowBottomBandBottomYValue">0</span>
                <input id="lyricPosterTallTwoRowBottomBandBottomY" type="range" min="-360" max="360" step="1" value="0" />
              </label>
                </div>
              </details>
                              <details class="lyric-tall-calibration-group">
                <summary>2-row top projection target offsets</summary>
                <div class="lyric-utility-stack lyric-tall-grid">
              <label>2-row top TL X offset <span id="lyricPosterTallTwoRowTopTextTopLeftXValue">0</span>
                <input id="lyricPosterTallTwoRowTopTextTopLeftX" type="range" min="-400" max="2200" step="1" value="0" />
              </label>
              <label>2-row top TL Y offset <span id="lyricPosterTallTwoRowTopTextTopLeftYValue">0</span>
                <input id="lyricPosterTallTwoRowTopTextTopLeftY" type="range" min="-320" max="320" step="1" value="0" />
              </label>
              <label>2-row top TR X offset <span id="lyricPosterTallTwoRowTopTextTopRightXValue">0</span>
                <input id="lyricPosterTallTwoRowTopTextTopRightX" type="range" min="-400" max="2200" step="1" value="0" />
              </label>
              <label>2-row top TR Y offset <span id="lyricPosterTallTwoRowTopTextTopRightYValue">0</span>
                <input id="lyricPosterTallTwoRowTopTextTopRightY" type="range" min="-320" max="320" step="1" value="0" />
              </label>
              <label>2-row top BL X offset <span id="lyricPosterTallTwoRowTopTextBottomLeftXValue">0</span>
                <input id="lyricPosterTallTwoRowTopTextBottomLeftX" type="range" min="-400" max="2200" step="1" value="0" />
              </label>
              <label>2-row top BL Y offset <span id="lyricPosterTallTwoRowTopTextBottomLeftYValue">0</span>
                <input id="lyricPosterTallTwoRowTopTextBottomLeftY" type="range" min="-320" max="320" step="1" value="0" />
              </label>
              <label>2-row top BR X offset <span id="lyricPosterTallTwoRowTopTextBottomRightXValue">0</span>
                <input id="lyricPosterTallTwoRowTopTextBottomRightX" type="range" min="-400" max="2200" step="1" value="0" />
              </label>
              <label>2-row top BR Y offset <span id="lyricPosterTallTwoRowTopTextBottomRightYValue">0</span>
                <input id="lyricPosterTallTwoRowTopTextBottomRightY" type="range" min="-320" max="320" step="1" value="0" />
              </label>
                </div>
              </details>
                              <details class="lyric-tall-calibration-group">
                <summary>2-row bottom projection target offsets</summary>
                <div class="lyric-utility-stack lyric-tall-grid">
              <label>2-row bottom TL X offset <span id="lyricPosterTallTwoRowBottomTextTopLeftXValue">0</span>
                <input id="lyricPosterTallTwoRowBottomTextTopLeftX" type="range" min="-400" max="2200" step="1" value="0" />
              </label>
              <label>2-row bottom TL Y offset <span id="lyricPosterTallTwoRowBottomTextTopLeftYValue">0</span>
                <input id="lyricPosterTallTwoRowBottomTextTopLeftY" type="range" min="-320" max="320" step="1" value="0" />
              </label>
              <label>2-row bottom TR X offset <span id="lyricPosterTallTwoRowBottomTextTopRightXValue">0</span>
                <input id="lyricPosterTallTwoRowBottomTextTopRightX" type="range" min="-400" max="2200" step="1" value="0" />
              </label>
              <label>2-row bottom TR Y offset <span id="lyricPosterTallTwoRowBottomTextTopRightYValue">0</span>
                <input id="lyricPosterTallTwoRowBottomTextTopRightY" type="range" min="-320" max="320" step="1" value="0" />
              </label>
              <label>2-row bottom BL X offset <span id="lyricPosterTallTwoRowBottomTextBottomLeftXValue">0</span>
                <input id="lyricPosterTallTwoRowBottomTextBottomLeftX" type="range" min="-400" max="2200" step="1" value="0" />
              </label>
              <label>2-row bottom BL Y offset <span id="lyricPosterTallTwoRowBottomTextBottomLeftYValue">0</span>
                <input id="lyricPosterTallTwoRowBottomTextBottomLeftY" type="range" min="-320" max="320" step="1" value="0" />
              </label>
              <label>2-row bottom BR X offset <span id="lyricPosterTallTwoRowBottomTextBottomRightXValue">0</span>
                <input id="lyricPosterTallTwoRowBottomTextBottomRightX" type="range" min="-400" max="2200" step="1" value="0" />
              </label>
              <label>2-row bottom BR Y offset <span id="lyricPosterTallTwoRowBottomTextBottomRightYValue">0</span>
                <input id="lyricPosterTallTwoRowBottomTextBottomRightY" type="range" min="-320" max="320" step="1" value="0" />
              </label>
                </div>
              </details>
              </details>
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
        </div>
      </aside>

      <button id="sidePanelTab" class="side-panel-tab" type="button" aria-label="Open Pocket DJ panel" title="Open Pocket DJ panel">
        <span class="side-panel-tab-note">♫</span>
        <span class="side-panel-tab-arrow">‹</span>
      </button>
      <button id="panelAdjustDone" class="panel-adjust-done" type="button" aria-label="Done adjusting panel height" title="Done adjusting panel height">DONE</button>
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
  const playButton = qs<HTMLButtonElement>("#floorPlayButton");
  const playIcon = qs<HTMLElement>("#floorPlayIcon");
  const prevButton = qs<HTMLButtonElement>("#floorPrevButton");
  const nextButton = qs<HTMLButtonElement>("#floorNextButton");
  const progressFill = qs<HTMLDivElement>("#floorProgressFill");
  const panelPlayIcon = qs<HTMLElement>("#panelPlayIcon");
  const panelPlayButton = qs<HTMLButtonElement>("#panelPlayButton");
  const panelPrevButton = qs<HTMLButtonElement>("#panelPrevButton");
  const panelNextButton = qs<HTMLButtonElement>("#panelNextButton");
  const modePill = qs<HTMLElement>("#modePill");

  const canControl = track.source === "spotify" && track.isAuthenticated;
  const isPlaying = Boolean(track.isPlaying);
  const isPaused = canControl && !isPlaying && track.source !== "none";

  floor.classList.toggle("floor-player-playing", isPlaying);

  modePill.classList.toggle("mode-pill-playing", isPlaying);
  modePill.classList.toggle("mode-pill-paused", isPaused);
  modePill.classList.toggle("mode-pill-idle", !isPlaying && !isPaused);
  modePill.dataset.state = isPlaying ? "playing" : isPaused ? "paused" : "idle";
  modePill.textContent = isPlaying ? "PLAYING" : isPaused ? "PAUSED" : "IDLE";

  playIcon.textContent = isPlaying ? "||" : "▶";
  panelPlayIcon.textContent = isPlaying ? "||" : "▶";
  playButton.setAttribute("aria-label", isPlaying ? "Pause Spotify" : "Play Spotify");
  panelPlayButton.setAttribute("aria-label", isPlaying ? "Pause Spotify" : "Play Spotify");

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
  playbackActive = true,
): void {
  const ceiling = qs<HTMLElement>("#lyricsCeiling");
  const activeBlock = qs<HTMLElement>("#activeLyricsBlock");

  updateLyricsToggleUi(lyrics.status, enabled);

  const available = lyrics.status === "found" && lyrics.syncedLyrics.length > 0;
  const shouldShow = enabled && available;
  ceiling.classList.toggle("lyrics-ceiling-hidden", !shouldShow);
  ceiling.classList.toggle("lyrics-ceiling-visible", shouldShow);

  const clearLyrics = () => {
    lastLyricsRenderSignature = "";
    updateLyricGeometryMonitor(null, null, null);
    activeBlock.style.setProperty("--lyric-line-visibility", "0");

    if (lyricClearFadeTimer) {
      window.clearTimeout(lyricClearFadeTimer);
      lyricClearFadeTimer = null;
    }

    if (activeBlock.innerHTML.trim()) {
      lyricClearFadeTimer = window.setTimeout(() => {
        activeBlock.innerHTML = "";
        lyricClearFadeTimer = null;
      }, 650);
    }
  };

  if (!shouldShow) {
    clearLyrics();
    return;
  }

  if (!playbackActive) {
    clearLyrics();
    return;
  }

  if (activeIndex < 0) {
    clearLyrics();
    return;
  }

  const centerIndex = Math.max(0, Math.min(activeIndex, lyrics.syncedLyrics.length - 1));
  const activeLine = lyrics.syncedLyrics[centerIndex];
  if (!activeLine?.text?.trim() || !isLyricLineCurrentlyVisible(lyrics.syncedLyrics, centerIndex, playbackMs)) {
    clearLyrics();
    return;
  }

  const rootStyles = getComputedStyle(document.documentElement);
  const ceilingViewHeight = 529 + getDynamicCeilingRevealCoord(rootStyles);
  const trapezoid = readLyricPosterTrapezoid(rootStyles);
  const rawMaxRowsValue = (qs<HTMLSelectElement>("#lyricPosterMaxRows")?.value || rootStyles.getPropertyValue("--lyric-poster-max-rows").trim() || "auto") as "auto" | "1" | "2" | "3";
  const maxRowsValue = rawMaxRowsValue === "3" ? "auto" : rawMaxRowsValue;
  const transitionValue = (qs<HTMLSelectElement>("#lyricPosterTransition")?.value || rootStyles.getPropertyValue("--lyric-poster-transition").trim() || "none") as LyricPosterTransitionMode;
  const controls = readCeilingPosterControls(rootStyles, maxRowsValue, transitionValue);
  const animationRevision = rootStyles.getPropertyValue("--lyrics-animation-revision").trim();
  const rootClassSignature = document.documentElement.className;
  const renderSignature = `${lyrics.trackKey}|${centerIndex}|${activeLine.text}|${JSON.stringify(trapezoid)}|${JSON.stringify(controls)}|${animationRevision}|${rootClassSignature}`;

  if (renderSignature === lastLyricsRenderSignature) {
    activeBlock.style.setProperty("--lyric-line-visibility", "1");
    return;
  }

  const previousPosterTextForTransition = previousLyricPosterText;
  const lyricTextChanged = activeLine.text !== previousLyricPosterText;
  if (lyricTextChanged) {
    lyricPosterTransitionFlip = !lyricPosterTransitionFlip;
    previousLyricPosterText = activeLine.text;
  }

  lastLyricsRenderSignature = renderSignature;
  if (lyricClearFadeTimer) {
    window.clearTimeout(lyricClearFadeTimer);
    lyricClearFadeTimer = null;
  }
  activeBlock.style.setProperty("--lyric-line-visibility", "1");

  const ceilingRect = ceiling.getBoundingClientRect();
  const layout = buildCeilingPosterLayout(activeLine.text, trapezoid, controls, ceilingRect.width, ceilingRect.height);
  updateLyricGeometryMonitor(layout, trapezoid, controls);
  const shouldUseBackPushTrack =
    controls.transition === "back-push" &&
    lyricTextChanged &&
    Boolean(previousPosterTextForTransition?.trim());
  const previousLayout = shouldUseBackPushTrack
    ? buildCeilingPosterLayout(previousPosterTextForTransition, trapezoid, controls, ceilingRect.width, ceilingRect.height)
    : null;
  const renderPosterRows = (posterLayout: CeilingPosterLayout): string =>
    posterLayout.rows
      .map(
        (row) => `
            <div
              class="lyric-poster-html-row"
              style="width:${row.sourceWidth}px; height:${row.sourceHeight}px; transform:${row.matrix3d};"
            >
              <svg class="lyric-poster-row-svg" viewBox="0 0 ${row.sourceWidth} ${row.sourceHeight}" preserveAspectRatio="none" aria-hidden="true">
                <text
                  class="lyric-poster-row-text"
                  x="${row.sourceWidth / 2}"
                  y="${row.sourceTextY}"
                  font-size="${row.sourceFontSize}"
                  textLength="${row.sourceTextLength}"
                  lengthAdjust="spacingAndGlyphs"
                  dominant-baseline="middle"
                  text-anchor="middle"
                >${escapeHtml(row.text)}</text>
              </svg>
            </div>
          `,
      )
      .join("");
  activeBlock.classList.toggle("lyric-poster-transition-none", controls.transition === "none");
  activeBlock.classList.toggle("lyric-poster-transition-push", controls.transition === "push-slide");
  activeBlock.classList.toggle("lyric-poster-transition-fade", controls.transition === "fade-slide");
  activeBlock.classList.toggle("lyric-poster-transition-shadow-slide", controls.transition === "shadow-slide");
  activeBlock.classList.toggle("lyric-poster-transition-ceiling-stamp", controls.transition === "ceiling-stamp");
  activeBlock.classList.toggle("lyric-poster-transition-soft-dissolve", controls.transition === "soft-dissolve");
  activeBlock.classList.toggle("lyric-poster-transition-ghost-drift", controls.transition === "ghost-drift");
  activeBlock.classList.toggle("lyric-poster-transition-back-push", controls.transition === "back-push");
  activeBlock.classList.toggle("lyric-poster-transition-a", !lyricPosterTransitionFlip);
  activeBlock.classList.toggle("lyric-poster-transition-b", lyricPosterTransitionFlip);
  activeBlock.dataset.lyricRows = String(layout.rows.length);

  const clipId = `lyricPosterClip-${Math.abs(hashString(renderSignature))}`;
  const ceilingRevealCoordForRender = getDynamicCeilingRevealCoord(rootStyles);
  const shiftedTrapezoid = shiftTrapezoidY(trapezoid, ceilingRevealCoordForRender);
  const shiftedRowBands = layout.rowBands.map((band) => shiftTrapezoidY(band, ceilingRevealCoordForRender));
  const shiftedCenterY = layout.centerY + ceilingRevealCoordForRender;
  const clipPolygon = `${(shiftedTrapezoid.topLeftX / 1764) * 100}% ${(shiftedTrapezoid.topLeftY / ceilingViewHeight) * 100}%, ${(shiftedTrapezoid.topRightX / 1764) * 100}% ${(shiftedTrapezoid.topRightY / ceilingViewHeight) * 100}%, ${(shiftedTrapezoid.bottomRightX / 1764) * 100}% ${(shiftedTrapezoid.bottomRightY / ceilingViewHeight) * 100}%, ${(shiftedTrapezoid.bottomLeftX / 1764) * 100}% ${(shiftedTrapezoid.bottomLeftY / ceilingViewHeight) * 100}%`;
  activeBlock.innerHTML = `
    <svg class="lyric-poster-svg lyric-poster-guide-svg" viewBox="0 0 1764 ${ceilingViewHeight}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <clipPath id="${clipId}" clipPathUnits="userSpaceOnUse">
          <polygon points="${shiftedTrapezoid.topLeftX},${shiftedTrapezoid.topLeftY} ${shiftedTrapezoid.topRightX},${shiftedTrapezoid.topRightY} ${shiftedTrapezoid.bottomRightX},${shiftedTrapezoid.bottomRightY} ${shiftedTrapezoid.bottomLeftX},${shiftedTrapezoid.bottomLeftY}" />
        </clipPath>
      </defs>
      <polygon
        class="lyric-poster-svg-guide"
        points="${shiftedTrapezoid.topLeftX},${shiftedTrapezoid.topLeftY} ${shiftedTrapezoid.topRightX},${shiftedTrapezoid.topRightY} ${shiftedTrapezoid.bottomRightX},${shiftedTrapezoid.bottomRightY} ${shiftedTrapezoid.bottomLeftX},${shiftedTrapezoid.bottomLeftY}"
      />
      <circle class="lyric-poster-center-guide" cx="${layout.centerX}" cy="${shiftedCenterY}" r="8" />
      ${renderBandGuidePolygons(shiftedRowBands, layout.rows.length)}
    </svg>
    <div class="lyric-poster-html-rows" style="clip-path: polygon(${clipPolygon});">
      ${
        shouldUseBackPushTrack && previousLayout
          ? `
            <div class="lyric-poster-track-panel lyric-poster-track-old">${renderPosterRows(previousLayout)}</div>
            <div class="lyric-poster-track-panel lyric-poster-track-new">${renderPosterRows(layout)}</div>
          `
          : renderPosterRows(layout)
      }
    </div>
  `;

  void playbackMs;
}

function isLyricLineCurrentlyVisible(
  lines: LyricsPayload["syncedLyrics"],
  index: number,
  playbackMs: number,
): boolean {
  const line = lines[index];
  const startMs = typeof line?.timeMs === "number" ? line.timeMs : null;
  if (startMs === null) return true;
  if (playbackMs < startMs) return false;

  const nextTimedLine = lines.slice(index + 1).find((candidate) => typeof candidate.timeMs === "number");
  const nextStartMs = typeof nextTimedLine?.timeMs === "number" ? nextTimedLine.timeMs : null;
  const gapToNext = nextStartMs === null ? Number.POSITIVE_INFINITY : Math.max(0, nextStartMs - startMs);

  // If the next lyric arrives quickly, keep the current lyric visible until that next line takes over.
  // If there is a long instrumental/singing gap, only hold the current line briefly, then clear the ceiling.
  const longGapThresholdMs = 8_000;
  const naturalHoldMs = estimateLyricLineHoldMs(line.text);
  const visibleUntilMs = gapToNext > longGapThresholdMs
    ? startMs + naturalHoldMs
    : (nextStartMs ?? startMs + naturalHoldMs);

  return playbackMs < visibleUntilMs;
}

function estimateLyricLineHoldMs(text: string): number {
  const normalized = text.trim();
  if (!normalized) return 0;

  // Short lines like "oh" should not vanish instantly, but long lines should not sit through a 30 second gap.
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const characterWeightMs = normalized.length * 95;
  const wordWeightMs = wordCount * 280;
  return Math.max(1_800, Math.min(6_500, 900 + characterWeightMs + wordWeightMs));
}


function getDynamicCeilingRevealCoord(rootStyles: CSSStyleDeclaration): number {
  const value = Number.parseFloat(rootStyles.getPropertyValue("--dynamic-ceiling-reveal-coord"));
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function getDynamicCeilingRevealRatio(rootStyles: CSSStyleDeclaration): number {
  const value = Number.parseFloat(rootStyles.getPropertyValue("--dynamic-ceiling-reveal-ratio"));
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function readCssNumber(rootStyles: CSSStyleDeclaration, name: string, fallback: number): number {
  const value = Number.parseFloat(rootStyles.getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
}

function lerpNumber(start: number, end: number, amount: number): number {
  return start + (end - start) * Math.max(0, Math.min(1, amount));
}

function readTallInterpolatedNumber(
  rootStyles: CSSStyleDeclaration,
  baseName: string,
  tallName: string,
  fallback: number,
  amount: number,
): number {
  const base = readCssNumber(rootStyles, baseName, fallback);
  const tall = readCssNumber(rootStyles, tallName, base);
  return lerpNumber(base, tall, amount);
}

function makeLyricPosterTrapezoid(
  topLeftX: number,
  topLeftY: number,
  topRightX: number,
  topRightY: number,
  bottomLeftX: number,
  bottomLeftY: number,
  bottomRightX: number,
  bottomRightY: number,
): LyricPosterTrapezoid {
  return {
    topLeftX,
    topLeftY,
    topRightX,
    topRightY,
    bottomLeftX,
    bottomLeftY,
    bottomRightX,
    bottomRightY,
    centerX: (topLeftX + topRightX + bottomLeftX + bottomRightX) / 4,
    centerY: (topLeftY + topRightY + bottomLeftY + bottomRightY) / 4,
  };
}

function lineXAtY(x1: number, y1: number, x2: number, y2: number, y: number): number {
  const denominator = y2 - y1;
  if (Math.abs(denominator) < 0.001) return x1;
  return x1 + (x2 - x1) * ((y - y1) / denominator);
}

function readRailDrivenLyricTrapezoid(
  rootStyles: CSSStyleDeclaration,
  names: {
    baseTopLeftX: string;
    baseTopLeftY: string;
    baseTopRightX: string;
    baseTopRightY: string;
    baseBottomLeftX: string;
    baseBottomLeftY: string;
    baseBottomRightX: string;
    baseBottomRightY: string;
    tallTopLeftX: string;
    tallTopLeftY: string;
    tallTopRightX: string;
    tallTopRightY: string;
    tallBottomLeftX: string;
    tallBottomLeftY: string;
    tallBottomRightX: string;
    tallBottomRightY: string;
  },
  fallback: LyricPosterTrapezoid,
): LyricPosterTrapezoid {
  const revealCoord = getDynamicCeilingRevealCoord(rootStyles);
  const revealAmount = getDynamicCeilingRevealRatio(rootStyles);

  const base = makeLyricPosterTrapezoid(
    readCssNumber(rootStyles, names.baseTopLeftX, fallback.topLeftX),
    readCssNumber(rootStyles, names.baseTopLeftY, fallback.topLeftY),
    readCssNumber(rootStyles, names.baseTopRightX, fallback.topRightX),
    readCssNumber(rootStyles, names.baseTopRightY, fallback.topRightY),
    readCssNumber(rootStyles, names.baseBottomLeftX, fallback.bottomLeftX),
    readCssNumber(rootStyles, names.baseBottomLeftY, fallback.bottomLeftY),
    readCssNumber(rootStyles, names.baseBottomRightX, fallback.bottomRightX),
    readCssNumber(rootStyles, names.baseBottomRightY, fallback.bottomRightY),
  );

  if (revealCoord <= 0.5 || revealAmount <= 0.0001) return base;

  const tallTopLeftX = readCssNumber(rootStyles, names.tallTopLeftX, base.topLeftX);
  const tallTopLeftY = readCssNumber(rootStyles, names.tallTopLeftY, base.topLeftY);
  const tallTopRightX = readCssNumber(rootStyles, names.tallTopRightX, base.topRightX);
  const tallTopRightY = readCssNumber(rootStyles, names.tallTopRightY, base.topRightY);
  const tallBottomLeftX = readCssNumber(rootStyles, names.tallBottomLeftX, base.bottomLeftX);
  const tallBottomLeftY = readCssNumber(rootStyles, names.tallBottomLeftY, base.bottomLeftY);
  const tallBottomRightX = readCssNumber(rootStyles, names.tallBottomRightX, base.bottomRightX);
  const tallBottomRightY = readCssNumber(rootStyles, names.tallBottomRightY, base.bottomRightY);

  // The top of the lyric ceiling is not a stored calibration Y. It is the current
  // visible top of the expanded ceiling, expressed in the locked 1764x992 room
  // coordinate space. Side rails come from the tall top/bottom calibration points;
  // the active top corners are where those rails intersect the current visible top.
  const visibleTopY = -revealCoord;
  const bottomLeftX = lerpNumber(base.bottomLeftX, tallBottomLeftX, revealAmount);
  const bottomLeftY = lerpNumber(base.bottomLeftY, tallBottomLeftY, revealAmount);
  const bottomRightX = lerpNumber(base.bottomRightX, tallBottomRightX, revealAmount);
  const bottomRightY = lerpNumber(base.bottomRightY, tallBottomRightY, revealAmount);
  const clampTopLeftX = readCssNumber(rootStyles, "--lyric-poster-tall-clamp-top-left-x", tallTopLeftX);
  const clampTopLeftY = readCssNumber(rootStyles, "--lyric-poster-tall-clamp-top-left-y", tallTopLeftY);
  const clampTopRightX = readCssNumber(rootStyles, "--lyric-poster-tall-clamp-top-right-x", tallTopRightX);
  const clampTopRightY = readCssNumber(rootStyles, "--lyric-poster-tall-clamp-top-right-y", tallTopRightY);
  const useLeftClamp = visibleTopY <= clampTopLeftY;
  const useRightClamp = visibleTopY <= clampTopRightY;
  const topLeftY = useLeftClamp ? clampTopLeftY : visibleTopY;
  const topRightY = useRightClamp ? clampTopRightY : visibleTopY;
  const topLeftX = useLeftClamp
    ? clampTopLeftX
    : lineXAtY(tallTopLeftX, tallTopLeftY, tallBottomLeftX, tallBottomLeftY, topLeftY);
  const topRightX = useRightClamp
    ? clampTopRightX
    : lineXAtY(tallTopRightX, tallTopRightY, tallBottomRightX, tallBottomRightY, topRightY);

  return makeLyricPosterTrapezoid(
    topLeftX,
    topLeftY,
    topRightX,
    topRightY,
    bottomLeftX,
    bottomLeftY,
    bottomRightX,
    bottomRightY,
  );
}

function readLyricPosterTrapezoid(rootStyles: CSSStyleDeclaration): LyricPosterTrapezoid {
  return readRailDrivenLyricTrapezoid(
    rootStyles,
    {
      baseTopLeftX: "--lyric-poster-top-left-x",
      baseTopLeftY: "--lyric-poster-top-left-y",
      baseTopRightX: "--lyric-poster-top-right-x",
      baseTopRightY: "--lyric-poster-top-right-y",
      baseBottomLeftX: "--lyric-poster-bottom-left-x",
      baseBottomLeftY: "--lyric-poster-bottom-left-y",
      baseBottomRightX: "--lyric-poster-bottom-right-x",
      baseBottomRightY: "--lyric-poster-bottom-right-y",
      tallTopLeftX: "--lyric-poster-tall-top-left-x",
      tallTopLeftY: "--lyric-poster-tall-top-left-y",
      tallTopRightX: "--lyric-poster-tall-top-right-x",
      tallTopRightY: "--lyric-poster-tall-top-right-y",
      tallBottomLeftX: "--lyric-poster-tall-bottom-left-x",
      tallBottomLeftY: "--lyric-poster-tall-bottom-left-y",
      tallBottomRightX: "--lyric-poster-tall-bottom-right-x",
      tallBottomRightY: "--lyric-poster-tall-bottom-right-y",
    },
    makeLyricPosterTrapezoid(221, 18, 1562, 3, 454, 195, 1343, 189),
  );
}

function mapTallBandYToActiveCeiling(
  rootStyles: CSSStyleDeclaration,
  activeTrapezoid: LyricPosterTrapezoid,
  baseName: string,
  tallName: string,
  fallbackBase: number,
): number {
  const revealCoord = getDynamicCeilingRevealCoord(rootStyles);
  const revealAmount = getDynamicCeilingRevealRatio(rootStyles);
  const base = readCssNumber(rootStyles, baseName, fallbackBase);
  if (revealCoord <= 0.5 || revealAmount <= 0.0001) return base;

  const tallValue = readCssNumber(rootStyles, tallName, base);
  const tallTopY = (readCssNumber(rootStyles, "--lyric-poster-tall-top-left-y", -139) + readCssNumber(rootStyles, "--lyric-poster-tall-top-right-y", -133)) / 2;
  const tallBottomY = (readCssNumber(rootStyles, "--lyric-poster-tall-bottom-left-y", 187) + readCssNumber(rootStyles, "--lyric-poster-tall-bottom-right-y", 191)) / 2;
  const denominator = tallBottomY - tallTopY;
  const ratio = Math.abs(denominator) < 0.001 ? 0 : clamp((tallValue - tallTopY) / denominator, 0, 1);
  const activeTopY = Math.min(activeTrapezoid.topLeftY, activeTrapezoid.topRightY);
  const activeBottomY = Math.max(activeTrapezoid.bottomLeftY, activeTrapezoid.bottomRightY);
  return lerpNumber(activeTopY, activeBottomY, ratio);
}

function readCeilingPosterControls(
  rootStyles: CSSStyleDeclaration,
  maxRowsValue: "auto" | "1" | "2" | "3",
  transitionValue: LyricPosterTransitionMode,
): CeilingPosterControls {
  const readNumber = (name: string, fallback: number) => readCssNumber(rootStyles, name, fallback);
  const revealAmount = getDynamicCeilingRevealRatio(rootStyles);
  const activeMainTrapezoid = readLyricPosterTrapezoid(rootStyles);
  const tall = (baseName: string, tallName: string, fallback: number) =>
    readTallInterpolatedNumber(rootStyles, baseName, tallName, fallback, revealAmount);
  const activeBandY = (baseName: string, tallName: string, fallback: number) =>
    mapTallBandYToActiveCeiling(rootStyles, activeMainTrapezoid, baseName, tallName, fallback);
  const activeShortTrapezoid = readRailDrivenLyricTrapezoid(
    rootStyles,
    {
      baseTopLeftX: "--lyric-poster-short-tl-x",
      baseTopLeftY: "--lyric-poster-short-tl-y",
      baseTopRightX: "--lyric-poster-short-tr-x",
      baseTopRightY: "--lyric-poster-short-tr-y",
      baseBottomLeftX: "--lyric-poster-short-bl-x",
      baseBottomLeftY: "--lyric-poster-short-bl-y",
      baseBottomRightX: "--lyric-poster-short-br-x",
      baseBottomRightY: "--lyric-poster-short-br-y",
      tallTopLeftX: "--lyric-poster-tall-short-top-left-x",
      tallTopLeftY: "--lyric-poster-tall-short-top-left-y",
      tallTopRightX: "--lyric-poster-tall-short-top-right-x",
      tallTopRightY: "--lyric-poster-tall-short-top-right-y",
      tallBottomLeftX: "--lyric-poster-tall-short-bottom-left-x",
      tallBottomLeftY: "--lyric-poster-tall-short-bottom-left-y",
      tallBottomRightX: "--lyric-poster-tall-short-bottom-right-x",
      tallBottomRightY: "--lyric-poster-tall-short-bottom-right-y",
    },
    makeLyricPosterTrapezoid(221, 18, 1460, 3, 454, 195, 1343, 189),
  );

  return {
    maxRows: maxRowsValue,
    transition: transitionValue,
    tallRevealRatio: revealAmount,
    rowBreakpoint: readNumber("--lyric-poster-row-breakpoint", 28),
    twoRowBandGuideOpacity: readNumber("--lyric-poster-two-row-band-guide-opacity", 0),
    threeRowBandGuideOpacity: readNumber("--lyric-poster-three-row-band-guide-opacity", 0),
    shortGuideOpacity: readNumber("--lyric-poster-short-guide-opacity", 0),
    shortTopLeftX: activeShortTrapezoid.topLeftX,
    shortTopLeftY: activeShortTrapezoid.topLeftY,
    shortTopRightX: activeShortTrapezoid.topRightX,
    shortTopRightY: activeShortTrapezoid.topRightY,
    shortBottomLeftX: activeShortTrapezoid.bottomLeftX,
    shortBottomLeftY: activeShortTrapezoid.bottomLeftY,
    shortBottomRightX: activeShortTrapezoid.bottomRightX,
    shortBottomRightY: activeShortTrapezoid.bottomRightY,
    shortVerticalStretch: readNumber("--lyric-poster-short-vertical-stretch", 0.78),
    shortPerspective: readNumber("--lyric-poster-short-perspective", 1.2),
    shortTilt: readNumber("--lyric-poster-short-tilt", -26),
    shortTextTopLeftX: readNumber("--lyric-poster-short-text-tl-x", -160),
    shortTextTopLeftY: readNumber("--lyric-poster-short-text-tl-y", 0),
    shortTextTopRightX: readNumber("--lyric-poster-short-text-tr-x", 160),
    shortTextTopRightY: readNumber("--lyric-poster-short-text-tr-y", 0),
    shortTextBottomLeftX: readNumber("--lyric-poster-short-text-bl-x", 0),
    shortTextBottomLeftY: readNumber("--lyric-poster-short-text-bl-y", 0),
    shortTextBottomRightX: readNumber("--lyric-poster-short-text-br-x", 0),
    shortTextBottomRightY: readNumber("--lyric-poster-short-text-br-y", 0),
    twoRowTopBandTopY: activeBandY("--lyric-poster-two-row-top-band-top-y", "--lyric-poster-tall-two-row-top-band-top-y", 18),
    twoRowTopBandBottomY: activeBandY("--lyric-poster-two-row-top-band-bottom-y", "--lyric-poster-tall-two-row-top-band-bottom-y", 106),
    twoRowBottomBandTopY: activeBandY("--lyric-poster-two-row-bottom-band-top-y", "--lyric-poster-tall-two-row-bottom-band-top-y", 106),
    twoRowBottomBandBottomY: activeBandY("--lyric-poster-two-row-bottom-band-bottom-y", "--lyric-poster-tall-two-row-bottom-band-bottom-y", 195),
    threeRowTopBandTopY: readNumber("--lyric-poster-three-row-top-band-top-y", 18),
    threeRowTopBandBottomY: readNumber("--lyric-poster-three-row-top-band-bottom-y", 76),
    threeRowMiddleBandTopY: readNumber("--lyric-poster-three-row-middle-band-top-y", 76),
    threeRowMiddleBandBottomY: readNumber("--lyric-poster-three-row-middle-band-bottom-y", 136),
    threeRowBottomBandTopY: readNumber("--lyric-poster-three-row-bottom-band-top-y", 136),
    threeRowBottomBandBottomY: readNumber("--lyric-poster-three-row-bottom-band-bottom-y", 195),
    oneRowVerticalStretch: readNumber("--lyric-poster-one-row-vertical-stretch", 1.35),
    oneRowTightness: readNumber("--lyric-poster-one-row-tightness", 0),
    oneRowPerspective: readNumber("--lyric-poster-one-row-perspective", 1),
    oneRowTilt: readNumber("--lyric-poster-one-row-tilt", -8),
    oneRowTextTopLeftX: tall("--lyric-poster-one-row-text-top-left-x", "--lyric-poster-tall-one-row-text-top-left-x", 0),
    oneRowTextTopLeftY: tall("--lyric-poster-one-row-text-top-left-y", "--lyric-poster-tall-one-row-text-top-left-y", 0),
    oneRowTextTopRightX: tall("--lyric-poster-one-row-text-top-right-x", "--lyric-poster-tall-one-row-text-top-right-x", 0),
    oneRowTextTopRightY: tall("--lyric-poster-one-row-text-top-right-y", "--lyric-poster-tall-one-row-text-top-right-y", 0),
    oneRowTextBottomLeftX: tall("--lyric-poster-one-row-text-bottom-left-x", "--lyric-poster-tall-one-row-text-bottom-left-x", 0),
    oneRowTextBottomLeftY: tall("--lyric-poster-one-row-text-bottom-left-y", "--lyric-poster-tall-one-row-text-bottom-left-y", 0),
    oneRowTextBottomRightX: tall("--lyric-poster-one-row-text-bottom-right-x", "--lyric-poster-tall-one-row-text-bottom-right-x", 0),
    oneRowTextBottomRightY: tall("--lyric-poster-one-row-text-bottom-right-y", "--lyric-poster-tall-one-row-text-bottom-right-y", 0),
    twoRowVerticalStretch: readNumber("--lyric-poster-two-row-vertical-stretch", 1.10),
    twoRowTopY: readNumber("--lyric-poster-two-row-top-y", 0),
    twoRowBottomY: readNumber("--lyric-poster-two-row-bottom-y", 0),
    twoRowTightness: readNumber("--lyric-poster-two-row-tightness", -0.20),
    twoRowPerspective: readNumber("--lyric-poster-two-row-perspective", 1),
    twoRowTilt: readNumber("--lyric-poster-two-row-tilt", -10),
    threeRowVerticalStretch: readNumber("--lyric-poster-three-row-vertical-stretch", 0.95),
    threeRowTopY: readNumber("--lyric-poster-three-row-top-y", 0),
    threeRowMiddleY: readNumber("--lyric-poster-three-row-middle-y", 0),
    threeRowBottomY: readNumber("--lyric-poster-three-row-bottom-y", 0),
    threeRowTightness: readNumber("--lyric-poster-three-row-tightness", -0.25),
    threeRowPerspective: readNumber("--lyric-poster-three-row-perspective", 1),
    threeRowTilt: readNumber("--lyric-poster-three-row-tilt", -12),
    twoRowTopTextTopLeftX: tall("--lyric-poster-two-row-top-text-top-left-x", "--lyric-poster-tall-two-row-top-text-top-left-x", 0),
    twoRowTopTextTopLeftY: tall("--lyric-poster-two-row-top-text-top-left-y", "--lyric-poster-tall-two-row-top-text-top-left-y", 0),
    twoRowTopTextTopRightX: tall("--lyric-poster-two-row-top-text-top-right-x", "--lyric-poster-tall-two-row-top-text-top-right-x", 0),
    twoRowTopTextTopRightY: tall("--lyric-poster-two-row-top-text-top-right-y", "--lyric-poster-tall-two-row-top-text-top-right-y", 0),
    twoRowTopTextBottomLeftX: tall("--lyric-poster-two-row-top-text-bottom-left-x", "--lyric-poster-tall-two-row-top-text-bottom-left-x", 0),
    twoRowTopTextBottomLeftY: tall("--lyric-poster-two-row-top-text-bottom-left-y", "--lyric-poster-tall-two-row-top-text-bottom-left-y", 0),
    twoRowTopTextBottomRightX: tall("--lyric-poster-two-row-top-text-bottom-right-x", "--lyric-poster-tall-two-row-top-text-bottom-right-x", 0),
    twoRowTopTextBottomRightY: tall("--lyric-poster-two-row-top-text-bottom-right-y", "--lyric-poster-tall-two-row-top-text-bottom-right-y", 0),
    twoRowBottomTextTopLeftX: tall("--lyric-poster-two-row-bottom-text-top-left-x", "--lyric-poster-tall-two-row-bottom-text-top-left-x", 0),
    twoRowBottomTextTopLeftY: tall("--lyric-poster-two-row-bottom-text-top-left-y", "--lyric-poster-tall-two-row-bottom-text-top-left-y", 0),
    twoRowBottomTextTopRightX: tall("--lyric-poster-two-row-bottom-text-top-right-x", "--lyric-poster-tall-two-row-bottom-text-top-right-x", 0),
    twoRowBottomTextTopRightY: tall("--lyric-poster-two-row-bottom-text-top-right-y", "--lyric-poster-tall-two-row-bottom-text-top-right-y", 0),
    twoRowBottomTextBottomLeftX: tall("--lyric-poster-two-row-bottom-text-bottom-left-x", "--lyric-poster-tall-two-row-bottom-text-bottom-left-x", 0),
    twoRowBottomTextBottomLeftY: tall("--lyric-poster-two-row-bottom-text-bottom-left-y", "--lyric-poster-tall-two-row-bottom-text-bottom-left-y", 0),
    twoRowBottomTextBottomRightX: tall("--lyric-poster-two-row-bottom-text-bottom-right-x", "--lyric-poster-tall-two-row-bottom-text-bottom-right-x", 0),
    twoRowBottomTextBottomRightY: tall("--lyric-poster-two-row-bottom-text-bottom-right-y", "--lyric-poster-tall-two-row-bottom-text-bottom-right-y", 0),
    threeRowTopTextTopLeftX: readNumber("--lyric-poster-three-row-top-text-top-left-x", 0),
    threeRowTopTextTopLeftY: readNumber("--lyric-poster-three-row-top-text-top-left-y", 0),
    threeRowTopTextTopRightX: readNumber("--lyric-poster-three-row-top-text-top-right-x", 0),
    threeRowTopTextTopRightY: readNumber("--lyric-poster-three-row-top-text-top-right-y", 0),
    threeRowTopTextBottomLeftX: readNumber("--lyric-poster-three-row-top-text-bottom-left-x", 0),
    threeRowTopTextBottomLeftY: readNumber("--lyric-poster-three-row-top-text-bottom-left-y", 0),
    threeRowTopTextBottomRightX: readNumber("--lyric-poster-three-row-top-text-bottom-right-x", 0),
    threeRowTopTextBottomRightY: readNumber("--lyric-poster-three-row-top-text-bottom-right-y", 0),
    threeRowMiddleTextTopLeftX: readNumber("--lyric-poster-three-row-middle-text-top-left-x", 0),
    threeRowMiddleTextTopLeftY: readNumber("--lyric-poster-three-row-middle-text-top-left-y", 0),
    threeRowMiddleTextTopRightX: readNumber("--lyric-poster-three-row-middle-text-top-right-x", 0),
    threeRowMiddleTextTopRightY: readNumber("--lyric-poster-three-row-middle-text-top-right-y", 0),
    threeRowMiddleTextBottomLeftX: readNumber("--lyric-poster-three-row-middle-text-bottom-left-x", 0),
    threeRowMiddleTextBottomLeftY: readNumber("--lyric-poster-three-row-middle-text-bottom-left-y", 0),
    threeRowMiddleTextBottomRightX: readNumber("--lyric-poster-three-row-middle-text-bottom-right-x", 0),
    threeRowMiddleTextBottomRightY: readNumber("--lyric-poster-three-row-middle-text-bottom-right-y", 0),
    threeRowBottomTextTopLeftX: readNumber("--lyric-poster-three-row-bottom-text-top-left-x", 0),
    threeRowBottomTextTopLeftY: readNumber("--lyric-poster-three-row-bottom-text-top-left-y", 0),
    threeRowBottomTextTopRightX: readNumber("--lyric-poster-three-row-bottom-text-top-right-x", 0),
    threeRowBottomTextTopRightY: readNumber("--lyric-poster-three-row-bottom-text-top-right-y", 0),
    threeRowBottomTextBottomLeftX: readNumber("--lyric-poster-three-row-bottom-text-bottom-left-x", 0),
    threeRowBottomTextBottomLeftY: readNumber("--lyric-poster-three-row-bottom-text-bottom-left-y", 0),
    threeRowBottomTextBottomRightX: readNumber("--lyric-poster-three-row-bottom-text-bottom-right-x", 0),
    threeRowBottomTextBottomRightY: readNumber("--lyric-poster-three-row-bottom-text-bottom-right-y", 0),
  };
}

function buildCeilingPosterLayout(
  text: string,
  trapezoid: LyricPosterTrapezoid,
  controls: CeilingPosterControls,
  ceilingWidth: number,
  ceilingHeight: number,
): CeilingPosterLayout {
  const words = normalizePosterWords(text);
  const isShortLyric = text.trim().length <= 6;
  const activeTrapezoid: LyricPosterTrapezoid = isShortLyric
    ? {
        topLeftX: controls.shortTopLeftX,
        topLeftY: controls.shortTopLeftY,
        topRightX: controls.shortTopRightX,
        topRightY: controls.shortTopRightY,
        bottomLeftX: controls.shortBottomLeftX,
        bottomLeftY: controls.shortBottomLeftY,
        bottomRightX: controls.shortBottomRightX,
        bottomRightY: controls.shortBottomRightY,
        centerX:
          (controls.shortTopLeftX +
            controls.shortTopRightX +
            controls.shortBottomLeftX +
            controls.shortBottomRightX) /
          4,
        centerY:
          (controls.shortTopLeftY +
            controls.shortTopRightY +
            controls.shortBottomLeftY +
            controls.shortBottomRightY) /
          4,
      }
    : trapezoid;
  const activeControls = isShortLyric
    ? {
        ...controls,
        oneRowVerticalStretch: controls.shortVerticalStretch,
        oneRowPerspective: controls.shortPerspective,
        oneRowTilt: controls.shortTilt,
        oneRowTextTopLeftX: controls.shortTextTopLeftX,
        oneRowTextTopLeftY: controls.shortTextTopLeftY,
        oneRowTextTopRightX: controls.shortTextTopRightX,
        oneRowTextTopRightY: controls.shortTextTopRightY,
        oneRowTextBottomLeftX: controls.shortTextBottomLeftX,
        oneRowTextBottomLeftY: controls.shortTextBottomLeftY,
        oneRowTextBottomRightX: controls.shortTextBottomRightX,
        oneRowTextBottomRightY: controls.shortTextBottomRightY,
      }
    : controls;
  const requestedRows = isShortLyric ? 1 : (controls.maxRows === "auto" ? choosePosterRowCount(words, controls.rowBreakpoint) : Number.parseInt(controls.maxRows, 10));
  const rowCount = Math.max(1, Math.min(2, requestedRows));
  const rowTexts = balanceWordsIntoRows(words, rowCount);
  const n = Math.max(1, Math.min(2, rowTexts.length)) as 1 | 2;
  const tallModeActive = controls.tallRevealRatio > 0.001;
  const geometryMode: CeilingPosterLayout["geometryMode"] = tallModeActive ? "tall" : "legacy-16x9";
  const lyricMode: CeilingPosterLayout["lyricMode"] = isShortLyric ? "short" : n === 1 ? "1-row" : "2-row";
  const profile = getPosterRowProfile(n, activeControls);
  const scaleX = Math.max(0.001, ceilingWidth / 1764);
  const ceilingRevealCoord = getDynamicCeilingRevealCoord(getComputedStyle(document.documentElement));
  const ceilingViewHeight = Math.max(529, 529 + ceilingRevealCoord);
  const scaleY = Math.max(0.001, ceilingHeight / ceilingViewHeight);
  const rowBands = getRowBandTrapezoids(n, activeTrapezoid, activeControls);

  const autoCeilingTilt = getCeilingSideTiltDegrees(activeTrapezoid);
  const perspectiveTilt = autoCeilingTilt * clamp(profile.perspective / 2.25, 0.10, 2.80);

  const rows = rowTexts.map((rowText, index) => {
    const band = rowBands[index] ?? rowBands[rowBands.length - 1] ?? trapezoid;
    const bandTopY = Math.min(band.topLeftY, band.topRightY);
    const bandBottomY = Math.max(band.bottomLeftY, band.bottomRightY);
    const bandHeight = Math.max(12, bandBottomY - bandTopY);
    const bandCenterY = (bandTopY + bandBottomY) / 2;
    const bandCenterX = (band.topLeftX + band.topRightX + band.bottomLeftX + band.bottomRightX) / 4;

    const scaleYForRow = clamp(profile.verticalStretch, 0.28, 4.00);
    const visualHalfHeight = Math.max(4, bandHeight * 0.50 * scaleYForRow);
    const rowTilt = clamp(perspectiveTilt + profile.tilt, -76, 76);
    const skewPad = Math.abs(Math.tan((rowTilt * Math.PI) / 180)) * visualHalfHeight;
    const strokePad = Math.max(6, bandHeight * 0.035) + skewPad * 0.18;
    const top = clamp(bandCenterY - bandHeight * 0.50, bandTopY, bandBottomY);
    const bottom = clamp(bandCenterY + bandHeight * 0.50, bandTopY, bandBottomY);
    const topBounds = trapezoidHorizontalBoundsAtY(band, top);
    const bottomBounds = trapezoidHorizontalBoundsAtY(band, bottom);
    const safeLeft = Math.max(topBounds.left, bottomBounds.left) + strokePad;
    const safeRight = Math.min(topBounds.right, bottomBounds.right) - strokePad;
    const halfWidth = Math.max(24, Math.min(bandCenterX - safeLeft, safeRight - bandCenterX));
    const left = bandCenterX - halfWidth;
    const right = bandCenterX + halfWidth;
    const padY = Math.max(2, bandHeight * 0.018);

    let topLeft = { x: left, y: top + padY };
    let topRight = { x: right, y: top + padY };
    let bottomLeft = { x: left, y: bottom - padY };
    let bottomRight = { x: right, y: bottom - padY };

    const cornerOffsets = getRowProjectionOffsets(n, index, activeControls);
    topLeft = addPoint(topLeft, cornerOffsets.topLeftX, cornerOffsets.topLeftY);
    topRight = addPoint(topRight, cornerOffsets.topRightX, cornerOffsets.topRightY);
    bottomLeft = addPoint(bottomLeft, cornerOffsets.bottomLeftX, cornerOffsets.bottomLeftY);
    bottomRight = addPoint(bottomRight, cornerOffsets.bottomRightX, cornerOffsets.bottomRightY);

    const legacyFit = centerAndFitQuadInsideTrapezoid(
      [topLeft, topRight, bottomRight, bottomLeft],
      band,
    );
    const tallTarget: PosterQuad = [
      addPoint({ x: band.topLeftX, y: band.topLeftY }, cornerOffsets.topLeftX, cornerOffsets.topLeftY),
      addPoint({ x: band.topRightX, y: band.topRightY }, cornerOffsets.topRightX, cornerOffsets.topRightY),
      addPoint({ x: band.bottomRightX, y: band.bottomRightY }, cornerOffsets.bottomRightX, cornerOffsets.bottomRightY),
      addPoint({ x: band.bottomLeftX, y: band.bottomLeftY }, cornerOffsets.bottomLeftX, cornerOffsets.bottomLeftY),
    ];

    // Once any ceiling reveal exists, stop blending with the 16:9 legacy placement.
    // Tall mode now uses the same active guide quad as the target for the text.
    // This prevents the old normal-window placement from pulling the lyrics down
    // while the tall guide is already in the expanded ceiling area.
    const guideQuad: PosterQuad = tallModeActive ? tallTarget : legacyFit;
    const actualQuad = correctQuadToGuideFrame(tallModeActive ? tallTarget : legacyFit, guideQuad);
    [topLeft, topRight, bottomRight, bottomLeft] = actualQuad;

    const destination = actualQuad.map((point) => ({
      x: point.x * scaleX,
      y: (point.y + ceilingRevealCoord) * scaleY,
    }));

    // The projected quad is now the source of truth. Keep the text safely inside
    // the unwarped source box before mapping that box onto the calibrated guide
    // frame. Earlier versions let glyphs overflow the source SVG, which made the
    // text appear outside the guide even when the quad itself was correct.
    const sourceWidth = 1400;
    const sourceHeight = 220;
    const sourceFontSize = sourceHeight * (controls.tallRevealRatio > 0.05 ? 0.66 : clamp(profile.verticalStretch, 0.40, 2.60));
    const sourceTextLength = sourceWidth * (controls.tallRevealRatio > 0.05 ? 0.90 : 0.965);
    const sourceTextY = sourceHeight * (controls.tallRevealRatio > 0.05 ? 0.53 : 0.50);
    const matrix3d = quadToCssMatrix3d(sourceWidth, sourceHeight, destination[0], destination[1], destination[2], destination[3]);

    return {
      text: rowText,
      sourceWidth,
      sourceHeight,
      sourceFontSize,
      sourceTextLength,
      sourceTextY,
      matrix3d,
      guideQuad,
      actualQuad,
    };
  });

  return { rows, centerX: trapezoid.centerX, centerY: trapezoid.centerY, rowBands, geometryMode, lyricMode };
}


function getRowBandTrapezoids(
  rowCount: 1 | 2 | 3,
  full: LyricPosterTrapezoid,
  controls: CeilingPosterControls,
): LyricPosterTrapezoid[] {
  if (rowCount === 1) return [full];

  if (rowCount === 2) {
    return [
      makeBandTrapezoid(full, controls.twoRowTopBandTopY, controls.twoRowTopBandBottomY),
      makeBandTrapezoid(full, controls.twoRowBottomBandTopY, controls.twoRowBottomBandBottomY),
    ];
  }

  return [
    makeBandTrapezoid(full, controls.threeRowTopBandTopY, controls.threeRowTopBandBottomY),
    makeBandTrapezoid(full, controls.threeRowMiddleBandTopY, controls.threeRowMiddleBandBottomY),
    makeBandTrapezoid(full, controls.threeRowBottomBandTopY, controls.threeRowBottomBandBottomY),
  ];
}

function makeBandTrapezoid(full: LyricPosterTrapezoid, rawTopY: number, rawBottomY: number): LyricPosterTrapezoid {
  const fullTop = Math.min(full.topLeftY, full.topRightY);
  const fullBottom = Math.max(full.bottomLeftY, full.bottomRightY);
  const topY = clamp(Math.min(rawTopY, rawBottomY), fullTop, fullBottom);
  const bottomY = clamp(Math.max(rawTopY, rawBottomY), fullTop, fullBottom);
  const safeBottomY = Math.max(bottomY, topY + 4);
  const topBounds = trapezoidHorizontalBoundsAtY(full, topY);
  const bottomBounds = trapezoidHorizontalBoundsAtY(full, safeBottomY);
  return {
    topLeftX: topBounds.left,
    topLeftY: topY,
    topRightX: topBounds.right,
    topRightY: topY,
    bottomLeftX: bottomBounds.left,
    bottomLeftY: safeBottomY,
    bottomRightX: bottomBounds.right,
    bottomRightY: safeBottomY,
    centerX: (topBounds.left + topBounds.right + bottomBounds.left + bottomBounds.right) / 4,
    centerY: (topY + safeBottomY) / 2,
  };
}

function shiftTrapezoidY(trapezoid: LyricPosterTrapezoid, amount: number): LyricPosterTrapezoid {
  if (!amount) return trapezoid;
  return {
    ...trapezoid,
    topLeftY: trapezoid.topLeftY + amount,
    topRightY: trapezoid.topRightY + amount,
    bottomLeftY: trapezoid.bottomLeftY + amount,
    bottomRightY: trapezoid.bottomRightY + amount,
    centerY: trapezoid.centerY + amount,
  };
}

function renderBandGuidePolygons(rowBands: LyricPosterTrapezoid[], rowCount: number): string {
  if (rowCount < 2) return "";
  const className = rowCount === 3 ? "lyric-poster-row-band-guide three-row" : "lyric-poster-row-band-guide";
  return rowBands
    .map(
      (band) => `<polygon class="${className}" points="${band.topLeftX},${band.topLeftY} ${band.topRightX},${band.topRightY} ${band.bottomRightX},${band.bottomRightY} ${band.bottomLeftX},${band.bottomLeftY}" />`,
    )
    .join("");
}

function getPosterRowProfile(rowCount: 1 | 2 | 3, controls: CeilingPosterControls): PosterRowProfile {
  if (rowCount === 1) {
    return {
      verticalStretch: clamp(controls.oneRowVerticalStretch, 0.40, 3.00),
      tightness: clamp(controls.oneRowTightness, -1.20, 0.80),
      perspective: clamp(controls.oneRowPerspective, 0, 3),
      tilt: clamp(controls.oneRowTilt, -75, 75),
    };
  }

  if (rowCount === 2) {
    return {
      verticalStretch: clamp(controls.twoRowVerticalStretch, 0.40, 3.00),
      tightness: clamp(controls.twoRowTightness, -1.20, 0.80),
      perspective: clamp(controls.twoRowPerspective, 0, 3),
      tilt: clamp(controls.twoRowTilt, -75, 75),
    };
  }

  return {
    verticalStretch: clamp(controls.threeRowVerticalStretch, 0.40, 3.00),
    tightness: clamp(controls.threeRowTightness, -1.20, 0.80),
    perspective: clamp(controls.threeRowPerspective, 0, 3),
    tilt: clamp(controls.threeRowTilt, -75, 75),
  };
}



function getRowVerticalOffset(
  rowCount: 1 | 2 | 3,
  rowIndex: number,
  controls: CeilingPosterControls,
): number {
  if (rowCount === 2 && rowIndex === 0) return controls.twoRowTopY;
  if (rowCount === 2 && rowIndex === 1) return controls.twoRowBottomY;
  if (rowCount === 3 && rowIndex === 0) return controls.threeRowTopY;
  if (rowCount === 3 && rowIndex === 1) return controls.threeRowMiddleY;
  if (rowCount === 3 && rowIndex === 2) return controls.threeRowBottomY;
  return 0;
}

function getRowProjectionOffsets(
  rowCount: 1 | 2 | 3,
  rowIndex: number,
  controls: CeilingPosterControls,
): RowProjectionOffsets {
  if (rowCount === 1) {
    return {
      topLeftX: controls.oneRowTextTopLeftX,
      topLeftY: controls.oneRowTextTopLeftY,
      topRightX: controls.oneRowTextTopRightX,
      topRightY: controls.oneRowTextTopRightY,
      bottomLeftX: controls.oneRowTextBottomLeftX,
      bottomLeftY: controls.oneRowTextBottomLeftY,
      bottomRightX: controls.oneRowTextBottomRightX,
      bottomRightY: controls.oneRowTextBottomRightY,
    };
  }

  if (rowCount === 2 && rowIndex === 0) {
    return {
      topLeftX: controls.twoRowTopTextTopLeftX,
      topLeftY: controls.twoRowTopTextTopLeftY,
      topRightX: controls.twoRowTopTextTopRightX,
      topRightY: controls.twoRowTopTextTopRightY,
      bottomLeftX: controls.twoRowTopTextBottomLeftX,
      bottomLeftY: controls.twoRowTopTextBottomLeftY,
      bottomRightX: controls.twoRowTopTextBottomRightX,
      bottomRightY: controls.twoRowTopTextBottomRightY,
    };
  }

  if (rowCount === 2 && rowIndex === 1) {
    return {
      topLeftX: controls.twoRowBottomTextTopLeftX,
      topLeftY: controls.twoRowBottomTextTopLeftY,
      topRightX: controls.twoRowBottomTextTopRightX,
      topRightY: controls.twoRowBottomTextTopRightY,
      bottomLeftX: controls.twoRowBottomTextBottomLeftX,
      bottomLeftY: controls.twoRowBottomTextBottomLeftY,
      bottomRightX: controls.twoRowBottomTextBottomRightX,
      bottomRightY: controls.twoRowBottomTextBottomRightY,
    };
  }

  if (rowCount === 3 && rowIndex === 0) {
    return {
      topLeftX: controls.threeRowTopTextTopLeftX,
      topLeftY: controls.threeRowTopTextTopLeftY,
      topRightX: controls.threeRowTopTextTopRightX,
      topRightY: controls.threeRowTopTextTopRightY,
      bottomLeftX: controls.threeRowTopTextBottomLeftX,
      bottomLeftY: controls.threeRowTopTextBottomLeftY,
      bottomRightX: controls.threeRowTopTextBottomRightX,
      bottomRightY: controls.threeRowTopTextBottomRightY,
    };
  }

  if (rowCount === 3 && rowIndex === 1) {
    return {
      topLeftX: controls.threeRowMiddleTextTopLeftX,
      topLeftY: controls.threeRowMiddleTextTopLeftY,
      topRightX: controls.threeRowMiddleTextTopRightX,
      topRightY: controls.threeRowMiddleTextTopRightY,
      bottomLeftX: controls.threeRowMiddleTextBottomLeftX,
      bottomLeftY: controls.threeRowMiddleTextBottomLeftY,
      bottomRightX: controls.threeRowMiddleTextBottomRightX,
      bottomRightY: controls.threeRowMiddleTextBottomRightY,
    };
  }

  return {
    topLeftX: controls.threeRowBottomTextTopLeftX,
    topLeftY: controls.threeRowBottomTextTopLeftY,
    topRightX: controls.threeRowBottomTextTopRightX,
    topRightY: controls.threeRowBottomTextTopRightY,
    bottomLeftX: controls.threeRowBottomTextBottomLeftX,
    bottomLeftY: controls.threeRowBottomTextBottomLeftY,
    bottomRightX: controls.threeRowBottomTextBottomRightX,
    bottomRightY: controls.threeRowBottomTextBottomRightY,
  };
}

function centerAndFitQuadInsideTrapezoid(
  points: [Point2D, Point2D, Point2D, Point2D],
  trapezoid: LyricPosterTrapezoid,
): [Point2D, Point2D, Point2D, Point2D] {
  const targetCenter = { x: trapezoid.centerX, y: trapezoid.centerY };
  const currentCenter = getPointAverage(points);
  const centered = translatePoints(points, targetCenter.x - currentCenter.x, targetCenter.y - currentCenter.y);

  for (let scale = 1; scale >= 0.12; scale -= 0.015) {
    const candidate = centered.map((point) => scalePointAbout(point, targetCenter, scale)) as [Point2D, Point2D, Point2D, Point2D];
    if (isQuadInsideTrapezoid(candidate, trapezoid)) return candidate;
  }

  return centered.map((point) => constrainPointToTrapezoid(point, trapezoid)) as [Point2D, Point2D, Point2D, Point2D];
}

function getPointAverage(points: Point2D[]): Point2D {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function translatePoints(points: Point2D[], x: number, y: number): [Point2D, Point2D, Point2D, Point2D] {
  return points.map((point) => ({ x: point.x + x, y: point.y + y })) as [Point2D, Point2D, Point2D, Point2D];
}

function scalePointAbout(point: Point2D, center: Point2D, scale: number): Point2D {
  return {
    x: center.x + (point.x - center.x) * scale,
    y: center.y + (point.y - center.y) * scale,
  };
}

function blendQuads(
  start: [Point2D, Point2D, Point2D, Point2D],
  end: [Point2D, Point2D, Point2D, Point2D],
  amount: number,
): [Point2D, Point2D, Point2D, Point2D] {
  const t = clamp(amount, 0, 1);
  return start.map((point, index) => ({
    x: lerp(point.x, end[index].x, t),
    y: lerp(point.y, end[index].y, t),
  })) as [Point2D, Point2D, Point2D, Point2D];
}

function correctQuadToGuideFrame(actual: PosterQuad, guide: PosterQuad): PosterQuad {
  // The tall lyric engine treats the guide as the source of truth. Keep this
  // function explicit so later tuning can add real bounds checks without
  // reintroducing the old 16:9/tall blending path.
  const deltaY = getQuadDelta(actual, guide).some((point) => Math.abs(point.y) > 0.5);
  const deltaX = getQuadDelta(actual, guide).some((point) => Math.abs(point.x) > 0.5);
  return deltaX || deltaY ? guide.map((point) => ({ ...point })) as PosterQuad : actual;
}

function getQuadDelta(actual: PosterQuad, guide: PosterQuad): PosterQuad {
  return actual.map((point, index) => ({
    x: point.x - guide[index].x,
    y: point.y - guide[index].y,
  })) as PosterQuad;
}

function formatPoint(point: Point2D): string {
  return `${Math.round(point.x)}, ${Math.round(point.y)}`;
}

function formatQuad(quad: PosterQuad): string {
  return [
    `TL ${formatPoint(quad[0])}`,
    `TR ${formatPoint(quad[1])}`,
    `BR ${formatPoint(quad[2])}`,
    `BL ${formatPoint(quad[3])}`,
  ].join(" | ");
}

function updateLyricGeometryMonitor(
  layout: CeilingPosterLayout | null,
  trapezoid: LyricPosterTrapezoid | null,
  controls: CeilingPosterControls | null,
): void {
  const monitor = document.querySelector<HTMLElement>("#lyricGeometryMonitor");
  if (!monitor) return;

  if (!layout || !trapezoid || !controls) {
    monitor.textContent = "No active lyric geometry yet.";
    return;
  }

  const mainQuad: PosterQuad = [
    { x: trapezoid.topLeftX, y: trapezoid.topLeftY },
    { x: trapezoid.topRightX, y: trapezoid.topRightY },
    { x: trapezoid.bottomRightX, y: trapezoid.bottomRightY },
    { x: trapezoid.bottomLeftX, y: trapezoid.bottomLeftY },
  ];

  const lines = [
    `Lyric mode: ${layout.lyricMode}`,
    `Placement engine: ${layout.geometryMode}`,
    `Reveal ratio: ${controls.tallRevealRatio.toFixed(4)}`,
    `Main guide: ${formatQuad(mainQuad)}`,
  ];

  layout.rows.forEach((row, index) => {
    const deltas = getQuadDelta(row.actualQuad, row.guideQuad);
    const maxDelta = Math.max(...deltas.map((point) => Math.max(Math.abs(point.x), Math.abs(point.y))));
    lines.push("");
    lines.push(`Row ${index + 1}: ${row.text}`);
    lines.push(`Guide:  ${formatQuad(row.guideQuad)}`);
    lines.push(`Actual: ${formatQuad(row.actualQuad)}`);
    lines.push(`Delta:  ${formatQuad(deltas)} | max ${maxDelta.toFixed(2)}`);
  });

  monitor.textContent = lines.join("\n");
}

function isQuadInsideTrapezoid(points: Point2D[], trapezoid: LyricPosterTrapezoid): boolean {
  return points.every((point) => isPointInsideTrapezoid(point, trapezoid));
}

function isPointInsideTrapezoid(point: Point2D, trapezoid: LyricPosterTrapezoid): boolean {
  const topY = Math.min(trapezoid.topLeftY, trapezoid.topRightY);
  const bottomY = Math.max(trapezoid.bottomLeftY, trapezoid.bottomRightY);
  if (point.y < topY || point.y > bottomY) return false;
  const bounds = trapezoidHorizontalBoundsAtY(trapezoid, point.y);
  return point.x >= bounds.left && point.x <= bounds.right;
}

function quadToCssMatrix3d(
  sourceWidth: number,
  sourceHeight: number,
  topLeft: Point2D,
  topRight: Point2D,
  bottomRight: Point2D,
  bottomLeft: Point2D,
): string {
  const x0 = topLeft.x;
  const y0 = topLeft.y;
  const x1 = topRight.x;
  const y1 = topRight.y;
  const x2 = bottomRight.x;
  const y2 = bottomRight.y;
  const x3 = bottomLeft.x;
  const y3 = bottomLeft.y;

  const dx1 = x1 - x2;
  const dy1 = y1 - y2;
  const dx2 = x3 - x2;
  const dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;
  const denominator = dx1 * dy2 - dx2 * dy1;

  let a: number;
  let b: number;
  let c: number;
  let d: number;
  let e: number;
  let f: number;
  let g: number;
  let h: number;

  if (Math.abs(denominator) < 0.0001) {
    a = x1 - x0;
    b = y1 - y0;
    c = x3 - x0;
    d = y3 - y0;
    e = x0;
    f = y0;
    g = 0;
    h = 0;
  } else {
    g = (sx * dy2 - dx2 * sy) / denominator;
    h = (dx1 * sy - sx * dy1) / denominator;
    a = x1 - x0 + g * x1;
    b = y1 - y0 + g * y1;
    c = x3 - x0 + h * x3;
    d = y3 - y0 + h * y3;
    e = x0;
    f = y0;
  }

  const m11 = a / sourceWidth;
  const m12 = b / sourceWidth;
  const m14 = g / sourceWidth;
  const m21 = c / sourceHeight;
  const m22 = d / sourceHeight;
  const m24 = h / sourceHeight;

  return `matrix3d(${formatMatrixNumber(m11)}, ${formatMatrixNumber(m12)}, 0, ${formatMatrixNumber(m14)}, ${formatMatrixNumber(m21)}, ${formatMatrixNumber(m22)}, 0, ${formatMatrixNumber(m24)}, 0, 0, 1, 0, ${formatMatrixNumber(e)}, ${formatMatrixNumber(f)}, 0, 1)`;
}

function formatMatrixNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(8).replace(/\.?0+$/, "") : "0";
}

function addPoint(point: Point2D, x: number, y: number): Point2D {
  return { x: point.x + x, y: point.y + y };
}

function constrainPointToTrapezoid(point: Point2D, trapezoid: LyricPosterTrapezoid): Point2D {
  const topY = Math.min(trapezoid.topLeftY, trapezoid.topRightY);
  const bottomY = Math.max(trapezoid.bottomLeftY, trapezoid.bottomRightY);
  const y = clamp(point.y, topY, bottomY);
  const bounds = trapezoidHorizontalBoundsAtY(trapezoid, y);
  return {
    x: clamp(point.x, bounds.left, bounds.right),
    y,
  };
}

function choosePosterRowCount(words: string[], breakpoint: number): 1 | 2 {
  const lyricText = words.join(" ");
  const safeBreakpoint = Math.max(10, Math.min(80, Math.round(breakpoint || 28)));
  if (lyricText.length >= safeBreakpoint) return 2;
  return 1;
}

function normalizePosterWords(text: string): string[] {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function balanceWordsIntoRows(words: string[], rowCount: number): string[] {
  if (rowCount <= 1 || words.length <= 1) return [words.join(" ")];

  const rows: string[][] = Array.from({ length: rowCount }, () => []);
  const totalWeight = words.reduce((sum, word) => sum + weightedPosterLength(word), 0);
  const targetWeight = totalWeight / rowCount;
  let rowIndex = 0;
  let currentWeight = 0;

  words.forEach((word, index) => {
    const weight = weightedPosterLength(word);
    const remainingWords = words.length - index;
    const remainingRows = rowCount - rowIndex;

    if (
      rowIndex < rowCount - 1 &&
      rows[rowIndex].length > 0 &&
      currentWeight + weight > targetWeight * 1.10 &&
      remainingWords >= remainingRows
    ) {
      rowIndex += 1;
      currentWeight = 0;
    }

    rows[rowIndex].push(word);
    currentWeight += weight;
  });

  for (let i = 0; i < rows.length - 1; i += 1) {
    while (rows[i].length > 1 && rows[i + 1].length === 0) {
      rows[i + 1].unshift(rows[i].pop() as string);
    }
  }

  return rows.map((row) => row.join(" ")).filter(Boolean);
}

function weightedPosterLength(word: string): number {
  return Array.from(word).reduce((sum, char) => {
    if ("MW@#%&".includes(char)) return sum + 1.55;
    if ("ilI!|'".includes(char)) return sum + 0.46;
    if (".,:;".includes(char)) return sum + 0.28;
    return sum + 1;
  }, 0);
}

function getCeilingSideTiltDegrees(trapezoid: LyricPosterTrapezoid): number {
  const leftDy = trapezoid.bottomLeftY - trapezoid.topLeftY;
  const rightDy = trapezoid.bottomRightY - trapezoid.topRightY;
  const leftDx = trapezoid.bottomLeftX - trapezoid.topLeftX;
  const rightDx = trapezoid.bottomRightX - trapezoid.topRightX;
  const leftTilt = Math.atan2(leftDx, Math.max(1, Math.abs(leftDy))) * (180 / Math.PI);
  const rightTilt = Math.atan2(-rightDx, Math.max(1, Math.abs(rightDy))) * (180 / Math.PI);
  return clamp((leftTilt + rightTilt) / 2, -64, 64);
}

function trapezoidHorizontalBoundsAtY(
  trapezoid: LyricPosterTrapezoid,
  y: number,
): { left: number; right: number } {
  const leftT = normalizeInterpolation(y, trapezoid.topLeftY, trapezoid.bottomLeftY);
  const rightT = normalizeInterpolation(y, trapezoid.topRightY, trapezoid.bottomRightY);
  const left = lerp(trapezoid.topLeftX, trapezoid.bottomLeftX, leftT);
  const right = lerp(trapezoid.topRightX, trapezoid.bottomRightX, rightT);
  return left < right ? { left, right } : { left: right, right: left };
}

function normalizeInterpolation(value: number, start: number, end: number): number {
  if (Math.abs(end - start) < 0.001) return 0;
  return Math.max(0, Math.min(1, (value - start) / (end - start)));
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
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
  centerX: number;
  centerY: number;
};

type LyricPosterTransitionMode = "none" | "push-slide" | "fade-slide" | "shadow-slide" | "ceiling-stamp" | "soft-dissolve" | "ghost-drift" | "back-push";

type CeilingPosterControls = {
  maxRows: "auto" | "1" | "2" | "3";
  transition: LyricPosterTransitionMode;
  tallRevealRatio: number;
  rowBreakpoint: number;
  twoRowBandGuideOpacity: number;
  threeRowBandGuideOpacity: number;
  shortGuideOpacity: number;
  shortTopLeftX: number;
  shortTopLeftY: number;
  shortTopRightX: number;
  shortTopRightY: number;
  shortBottomLeftX: number;
  shortBottomLeftY: number;
  shortBottomRightX: number;
  shortBottomRightY: number;
  shortVerticalStretch: number;
  shortPerspective: number;
  shortTilt: number;
  shortTextTopLeftX: number;
  shortTextTopLeftY: number;
  shortTextTopRightX: number;
  shortTextTopRightY: number;
  shortTextBottomLeftX: number;
  shortTextBottomLeftY: number;
  shortTextBottomRightX: number;
  shortTextBottomRightY: number;
  twoRowTopBandTopY: number;
  twoRowTopBandBottomY: number;
  twoRowBottomBandTopY: number;
  twoRowBottomBandBottomY: number;
  threeRowTopBandTopY: number;
  threeRowTopBandBottomY: number;
  threeRowMiddleBandTopY: number;
  threeRowMiddleBandBottomY: number;
  threeRowBottomBandTopY: number;
  threeRowBottomBandBottomY: number;
  oneRowVerticalStretch: number;
  oneRowTightness: number;
  oneRowPerspective: number;
  oneRowTilt: number;
  oneRowTextTopLeftX: number;
  oneRowTextTopLeftY: number;
  oneRowTextTopRightX: number;
  oneRowTextTopRightY: number;
  oneRowTextBottomLeftX: number;
  oneRowTextBottomLeftY: number;
  oneRowTextBottomRightX: number;
  oneRowTextBottomRightY: number;
  twoRowVerticalStretch: number;
  twoRowTopY: number;
  twoRowBottomY: number;
  twoRowTightness: number;
  twoRowPerspective: number;
  twoRowTilt: number;
  threeRowVerticalStretch: number;
  threeRowTopY: number;
  threeRowMiddleY: number;
  threeRowBottomY: number;
  threeRowTightness: number;
  threeRowPerspective: number;
  threeRowTilt: number;
  twoRowTopTextTopLeftX: number;
  twoRowTopTextTopLeftY: number;
  twoRowTopTextTopRightX: number;
  twoRowTopTextTopRightY: number;
  twoRowTopTextBottomLeftX: number;
  twoRowTopTextBottomLeftY: number;
  twoRowTopTextBottomRightX: number;
  twoRowTopTextBottomRightY: number;
  twoRowBottomTextTopLeftX: number;
  twoRowBottomTextTopLeftY: number;
  twoRowBottomTextTopRightX: number;
  twoRowBottomTextTopRightY: number;
  twoRowBottomTextBottomLeftX: number;
  twoRowBottomTextBottomLeftY: number;
  twoRowBottomTextBottomRightX: number;
  twoRowBottomTextBottomRightY: number;
  threeRowTopTextTopLeftX: number;
  threeRowTopTextTopLeftY: number;
  threeRowTopTextTopRightX: number;
  threeRowTopTextTopRightY: number;
  threeRowTopTextBottomLeftX: number;
  threeRowTopTextBottomLeftY: number;
  threeRowTopTextBottomRightX: number;
  threeRowTopTextBottomRightY: number;
  threeRowMiddleTextTopLeftX: number;
  threeRowMiddleTextTopLeftY: number;
  threeRowMiddleTextTopRightX: number;
  threeRowMiddleTextTopRightY: number;
  threeRowMiddleTextBottomLeftX: number;
  threeRowMiddleTextBottomLeftY: number;
  threeRowMiddleTextBottomRightX: number;
  threeRowMiddleTextBottomRightY: number;
  threeRowBottomTextTopLeftX: number;
  threeRowBottomTextTopLeftY: number;
  threeRowBottomTextTopRightX: number;
  threeRowBottomTextTopRightY: number;
  threeRowBottomTextBottomLeftX: number;
  threeRowBottomTextBottomLeftY: number;
  threeRowBottomTextBottomRightX: number;
  threeRowBottomTextBottomRightY: number;
};

type PosterRowProfile = {
  verticalStretch: number;
  tightness: number;
  perspective: number;
  tilt: number;
};


type RowProjectionOffsets = {
  topLeftX: number;
  topLeftY: number;
  topRightX: number;
  topRightY: number;
  bottomLeftX: number;
  bottomLeftY: number;
  bottomRightX: number;
  bottomRightY: number;
};

type CeilingPosterLayout = {
  rows: LyricPosterSvgRowLayout[];
  centerX: number;
  centerY: number;
  rowBands: LyricPosterTrapezoid[];
  geometryMode: "legacy-16x9" | "tall";
  lyricMode: "short" | "1-row" | "2-row";
};

type LyricPosterSvgRowLayout = {
  text: string;
  sourceWidth: number;
  sourceHeight: number;
  sourceFontSize: number;
  sourceTextLength: number;
  sourceTextY: number;
  matrix3d: string;
  guideQuad: PosterQuad;
  actualQuad: PosterQuad;
};

type Point2D = {
  x: number;
  y: number;
};

type PosterQuad = [Point2D, Point2D, Point2D, Point2D];

export function updateLyricsToggleUi(status: LyricsPayload["status"], enabled: boolean): void {
  const toggle = qs<HTMLButtonElement>("#lyricsToggle");

  const hasLyrics = enabled && status === "found";
  const isSearching = enabled && status === "loading";
  const isMissing = enabled && (status === "not-found" || status === "instrumental" || status === "error");
  const isUnknown = enabled && status === "idle";

  toggle.classList.toggle("lyrics-toggle-on", enabled);
  toggle.classList.toggle("lyrics-toggle-off", !enabled);
  toggle.classList.toggle("lyrics-toggle-found", hasLyrics);
  toggle.classList.toggle("lyrics-toggle-missing", isMissing);
  toggle.classList.toggle("lyrics-toggle-searching", isSearching);
  toggle.classList.toggle("lyrics-toggle-unknown", isUnknown);

  toggle.dataset.state = !enabled
    ? "off"
    : hasLyrics
      ? "found"
      : isSearching
        ? "searching"
        : isMissing
          ? "missing"
          : isUnknown
            ? "unknown"
            : "on";

  toggle.textContent = "LYRICS";
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
