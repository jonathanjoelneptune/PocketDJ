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
        <div id="sessionAlbumFrameOverlay" class="session-album-frame-overlay" aria-hidden="true"></div>
        <canvas id="sessionAlbumWarpCanvas" class="session-album-warp-canvas" width="1764" height="992" aria-hidden="true"></canvas>
        <svg id="sessionAlbumGuideOverlay" class="session-album-guide-overlay" viewBox="0 0 1764 992" preserveAspectRatio="none" aria-hidden="true"></svg>

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

          <div class="button-grid dev-button-grid">
            <button id="demoButton" class="secondary" type="button">Demo Mode</button>
            <button id="debugButton" class="secondary" type="button">Debug</button>
          </div>

          <input id="clientIdInput" type="hidden" value="${escapeHtml(state.spotifyClientId || "37da51db24384ad3a07c222f71b1525e")}" />

          <details class="session-wall-albums-controls">
            <summary>Session Wall Albums</summary>
            <p class="utility-help">Define 16:9 room-space album slots. These are future wall positions where played album covers will land.</p>
            <div class="button-grid dev-button-grid">
              <button id="sessionAlbumAddSlot" class="secondary" type="button">Add Session Album Slot</button>
              <button id="sessionAlbumDuplicateAToB" class="secondary" type="button">Duplicate A to B</button>
            </div>
            <div class="session-album-group-move">
              <label>Group prefix
                <input id="sessionAlbumGroupPrefix" class="text-input" type="text" value="B" />
              </label>
              <label>Move X
                <input id="sessionAlbumGroupMoveX" class="text-input" type="number" step="1" value="0" />
              </label>
              <label>Move Y
                <input id="sessionAlbumGroupMoveY" class="text-input" type="number" step="1" value="0" />
              </label>
              <button id="sessionAlbumApplyGroupMove" class="secondary" type="button">Move Group</button>
            </div>
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
            <label class="session-album-pixel-control">Album pixel effect <span id="sessionAlbumPixelAmountValue">0.25</span>
              <input id="sessionAlbumPixelAmount" type="range" min="0" max="1" step="0.01" value="0.25" />
            </label>
            <label class="session-album-pixel-control">Album warm blend <span id="sessionAlbumWarmBlendValue">0.54</span>
              <input id="sessionAlbumWarmBlend" type="range" min="0" max="1" step="0.01" value="0.54" />
            </label>
            <div class="button-grid dev-button-grid">
              <button id="sessionAlbumCopyExport" class="secondary" type="button">Copy Slot JSON</button>
            </div>
            <textarea id="sessionAlbumExportText" class="session-album-export-text" rows="8" readonly></textarea>
            <div id="sessionAlbumTargetStatus" class="session-album-target-status">No corner target selected.</div>
            <div id="sessionAlbumSlotPanels" class="session-album-slot-panels"></div>
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

          <div class="lyrics-boundary-utility">
            <div class="utility-subhead">Ceiling lyric poster utility</div>
            <p class="utility-help">Single active lyric poster system. Old karaoke, past/future, background-box, and deprecated lyric block systems have been removed.</p>

            <div class="lyric-utility-stack">
              <div class="utility-minihead">Ceiling boundary</div>
              <label>Corner guide opacity <span id="lyricPosterGuideOpacityValue">0.00</span>
                <input id="lyricPosterGuideOpacity" type="range" min="0" max="1" step="0.01" value="0.00" />
              </label>
              <label>Center guide opacity <span id="lyricPosterCenterGuideOpacityValue">0.00</span>
                <input id="lyricPosterCenterGuideOpacity" type="range" min="0" max="1" step="0.01" value="0.00" />
              </label>
              <label>2-row band guide opacity <span id="lyricPosterTwoRowBandGuideOpacityValue">0.00</span>
                <input id="lyricPosterTwoRowBandGuideOpacity" type="range" min="0" max="1" step="0.01" value="0" />
              </label>
              <label>3-row band guide opacity <span id="lyricPosterThreeRowBandGuideOpacityValue">0.00</span>
                <input id="lyricPosterThreeRowBandGuideOpacity" type="range" min="0" max="1" step="0.01" value="0" />
              </label>
              <label>Top left X px <span id="lyricPosterTopLeftXValue">221</span>
                <input id="lyricPosterTopLeftX" type="range" min="0" max="1764" step="1" value="221" />
              </label>
              <label>Top left Y px <span id="lyricPosterTopLeftYValue">18</span>
                <input id="lyricPosterTopLeftY" type="range" min="0" max="529" step="1" value="18" />
              </label>
              <label>Top right X px <span id="lyricPosterTopRightXValue">1562</span>
                <input id="lyricPosterTopRightX" type="range" min="0" max="1764" step="1" value="1562" />
              </label>
              <label>Top right Y px <span id="lyricPosterTopRightYValue">3</span>
                <input id="lyricPosterTopRightY" type="range" min="0" max="529" step="1" value="3" />
              </label>
              <label>Bottom left X px <span id="lyricPosterBottomLeftXValue">454</span>
                <input id="lyricPosterBottomLeftX" type="range" min="0" max="1764" step="1" value="454" />
              </label>
              <label>Bottom left Y px <span id="lyricPosterBottomLeftYValue">195</span>
                <input id="lyricPosterBottomLeftY" type="range" min="0" max="529" step="1" value="195" />
              </label>
              <label>Bottom right X px <span id="lyricPosterBottomRightXValue">1343</span>
                <input id="lyricPosterBottomRightX" type="range" min="0" max="1764" step="1" value="1343" />
              </label>
              <label>Bottom right Y px <span id="lyricPosterBottomRightYValue">189</span>
                <input id="lyricPosterBottomRightY" type="range" min="0" max="529" step="1" value="189" />
              </label>

              <div class="utility-minihead">Short lyric profile (&le; 6 chars)</div>
              <p class="utility-help">Use this for tiny lyrics like "OH" so they can have their own safe area and WordArt skew.</p>
              <label>Short guide opacity <span id="lyricPosterShortGuideOpacityValue">0.00</span>
                <input id="lyricPosterShortGuideOpacity" type="range" min="0" max="1" step="0.01" value="0.00" />
              </label>
              <label>Short top left X px <span id="lyricPosterShortTopLeftXValue">221</span>
                <input id="lyricPosterShortTopLeftX" type="range" min="-400" max="2200" step="1" value="221" />
              </label>
              <label>Short top left Y px <span id="lyricPosterShortTopLeftYValue">18</span>
                <input id="lyricPosterShortTopLeftY" type="range" min="-300" max="900" step="1" value="18" />
              </label>
              <label>Short top right X px <span id="lyricPosterShortTopRightXValue">1460</span>
                <input id="lyricPosterShortTopRightX" type="range" min="-400" max="2600" step="1" value="1460" />
              </label>
              <label>Short top right Y px <span id="lyricPosterShortTopRightYValue">3</span>
                <input id="lyricPosterShortTopRightY" type="range" min="-300" max="900" step="1" value="3" />
              </label>
              <label>Short bottom left X px <span id="lyricPosterShortBottomLeftXValue">454</span>
                <input id="lyricPosterShortBottomLeftX" type="range" min="-400" max="2200" step="1" value="454" />
              </label>
              <label>Short bottom left Y px <span id="lyricPosterShortBottomLeftYValue">195</span>
                <input id="lyricPosterShortBottomLeftY" type="range" min="-300" max="900" step="1" value="195" />
              </label>
              <label>Short bottom right X px <span id="lyricPosterShortBottomRightXValue">1343</span>
                <input id="lyricPosterShortBottomRightX" type="range" min="-400" max="2600" step="1" value="1343" />
              </label>
              <label>Short bottom right Y px <span id="lyricPosterShortBottomRightYValue">189</span>
                <input id="lyricPosterShortBottomRightY" type="range" min="-300" max="900" step="1" value="189" />
              </label>
              <label>Short vertical stretch <span id="lyricPosterShortVerticalStretchValue">0.78</span>
                <input id="lyricPosterShortVerticalStretch" type="range" min="0.1" max="3" step="0.01" value="0.78" />
              </label>
              <label>Short perspective amount <span id="lyricPosterShortPerspectiveValue">1.20</span>
                <input id="lyricPosterShortPerspective" type="range" min="-4" max="4" step="0.01" value="1.20" />
              </label>
              <label>Short letter tilt bias deg <span id="lyricPosterShortTiltValue">-26</span>
                <input id="lyricPosterShortTilt" type="range" min="-85" max="85" step="1" value="-26" />
              </label>
              <label>Short top-left X offset px <span id="lyricPosterShortTextTopLeftXValue">-160</span>
                <input id="lyricPosterShortTextTopLeftX" type="range" min="-900" max="900" step="1" value="-160" />
              </label>
              <label>Short top-left Y offset px <span id="lyricPosterShortTextTopLeftYValue">0</span>
                <input id="lyricPosterShortTextTopLeftY" type="range" min="-500" max="500" step="1" value="0" />
              </label>
              <label>Short top-right X offset px <span id="lyricPosterShortTextTopRightXValue">160</span>
                <input id="lyricPosterShortTextTopRightX" type="range" min="-900" max="900" step="1" value="160" />
              </label>
              <label>Short top-right Y offset px <span id="lyricPosterShortTextTopRightYValue">0</span>
                <input id="lyricPosterShortTextTopRightY" type="range" min="-500" max="500" step="1" value="0" />
              </label>
              <label>Short bottom-left X offset px <span id="lyricPosterShortTextBottomLeftXValue">0</span>
                <input id="lyricPosterShortTextBottomLeftX" type="range" min="-900" max="900" step="1" value="0" />
              </label>
              <label>Short bottom-left Y offset px <span id="lyricPosterShortTextBottomLeftYValue">0</span>
                <input id="lyricPosterShortTextBottomLeftY" type="range" min="-500" max="500" step="1" value="0" />
              </label>
              <label>Short bottom-right X offset px <span id="lyricPosterShortTextBottomRightXValue">0</span>
                <input id="lyricPosterShortTextBottomRightX" type="range" min="-900" max="900" step="1" value="0" />
              </label>
              <label>Short bottom-right Y offset px <span id="lyricPosterShortTextBottomRightYValue">0</span>
                <input id="lyricPosterShortTextBottomRightY" type="range" min="-500" max="500" step="1" value="0" />
              </label>

              <div class="utility-minihead">Poster style and fit</div>
              <label>Stroke px <span id="lyricPosterStrokeValue">7.6</span>
                <input id="lyricPosterStroke" type="range" min="0.5" max="8" step="0.1" value="7.6" />
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
              <label>Fill opacity <span id="lyricPosterFillOpacityValue">0.35</span>
                <input id="lyricPosterFillOpacity" type="range" min="0" max="1" step="0.01" value="0.70" />
              </label>
              <label>Glow strength <span id="lyricPosterGlowValue">0</span>
                <input id="lyricPosterGlow" type="range" min="0" max="1" step="0.01" value="0" />
              </label>
              <div class="utility-minihead">Ceiling lyric effects</div>
              <label class="utility-checkbox">
                <input id="lyricPosterEffectDropShadow" type="checkbox" />
                Drop shadow
              </label>
              <label class="utility-checkbox">
                <input id="lyricPosterEffectEmboss" type="checkbox" />
                Emboss
              </label>
              <label class="utility-checkbox">
                <input id="lyricPosterEffectInsetEmboss" type="checkbox" checked />
                Inset emboss
              </label>
              <label class="utility-checkbox">
                <input id="lyricPosterEffectBevel" type="checkbox" />
                Bevel
              </label>
              <label class="utility-checkbox">
                <input id="lyricPosterEffectSoftBlur" type="checkbox" />
                Soft blur
              </label>

              <div class="utility-minihead">1-row WordArt profile</div>
              <label>1-row vertical stretch <span id="lyricPosterOneRowVerticalStretchValue">0.86</span>
                <input id="lyricPosterOneRowVerticalStretch" type="range" min="0.40" max="3.00" step="0.01" value="0.86" />
              </label>
              <label>1-row row tightness <span id="lyricPosterOneRowTightnessValue">0.0</span>
                <input id="lyricPosterOneRowTightness" type="range" min="-2.20" max="1.20" step="0.01" value="0.0" />
              </label>
              <label>1-row perspective amount <span id="lyricPosterOneRowPerspectiveValue">1.33</span>
                <input id="lyricPosterOneRowPerspective" type="range" min="0.00" max="3.00" step="0.01" value="1.33" />
              </label>
              <label>1-row letter tilt bias deg <span id="lyricPosterOneRowTiltValue">-32</span>
                <input id="lyricPosterOneRowTilt" type="range" min="-75" max="75" step="1" value="-32" />
              </label>

              <div class="utility-minihead">1-row projection corner offsets</div>
              <p class="utility-help">These distort only the forced/auto 1-row lyric projection. Use them like draggable WordArt corners.</p>
              <label>1-row top-left X offset px <span id="lyricPosterOneRowTextTopLeftXValue">-242</span>
                <input id="lyricPosterOneRowTextTopLeftX" type="range" min="-450" max="450" step="1" value="-242" />
              </label>
              <label>1-row top-left Y offset px <span id="lyricPosterOneRowTextTopLeftYValue">0</span>
                <input id="lyricPosterOneRowTextTopLeftY" type="range" min="-180" max="180" step="1" value="0" />
              </label>
              <label>1-row top-right X offset px <span id="lyricPosterOneRowTextTopRightXValue">242</span>
                <input id="lyricPosterOneRowTextTopRightX" type="range" min="-450" max="450" step="1" value="242" />
              </label>
              <label>1-row top-right Y offset px <span id="lyricPosterOneRowTextTopRightYValue">0</span>
                <input id="lyricPosterOneRowTextTopRightY" type="range" min="-180" max="180" step="1" value="0" />
              </label>
              <label>1-row bottom-left X offset px <span id="lyricPosterOneRowTextBottomLeftXValue">6</span>
                <input id="lyricPosterOneRowTextBottomLeftX" type="range" min="-450" max="450" step="1" value="6" />
              </label>
              <label>1-row bottom-left Y offset px <span id="lyricPosterOneRowTextBottomLeftYValue">-1</span>
                <input id="lyricPosterOneRowTextBottomLeftY" type="range" min="-180" max="180" step="1" value="-1" />
              </label>
              <label>1-row bottom-right X offset px <span id="lyricPosterOneRowTextBottomRightXValue">0</span>
                <input id="lyricPosterOneRowTextBottomRightX" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>1-row bottom-right Y offset px <span id="lyricPosterOneRowTextBottomRightYValue">0</span>
                <input id="lyricPosterOneRowTextBottomRightY" type="range" min="-180" max="180" step="1" value="0" />
              </label>

              <div class="utility-minihead">2-row WordArt profile</div>
              <label>2-row vertical stretch <span id="lyricPosterTwoRowVerticalStretchValue">0.93</span>
                <input id="lyricPosterTwoRowVerticalStretch" type="range" min="0.40" max="3.00" step="0.01" value="0.93" />
              </label>
              <div class="utility-minihead">2-row band trapezoids</div>
              <p class="utility-help">These split the full ceiling trapezoid into separate physical ceiling zones before corner warping.</p>
              <label>2-row top band top Y px <span id="lyricPosterTwoRowTopBandTopYValue">18</span>
                <input id="lyricPosterTwoRowTopBandTopY" type="range" min="0" max="529" step="1" value="18" />
              </label>
              <label>2-row top band bottom Y px <span id="lyricPosterTwoRowTopBandBottomYValue">106</span>
                <input id="lyricPosterTwoRowTopBandBottomY" type="range" min="0" max="529" step="1" value="106" />
              </label>
              <label>2-row bottom band top Y px <span id="lyricPosterTwoRowBottomBandTopYValue">106</span>
                <input id="lyricPosterTwoRowBottomBandTopY" type="range" min="0" max="529" step="1" value="106" />
              </label>
              <label>2-row bottom band bottom Y px <span id="lyricPosterTwoRowBottomBandBottomYValue">195</span>
                <input id="lyricPosterTwoRowBottomBandBottomY" type="range" min="0" max="529" step="1" value="195" />
              </label>
              <label>2-row top row vertical placement px <span id="lyricPosterTwoRowTopYValue">0</span>
                <input id="lyricPosterTwoRowTopY" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>2-row bottom row vertical placement px <span id="lyricPosterTwoRowBottomYValue">0</span>
                <input id="lyricPosterTwoRowBottomY" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>2-row row tightness <span id="lyricPosterTwoRowTightnessValue">0.45</span>
                <input id="lyricPosterTwoRowTightness" type="range" min="-2.20" max="1.20" step="0.01" value="0.45" />
              </label>
              <label>2-row perspective amount <span id="lyricPosterTwoRowPerspectiveValue">1.00</span>
                <input id="lyricPosterTwoRowPerspective" type="range" min="0.00" max="3.00" step="0.01" value="1.00" />
              </label>
              <label>2-row letter tilt bias deg <span id="lyricPosterTwoRowTiltValue">-10</span>
                <input id="lyricPosterTwoRowTilt" type="range" min="-75" max="75" step="1" value="-10" />
              </label>

              <div class="utility-minihead">3-row WordArt profile</div>
              <label>3-row vertical stretch <span id="lyricPosterThreeRowVerticalStretchValue">0.51</span>
                <input id="lyricPosterThreeRowVerticalStretch" type="range" min="0.40" max="3.00" step="0.01" value="0.51" />
              </label>
              <div class="utility-minihead">3-row band trapezoids</div>
              <p class="utility-help">Each row gets its own mini-trapezoid band before the row corner offsets are applied.</p>
              <label>3-row top band top Y px <span id="lyricPosterThreeRowTopBandTopYValue">18</span>
                <input id="lyricPosterThreeRowTopBandTopY" type="range" min="0" max="529" step="1" value="18" />
              </label>
              <label>3-row top band bottom Y px <span id="lyricPosterThreeRowTopBandBottomYValue">76</span>
                <input id="lyricPosterThreeRowTopBandBottomY" type="range" min="0" max="529" step="1" value="76" />
              </label>
              <label>3-row middle band top Y px <span id="lyricPosterThreeRowMiddleBandTopYValue">76</span>
                <input id="lyricPosterThreeRowMiddleBandTopY" type="range" min="0" max="529" step="1" value="76" />
              </label>
              <label>3-row middle band bottom Y px <span id="lyricPosterThreeRowMiddleBandBottomYValue">136</span>
                <input id="lyricPosterThreeRowMiddleBandBottomY" type="range" min="0" max="529" step="1" value="136" />
              </label>
              <label>3-row bottom band top Y px <span id="lyricPosterThreeRowBottomBandTopYValue">136</span>
                <input id="lyricPosterThreeRowBottomBandTopY" type="range" min="0" max="529" step="1" value="136" />
              </label>
              <label>3-row bottom band bottom Y px <span id="lyricPosterThreeRowBottomBandBottomYValue">195</span>
                <input id="lyricPosterThreeRowBottomBandBottomY" type="range" min="0" max="529" step="1" value="195" />
              </label>
              <label>3-row top row vertical placement px <span id="lyricPosterThreeRowTopYValue">0</span>
                <input id="lyricPosterThreeRowTopY" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>3-row middle row vertical placement px <span id="lyricPosterThreeRowMiddleYValue">0</span>
                <input id="lyricPosterThreeRowMiddleY" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>3-row bottom row vertical placement px <span id="lyricPosterThreeRowBottomYValue">0</span>
                <input id="lyricPosterThreeRowBottomY" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>3-row row tightness <span id="lyricPosterThreeRowTightnessValue">0.52</span>
                <input id="lyricPosterThreeRowTightness" type="range" min="-2.20" max="1.20" step="0.01" value="0.52" />
              </label>
              <label>3-row perspective amount <span id="lyricPosterThreeRowPerspectiveValue">1.00</span>
                <input id="lyricPosterThreeRowPerspective" type="range" min="0.00" max="3.00" step="0.01" value="1.00" />
              </label>
              <label>3-row letter tilt bias deg <span id="lyricPosterThreeRowTiltValue">-12</span>
                <input id="lyricPosterThreeRowTilt" type="range" min="-75" max="75" step="1" value="-12" />
              </label>

              <div class="utility-minihead">2-row top projection corner offsets</div>
              <label>2-row top top-left X offset px <span id="lyricPosterTwoRowTopTextTopLeftXValue">0</span>
                <input id="lyricPosterTwoRowTopTextTopLeftX" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>2-row top top-left Y offset px <span id="lyricPosterTwoRowTopTextTopLeftYValue">0</span>
                <input id="lyricPosterTwoRowTopTextTopLeftY" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>2-row top top-right X offset px <span id="lyricPosterTwoRowTopTextTopRightXValue">0</span>
                <input id="lyricPosterTwoRowTopTextTopRightX" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>2-row top top-right Y offset px <span id="lyricPosterTwoRowTopTextTopRightYValue">0</span>
                <input id="lyricPosterTwoRowTopTextTopRightY" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>2-row top bottom-left X offset px <span id="lyricPosterTwoRowTopTextBottomLeftXValue">0</span>
                <input id="lyricPosterTwoRowTopTextBottomLeftX" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>2-row top bottom-left Y offset px <span id="lyricPosterTwoRowTopTextBottomLeftYValue">0</span>
                <input id="lyricPosterTwoRowTopTextBottomLeftY" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>2-row top bottom-right X offset px <span id="lyricPosterTwoRowTopTextBottomRightXValue">0</span>
                <input id="lyricPosterTwoRowTopTextBottomRightX" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>2-row top bottom-right Y offset px <span id="lyricPosterTwoRowTopTextBottomRightYValue">0</span>
                <input id="lyricPosterTwoRowTopTextBottomRightY" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <div class="utility-minihead">2-row bottom projection corner offsets</div>
              <label>2-row bottom top-left X offset px <span id="lyricPosterTwoRowBottomTextTopLeftXValue">0</span>
                <input id="lyricPosterTwoRowBottomTextTopLeftX" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>2-row bottom top-left Y offset px <span id="lyricPosterTwoRowBottomTextTopLeftYValue">0</span>
                <input id="lyricPosterTwoRowBottomTextTopLeftY" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>2-row bottom top-right X offset px <span id="lyricPosterTwoRowBottomTextTopRightXValue">0</span>
                <input id="lyricPosterTwoRowBottomTextTopRightX" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>2-row bottom top-right Y offset px <span id="lyricPosterTwoRowBottomTextTopRightYValue">0</span>
                <input id="lyricPosterTwoRowBottomTextTopRightY" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>2-row bottom bottom-left X offset px <span id="lyricPosterTwoRowBottomTextBottomLeftXValue">0</span>
                <input id="lyricPosterTwoRowBottomTextBottomLeftX" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>2-row bottom bottom-left Y offset px <span id="lyricPosterTwoRowBottomTextBottomLeftYValue">0</span>
                <input id="lyricPosterTwoRowBottomTextBottomLeftY" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>2-row bottom bottom-right X offset px <span id="lyricPosterTwoRowBottomTextBottomRightXValue">0</span>
                <input id="lyricPosterTwoRowBottomTextBottomRightX" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>2-row bottom bottom-right Y offset px <span id="lyricPosterTwoRowBottomTextBottomRightYValue">0</span>
                <input id="lyricPosterTwoRowBottomTextBottomRightY" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <div class="utility-minihead">3-row top projection corner offsets</div>
              <label>3-row top top-left X offset px <span id="lyricPosterThreeRowTopTextTopLeftXValue">0</span>
                <input id="lyricPosterThreeRowTopTextTopLeftX" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>3-row top top-left Y offset px <span id="lyricPosterThreeRowTopTextTopLeftYValue">0</span>
                <input id="lyricPosterThreeRowTopTextTopLeftY" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>3-row top top-right X offset px <span id="lyricPosterThreeRowTopTextTopRightXValue">0</span>
                <input id="lyricPosterThreeRowTopTextTopRightX" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>3-row top top-right Y offset px <span id="lyricPosterThreeRowTopTextTopRightYValue">0</span>
                <input id="lyricPosterThreeRowTopTextTopRightY" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>3-row top bottom-left X offset px <span id="lyricPosterThreeRowTopTextBottomLeftXValue">0</span>
                <input id="lyricPosterThreeRowTopTextBottomLeftX" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>3-row top bottom-left Y offset px <span id="lyricPosterThreeRowTopTextBottomLeftYValue">0</span>
                <input id="lyricPosterThreeRowTopTextBottomLeftY" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>3-row top bottom-right X offset px <span id="lyricPosterThreeRowTopTextBottomRightXValue">0</span>
                <input id="lyricPosterThreeRowTopTextBottomRightX" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>3-row top bottom-right Y offset px <span id="lyricPosterThreeRowTopTextBottomRightYValue">0</span>
                <input id="lyricPosterThreeRowTopTextBottomRightY" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <div class="utility-minihead">3-row middle projection corner offsets</div>
              <label>3-row middle top-left X offset px <span id="lyricPosterThreeRowMiddleTextTopLeftXValue">0</span>
                <input id="lyricPosterThreeRowMiddleTextTopLeftX" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>3-row middle top-left Y offset px <span id="lyricPosterThreeRowMiddleTextTopLeftYValue">0</span>
                <input id="lyricPosterThreeRowMiddleTextTopLeftY" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>3-row middle top-right X offset px <span id="lyricPosterThreeRowMiddleTextTopRightXValue">0</span>
                <input id="lyricPosterThreeRowMiddleTextTopRightX" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>3-row middle top-right Y offset px <span id="lyricPosterThreeRowMiddleTextTopRightYValue">0</span>
                <input id="lyricPosterThreeRowMiddleTextTopRightY" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>3-row middle bottom-left X offset px <span id="lyricPosterThreeRowMiddleTextBottomLeftXValue">0</span>
                <input id="lyricPosterThreeRowMiddleTextBottomLeftX" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>3-row middle bottom-left Y offset px <span id="lyricPosterThreeRowMiddleTextBottomLeftYValue">0</span>
                <input id="lyricPosterThreeRowMiddleTextBottomLeftY" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>3-row middle bottom-right X offset px <span id="lyricPosterThreeRowMiddleTextBottomRightXValue">0</span>
                <input id="lyricPosterThreeRowMiddleTextBottomRightX" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>3-row middle bottom-right Y offset px <span id="lyricPosterThreeRowMiddleTextBottomRightYValue">0</span>
                <input id="lyricPosterThreeRowMiddleTextBottomRightY" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <div class="utility-minihead">3-row bottom projection corner offsets</div>
              <label>3-row bottom top-left X offset px <span id="lyricPosterThreeRowBottomTextTopLeftXValue">0</span>
                <input id="lyricPosterThreeRowBottomTextTopLeftX" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>3-row bottom top-left Y offset px <span id="lyricPosterThreeRowBottomTextTopLeftYValue">0</span>
                <input id="lyricPosterThreeRowBottomTextTopLeftY" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>3-row bottom top-right X offset px <span id="lyricPosterThreeRowBottomTextTopRightXValue">0</span>
                <input id="lyricPosterThreeRowBottomTextTopRightX" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>3-row bottom top-right Y offset px <span id="lyricPosterThreeRowBottomTextTopRightYValue">0</span>
                <input id="lyricPosterThreeRowBottomTextTopRightY" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>3-row bottom bottom-left X offset px <span id="lyricPosterThreeRowBottomTextBottomLeftXValue">0</span>
                <input id="lyricPosterThreeRowBottomTextBottomLeftX" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>3-row bottom bottom-left Y offset px <span id="lyricPosterThreeRowBottomTextBottomLeftYValue">0</span>
                <input id="lyricPosterThreeRowBottomTextBottomLeftY" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>3-row bottom bottom-right X offset px <span id="lyricPosterThreeRowBottomTextBottomRightXValue">0</span>
                <input id="lyricPosterThreeRowBottomTextBottomRightX" type="range" min="-450" max="450" step="1" value="0" />
              </label>
              <label>3-row bottom bottom-right Y offset px <span id="lyricPosterThreeRowBottomTextBottomRightYValue">0</span>
                <input id="lyricPosterThreeRowBottomTextBottomRightY" type="range" min="-450" max="450" step="1" value="0" />
              </label>

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
              <p class="utility-help">Auto mode uses 1 row below this character count and 2 rows at or above it, including spaces.</p>
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
                  y="${row.sourceHeight / 2}"
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
  const clipPolygon = `${(trapezoid.topLeftX / 1764) * 100}% ${(trapezoid.topLeftY / 529) * 100}%, ${(trapezoid.topRightX / 1764) * 100}% ${(trapezoid.topRightY / 529) * 100}%, ${(trapezoid.bottomRightX / 1764) * 100}% ${(trapezoid.bottomRightY / 529) * 100}%, ${(trapezoid.bottomLeftX / 1764) * 100}% ${(trapezoid.bottomLeftY / 529) * 100}%`;
  activeBlock.innerHTML = `
    <svg class="lyric-poster-svg lyric-poster-guide-svg" viewBox="0 0 1764 529" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <clipPath id="${clipId}" clipPathUnits="userSpaceOnUse">
          <polygon points="${trapezoid.topLeftX},${trapezoid.topLeftY} ${trapezoid.topRightX},${trapezoid.topRightY} ${trapezoid.bottomRightX},${trapezoid.bottomRightY} ${trapezoid.bottomLeftX},${trapezoid.bottomLeftY}" />
        </clipPath>
      </defs>
      <polygon
        class="lyric-poster-svg-guide"
        points="${trapezoid.topLeftX},${trapezoid.topLeftY} ${trapezoid.topRightX},${trapezoid.topRightY} ${trapezoid.bottomRightX},${trapezoid.bottomRightY} ${trapezoid.bottomLeftX},${trapezoid.bottomLeftY}"
      />
      <circle class="lyric-poster-center-guide" cx="${layout.centerX}" cy="${layout.centerY}" r="8" />
      ${renderBandGuidePolygons(layout.rowBands, layout.rows.length)}
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


function readLyricPosterTrapezoid(rootStyles: CSSStyleDeclaration): LyricPosterTrapezoid {
  const readPx = (name: string, fallback: number) => {
    const value = Number.parseFloat(rootStyles.getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  };

  const topLeftX = readPx("--lyric-poster-top-left-x", 221);
  const topLeftY = readPx("--lyric-poster-top-left-y", 12);
  const topRightX = readPx("--lyric-poster-top-right-x", 1562);
  const topRightY = readPx("--lyric-poster-top-right-y", 3);
  const bottomLeftX = readPx("--lyric-poster-bottom-left-x", 454);
  const bottomLeftY = readPx("--lyric-poster-bottom-left-y", 189);
  const bottomRightX = readPx("--lyric-poster-bottom-right-x", 1343);
  const bottomRightY = readPx("--lyric-poster-bottom-right-y", 189);

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

function readCeilingPosterControls(
  rootStyles: CSSStyleDeclaration,
  maxRowsValue: "auto" | "1" | "2" | "3",
  transitionValue: LyricPosterTransitionMode,
): CeilingPosterControls {
  const readNumber = (name: string, fallback: number) => {
    const value = Number.parseFloat(rootStyles.getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  };

  return {
    maxRows: maxRowsValue,
    transition: transitionValue,
    rowBreakpoint: readNumber("--lyric-poster-row-breakpoint", 28),
    twoRowBandGuideOpacity: readNumber("--lyric-poster-two-row-band-guide-opacity", 0),
    threeRowBandGuideOpacity: readNumber("--lyric-poster-three-row-band-guide-opacity", 0),
    shortGuideOpacity: readNumber("--lyric-poster-short-guide-opacity", 0),
    shortTopLeftX: readNumber("--lyric-poster-short-tl-x", 221),
    shortTopLeftY: readNumber("--lyric-poster-short-tl-y", 18),
    shortTopRightX: readNumber("--lyric-poster-short-tr-x", 1460),
    shortTopRightY: readNumber("--lyric-poster-short-tr-y", 3),
    shortBottomLeftX: readNumber("--lyric-poster-short-bl-x", 454),
    shortBottomLeftY: readNumber("--lyric-poster-short-bl-y", 195),
    shortBottomRightX: readNumber("--lyric-poster-short-br-x", 1343),
    shortBottomRightY: readNumber("--lyric-poster-short-br-y", 189),
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
    twoRowTopBandTopY: readNumber("--lyric-poster-two-row-top-band-top-y", 18),
    twoRowTopBandBottomY: readNumber("--lyric-poster-two-row-top-band-bottom-y", 106),
    twoRowBottomBandTopY: readNumber("--lyric-poster-two-row-bottom-band-top-y", 106),
    twoRowBottomBandBottomY: readNumber("--lyric-poster-two-row-bottom-band-bottom-y", 195),
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
    oneRowTextTopLeftX: readNumber("--lyric-poster-one-row-text-top-left-x", 0),
    oneRowTextTopLeftY: readNumber("--lyric-poster-one-row-text-top-left-y", 0),
    oneRowTextTopRightX: readNumber("--lyric-poster-one-row-text-top-right-x", 0),
    oneRowTextTopRightY: readNumber("--lyric-poster-one-row-text-top-right-y", 0),
    oneRowTextBottomLeftX: readNumber("--lyric-poster-one-row-text-bottom-left-x", 0),
    oneRowTextBottomLeftY: readNumber("--lyric-poster-one-row-text-bottom-left-y", 0),
    oneRowTextBottomRightX: readNumber("--lyric-poster-one-row-text-bottom-right-x", 0),
    oneRowTextBottomRightY: readNumber("--lyric-poster-one-row-text-bottom-right-y", 0),
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
    twoRowTopTextTopLeftX: readNumber("--lyric-poster-two-row-top-text-top-left-x", 0),
    twoRowTopTextTopLeftY: readNumber("--lyric-poster-two-row-top-text-top-left-y", 0),
    twoRowTopTextTopRightX: readNumber("--lyric-poster-two-row-top-text-top-right-x", 0),
    twoRowTopTextTopRightY: readNumber("--lyric-poster-two-row-top-text-top-right-y", 0),
    twoRowTopTextBottomLeftX: readNumber("--lyric-poster-two-row-top-text-bottom-left-x", 0),
    twoRowTopTextBottomLeftY: readNumber("--lyric-poster-two-row-top-text-bottom-left-y", 0),
    twoRowTopTextBottomRightX: readNumber("--lyric-poster-two-row-top-text-bottom-right-x", 0),
    twoRowTopTextBottomRightY: readNumber("--lyric-poster-two-row-top-text-bottom-right-y", 0),
    twoRowBottomTextTopLeftX: readNumber("--lyric-poster-two-row-bottom-text-top-left-x", 0),
    twoRowBottomTextTopLeftY: readNumber("--lyric-poster-two-row-bottom-text-top-left-y", 0),
    twoRowBottomTextTopRightX: readNumber("--lyric-poster-two-row-bottom-text-top-right-x", 0),
    twoRowBottomTextTopRightY: readNumber("--lyric-poster-two-row-bottom-text-top-right-y", 0),
    twoRowBottomTextBottomLeftX: readNumber("--lyric-poster-two-row-bottom-text-bottom-left-x", 0),
    twoRowBottomTextBottomLeftY: readNumber("--lyric-poster-two-row-bottom-text-bottom-left-y", 0),
    twoRowBottomTextBottomRightX: readNumber("--lyric-poster-two-row-bottom-text-bottom-right-x", 0),
    twoRowBottomTextBottomRightY: readNumber("--lyric-poster-two-row-bottom-text-bottom-right-y", 0),
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
  const profile = getPosterRowProfile(n, activeControls);
  const scaleX = Math.max(0.001, ceilingWidth / 1764);
  const scaleY = Math.max(0.001, ceilingHeight / 529);
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

    const cornerOffsets = getRowProjectionOffsets(n, index, controls);
    topLeft = addPoint(topLeft, cornerOffsets.topLeftX, cornerOffsets.topLeftY);
    topRight = addPoint(topRight, cornerOffsets.topRightX, cornerOffsets.topRightY);
    bottomLeft = addPoint(bottomLeft, cornerOffsets.bottomLeftX, cornerOffsets.bottomLeftY);
    bottomRight = addPoint(bottomRight, cornerOffsets.bottomRightX, cornerOffsets.bottomRightY);
    [topLeft, topRight, bottomRight, bottomLeft] = centerAndFitQuadInsideTrapezoid(
      [topLeft, topRight, bottomRight, bottomLeft],
      band,
    );

    const destination = [topLeft, topRight, bottomRight, bottomLeft].map((point) => ({
      x: point.x * scaleX,
      y: point.y * scaleY,
    }));

    const sourceWidth = 1200;
    const sourceHeight = 180;
    const sourceFontSize = sourceHeight * clamp(profile.verticalStretch, 0.40, 3.00);
    const sourceTextLength = sourceWidth * 0.965;
    const matrix3d = quadToCssMatrix3d(sourceWidth, sourceHeight, destination[0], destination[1], destination[2], destination[3]);

    return {
      text: rowText,
      sourceWidth,
      sourceHeight,
      sourceFontSize,
      sourceTextLength,
      matrix3d,
    };
  });

  return { rows, centerX: trapezoid.centerX, centerY: trapezoid.centerY, rowBands };
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
};

type LyricPosterSvgRowLayout = {
  text: string;
  sourceWidth: number;
  sourceHeight: number;
  sourceFontSize: number;
  sourceTextLength: number;
  matrix3d: string;
};

type Point2D = {
  x: number;
  y: number;
};

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
