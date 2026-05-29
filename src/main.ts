import "./styles.css";
import { DjController } from "./dj/djController";
import { getDemoTrack, stopDemo, toggleDemo } from "./demo";
import { emptyTrack, type AppState } from "./state/types";
import { addSpotifyUriToQueue, disconnectSpotify, getArtistTopTracks, getCurrentlyPlaying, getDefaultRedirectUri, getPlaylistTracks, getRecentlyPlayed, getSavedTracks, getUserPlaylists, handleSpotifyCallback, nextSpotifyTrack, pauseSpotify, playSpotify, playSpotifyContext, playSpotifyContextShuffled, playSpotifyUri, previousSpotifyTrack, searchSpotifyCatalog, seekSpotify, setSpotifyRepeat, setSpotifyShuffle, setSpotifyVolume, startSpotifyLogin, type SpotifyCatalogArtist, type SpotifyCatalogPlaylist, type SpotifyCatalogTrack } from "./spotify/spotifyClient";
import { loadClientId, loadTokens, saveClientId } from "./spotify/tokenStore";
import {
  emptyLyrics,
  fetchLyricsForTrack,
  getActiveLyricIndex,
  getLyricsTrackKey,
  type LyricsPayload,
} from "./lyrics/lyricsClient";
import { qs } from "./utils/dom";
import { renderShell, setControlPanelOpen, updateLyricsCeiling, updateLyricsToggleUi, updatePlaybackUi } from "./ui";

const STANDARD_SPOTIFY_CLIENT_ID = "37da51db24384ad3a07c222f71b1525e";

const state: AppState = {
  spotifyClientId: loadClientId() || STANDARD_SPOTIFY_CLIENT_ID,
  redirectUri: getDefaultRedirectUri(),
  playback: emptyTrack(),
  djMode: "idle",
  debugOpen: false
};

let useDemo = false;
let pollTimer: number | null = null;
let dj: DjController;
let lastPollError = "";
let panelAutoHiddenAfterConnect = false;
let sidePanelLocked = false;
let sidePanelHideTimer: number | null = null;
let floorControlsOpen = false;
let floorControlsLocked = false;
let floorControlsHideTimer: number | null = null;
let phase2ShuffleEnabled = false;
let phase2RepeatMode: "off" | "context" | "track" = "off";
let phase2Volume = 70;
let lyricsState: LyricsPayload = emptyLyrics();
let lyricsFetchKey = "";
let lyricsEnabled = true;
let lyricAnimationRevision = 0;


type SpotifyBrowserTab = "search" | "playlists" | "library";
type SpotifyBrowserSort = "recent" | "alpha" | "artist" | "album";

const SPOTIFY_PINNED_PLAYLISTS_KEY = "pocketdj-pinned-playlists-v1";
const SPOTIFY_PLAYLIST_RECENCY_KEY = "pocketdj-playlist-recency-v1";

let spotifyBrowserTab: SpotifyBrowserTab = "search";
let spotifyBrowserBusy = false;
let spotifyBrowserStatus = "";
let spotifyBrowserTracks: SpotifyCatalogTrack[] = [];
let spotifyBrowserArtists: SpotifyCatalogArtist[] = [];
let spotifyBrowserPlaylists: SpotifyCatalogPlaylist[] = [];
let currentPlaylistTracks: SpotifyCatalogTrack[] = [];
let currentLibraryTracks: SpotifyCatalogTrack[] = [];
let recentTrackIds: string[] = [];
let pinnedPlaylistIds = loadSpotifyPinnedPlaylists();
let playlistRecency = loadSpotifyPlaylistRecency();
let selectedPlaylist: SpotifyCatalogPlaylist | null = null;


type SceneFilter =
  | "none"
  | "warm-club"
  | "dreamy-blue"
  | "deep-night"
  | "retro-vhs"
  | "neon-purple"
  | "cinematic-amber"
  | "moody-lowlight";


type RoomUtilitySettings = {
  speakerLeftX: number;
  speakerRightX: number;
  speakerY: number;
  speakerScale: number;
  speakerOpacity: number;
  speakerPulse: number;
  speakerPulseX: number;
  speakerPulseY: number;
  speakerPulseSize: number;
  speakerWarpOpacity: number;
  sceneFilter: SceneFilter;
  filterStrength: number;
  vignetteStrength: number;
  shadowOpacity: number;
  tableShadowScale: number;
  floorControlsIdleOpacity: number;
  panelStartY: number;
  panelHeightAdjustEnabled: boolean;
  lyricPosterTopLeftX: number;
  lyricPosterTopLeftY: number;
  lyricPosterTopRightX: number;
  lyricPosterTopRightY: number;
  lyricPosterBottomLeftX: number;
  lyricPosterBottomLeftY: number;
  lyricPosterBottomRightX: number;
  lyricPosterBottomRightY: number;
  lyricPosterGuideOpacity: number;
  lyricPosterCenterGuideOpacity: number;
  lyricPosterShortGuideOpacity: number;
  lyricPosterShortTopLeftX: number;
  lyricPosterShortTopLeftY: number;
  lyricPosterShortTopRightX: number;
  lyricPosterShortTopRightY: number;
  lyricPosterShortBottomLeftX: number;
  lyricPosterShortBottomLeftY: number;
  lyricPosterShortBottomRightX: number;
  lyricPosterShortBottomRightY: number;
  lyricPosterShortVerticalStretch: number;
  lyricPosterShortPerspective: number;
  lyricPosterShortTilt: number;
  lyricPosterShortTextTopLeftX: number;
  lyricPosterShortTextTopLeftY: number;
  lyricPosterShortTextTopRightX: number;
  lyricPosterShortTextTopRightY: number;
  lyricPosterShortTextBottomLeftX: number;
  lyricPosterShortTextBottomLeftY: number;
  lyricPosterShortTextBottomRightX: number;
  lyricPosterShortTextBottomRightY: number;
  lyricPosterTwoRowBandGuideOpacity: number;
  lyricPosterThreeRowBandGuideOpacity: number;
  lyricPosterStroke: number;
  lyricPosterStrokeColor: string;
  lyricPosterFillColor: string;
  lyricPosterStrokeOpacity: number;
  lyricPosterFillOpacity: number;
  lyricPosterGlow: number;
  lyricPosterEffectDropShadow: boolean;
  lyricPosterEffectEmboss: boolean;
  lyricPosterEffectInsetEmboss: boolean;
  lyricPosterEffectBevel: boolean;
  lyricPosterEffectSoftBlur: boolean;
  lyricPosterOneRowVerticalStretch: number;
  lyricPosterOneRowTightness: number;
  lyricPosterOneRowPerspective: number;
  lyricPosterOneRowTilt: number;
  lyricPosterOneRowTextTopLeftX: number;
  lyricPosterOneRowTextTopLeftY: number;
  lyricPosterOneRowTextTopRightX: number;
  lyricPosterOneRowTextTopRightY: number;
  lyricPosterOneRowTextBottomLeftX: number;
  lyricPosterOneRowTextBottomLeftY: number;
  lyricPosterOneRowTextBottomRightX: number;
  lyricPosterOneRowTextBottomRightY: number;
  lyricPosterTwoRowVerticalStretch: number;
  lyricPosterTwoRowTopBandTopY: number;
  lyricPosterTwoRowTopBandBottomY: number;
  lyricPosterTwoRowBottomBandTopY: number;
  lyricPosterTwoRowBottomBandBottomY: number;
  lyricPosterTwoRowTopY: number;
  lyricPosterTwoRowBottomY: number;
  lyricPosterTwoRowTightness: number;
  lyricPosterTwoRowPerspective: number;
  lyricPosterTwoRowTilt: number;
  lyricPosterThreeRowVerticalStretch: number;
  lyricPosterThreeRowTopBandTopY: number;
  lyricPosterThreeRowTopBandBottomY: number;
  lyricPosterThreeRowMiddleBandTopY: number;
  lyricPosterThreeRowMiddleBandBottomY: number;
  lyricPosterThreeRowBottomBandTopY: number;
  lyricPosterThreeRowBottomBandBottomY: number;
  lyricPosterThreeRowTopY: number;
  lyricPosterThreeRowMiddleY: number;
  lyricPosterThreeRowBottomY: number;
  lyricPosterThreeRowTightness: number;
  lyricPosterThreeRowPerspective: number;
  lyricPosterThreeRowTilt: number;
  lyricPosterTwoRowTopTextTopLeftX: number;
  lyricPosterTwoRowTopTextTopLeftY: number;
  lyricPosterTwoRowTopTextTopRightX: number;
  lyricPosterTwoRowTopTextTopRightY: number;
  lyricPosterTwoRowTopTextBottomLeftX: number;
  lyricPosterTwoRowTopTextBottomLeftY: number;
  lyricPosterTwoRowTopTextBottomRightX: number;
  lyricPosterTwoRowTopTextBottomRightY: number;
  lyricPosterTwoRowBottomTextTopLeftX: number;
  lyricPosterTwoRowBottomTextTopLeftY: number;
  lyricPosterTwoRowBottomTextTopRightX: number;
  lyricPosterTwoRowBottomTextTopRightY: number;
  lyricPosterTwoRowBottomTextBottomLeftX: number;
  lyricPosterTwoRowBottomTextBottomLeftY: number;
  lyricPosterTwoRowBottomTextBottomRightX: number;
  lyricPosterTwoRowBottomTextBottomRightY: number;
  lyricPosterThreeRowTopTextTopLeftX: number;
  lyricPosterThreeRowTopTextTopLeftY: number;
  lyricPosterThreeRowTopTextTopRightX: number;
  lyricPosterThreeRowTopTextTopRightY: number;
  lyricPosterThreeRowTopTextBottomLeftX: number;
  lyricPosterThreeRowTopTextBottomLeftY: number;
  lyricPosterThreeRowTopTextBottomRightX: number;
  lyricPosterThreeRowTopTextBottomRightY: number;
  lyricPosterThreeRowMiddleTextTopLeftX: number;
  lyricPosterThreeRowMiddleTextTopLeftY: number;
  lyricPosterThreeRowMiddleTextTopRightX: number;
  lyricPosterThreeRowMiddleTextTopRightY: number;
  lyricPosterThreeRowMiddleTextBottomLeftX: number;
  lyricPosterThreeRowMiddleTextBottomLeftY: number;
  lyricPosterThreeRowMiddleTextBottomRightX: number;
  lyricPosterThreeRowMiddleTextBottomRightY: number;
  lyricPosterThreeRowBottomTextTopLeftX: number;
  lyricPosterThreeRowBottomTextTopLeftY: number;
  lyricPosterThreeRowBottomTextTopRightX: number;
  lyricPosterThreeRowBottomTextTopRightY: number;
  lyricPosterThreeRowBottomTextBottomLeftX: number;
  lyricPosterThreeRowBottomTextBottomLeftY: number;
  lyricPosterThreeRowBottomTextBottomRightX: number;
  lyricPosterThreeRowBottomTextBottomRightY: number;
  lyricPosterMaxRows: "auto" | "1" | "2" | "3";
  lyricPosterRowBreakpoint: number;
  lyricPosterTransition: "none" | "push-slide" | "fade-slide" | "shadow-slide" | "ceiling-stamp" | "soft-dissolve" | "ghost-drift" | "back-push";
};

const DEFAULT_ROOM_UTILITY: RoomUtilitySettings = {
  speakerLeftX: 37,
  speakerRightX: 65,
  speakerY: 71,
  speakerScale: 1.47,
  speakerOpacity: 1.00,
  speakerPulse: 1,
  speakerPulseX: 51,
  speakerPulseY: 49,
  speakerPulseSize: 55,
  speakerWarpOpacity: 1.00,
  sceneFilter: "neon-purple",
  filterStrength: 0.20,
  vignetteStrength: 0.20,
  shadowOpacity: 1.00,
  tableShadowScale: 1.16,
  floorControlsIdleOpacity: 0.15,
  panelStartY: 39,
  panelHeightAdjustEnabled: false,
  lyricPosterTopLeftX: 221,
  lyricPosterTopLeftY: 18,
  lyricPosterTopRightX: 1562,
  lyricPosterTopRightY: 3,
  lyricPosterBottomLeftX: 454,
  lyricPosterBottomLeftY: 195,
  lyricPosterBottomRightX: 1343,
  lyricPosterBottomRightY: 189,
  lyricPosterGuideOpacity: 0.00,
  lyricPosterCenterGuideOpacity: 0.00,
  lyricPosterShortGuideOpacity: 0.00,
  lyricPosterShortTopLeftX: 221,
  lyricPosterShortTopLeftY: 18,
  lyricPosterShortTopRightX: 1460,
  lyricPosterShortTopRightY: 3,
  lyricPosterShortBottomLeftX: 454,
  lyricPosterShortBottomLeftY: 195,
  lyricPosterShortBottomRightX: 1343,
  lyricPosterShortBottomRightY: 189,
  lyricPosterShortVerticalStretch: 0.78,
  lyricPosterShortPerspective: 1.20,
  lyricPosterShortTilt: -26,
  lyricPosterShortTextTopLeftX: -160,
  lyricPosterShortTextTopLeftY: 0,
  lyricPosterShortTextTopRightX: 160,
  lyricPosterShortTextTopRightY: 0,
  lyricPosterShortTextBottomLeftX: 0,
  lyricPosterShortTextBottomLeftY: 0,
  lyricPosterShortTextBottomRightX: 0,
  lyricPosterShortTextBottomRightY: 0,
  lyricPosterTwoRowBandGuideOpacity: 0.00,
  lyricPosterThreeRowBandGuideOpacity: 0.00,
  lyricPosterStroke: 7.6,
  lyricPosterStrokeColor: "#000000",
  lyricPosterFillColor: "#000000",
  lyricPosterStrokeOpacity: 0.30,
  lyricPosterFillOpacity: 0.35,
  lyricPosterGlow: 0,
  lyricPosterEffectDropShadow: false,
  lyricPosterEffectEmboss: false,
  lyricPosterEffectInsetEmboss: true,
  lyricPosterEffectBevel: false,
  lyricPosterEffectSoftBlur: false,
  lyricPosterOneRowVerticalStretch: 0.86,
  lyricPosterOneRowTightness: 0.00,
  lyricPosterOneRowPerspective: 1.33,
  lyricPosterOneRowTilt: -32,
  lyricPosterOneRowTextTopLeftX: -242,
  lyricPosterOneRowTextTopLeftY: 0,
  lyricPosterOneRowTextTopRightX: 242,
  lyricPosterOneRowTextTopRightY: 0,
  lyricPosterOneRowTextBottomLeftX: 6,
  lyricPosterOneRowTextBottomLeftY: -1,
  lyricPosterOneRowTextBottomRightX: 0,
  lyricPosterOneRowTextBottomRightY: 0,
  lyricPosterTwoRowVerticalStretch: 1.06,
  lyricPosterTwoRowTopBandTopY: 18,
  lyricPosterTwoRowTopBandBottomY: 106,
  lyricPosterTwoRowBottomBandTopY: 106,
  lyricPosterTwoRowBottomBandBottomY: 195,
  lyricPosterTwoRowTopY: 0,
  lyricPosterTwoRowBottomY: 0,
  lyricPosterTwoRowTightness: 0.19,
  lyricPosterTwoRowPerspective: 1.00,
  lyricPosterTwoRowTilt: -10,
  lyricPosterThreeRowVerticalStretch: 0.51,
  lyricPosterThreeRowTopBandTopY: 18,
  lyricPosterThreeRowTopBandBottomY: 76,
  lyricPosterThreeRowMiddleBandTopY: 76,
  lyricPosterThreeRowMiddleBandBottomY: 136,
  lyricPosterThreeRowBottomBandTopY: 136,
  lyricPosterThreeRowBottomBandBottomY: 195,
  lyricPosterThreeRowTopY: 0,
  lyricPosterThreeRowMiddleY: 0,
  lyricPosterThreeRowBottomY: 0,
  lyricPosterThreeRowTightness: 0.52,
  lyricPosterThreeRowPerspective: 1.00,
  lyricPosterThreeRowTilt: -12,
  lyricPosterTwoRowTopTextTopLeftX: -148,
  lyricPosterTwoRowTopTextTopLeftY: 0,
  lyricPosterTwoRowTopTextTopRightX: 147,
  lyricPosterTwoRowTopTextTopRightY: 0,
  lyricPosterTwoRowTopTextBottomLeftX: 0,
  lyricPosterTwoRowTopTextBottomLeftY: 0,
  lyricPosterTwoRowTopTextBottomRightX: 0,
  lyricPosterTwoRowTopTextBottomRightY: 0,
  lyricPosterTwoRowBottomTextTopLeftX: -148,
  lyricPosterTwoRowBottomTextTopLeftY: 0,
  lyricPosterTwoRowBottomTextTopRightX: 143,
  lyricPosterTwoRowBottomTextTopRightY: 0,
  lyricPosterTwoRowBottomTextBottomLeftX: 0,
  lyricPosterTwoRowBottomTextBottomLeftY: 0,
  lyricPosterTwoRowBottomTextBottomRightX: 0,
  lyricPosterTwoRowBottomTextBottomRightY: 0,
  lyricPosterThreeRowTopTextTopLeftX: -278,
  lyricPosterThreeRowTopTextTopLeftY: 0,
  lyricPosterThreeRowTopTextTopRightX: 278,
  lyricPosterThreeRowTopTextTopRightY: 0,
  lyricPosterThreeRowTopTextBottomLeftX: 0,
  lyricPosterThreeRowTopTextBottomLeftY: 0,
  lyricPosterThreeRowTopTextBottomRightX: 0,
  lyricPosterThreeRowTopTextBottomRightY: 0,
  lyricPosterThreeRowMiddleTextTopLeftX: -183,
  lyricPosterThreeRowMiddleTextTopLeftY: 0,
  lyricPosterThreeRowMiddleTextTopRightX: 183,
  lyricPosterThreeRowMiddleTextTopRightY: 0,
  lyricPosterThreeRowMiddleTextBottomLeftX: 0,
  lyricPosterThreeRowMiddleTextBottomLeftY: 0,
  lyricPosterThreeRowMiddleTextBottomRightX: 0,
  lyricPosterThreeRowMiddleTextBottomRightY: 0,
  lyricPosterThreeRowBottomTextTopLeftX: -116,
  lyricPosterThreeRowBottomTextTopLeftY: 0,
  lyricPosterThreeRowBottomTextTopRightX: 116,
  lyricPosterThreeRowBottomTextTopRightY: 0,
  lyricPosterThreeRowBottomTextBottomLeftX: 0,
  lyricPosterThreeRowBottomTextBottomLeftY: 0,
  lyricPosterThreeRowBottomTextBottomRightX: 0,
  lyricPosterThreeRowBottomTextBottomRightY: 0,
  lyricPosterMaxRows: "auto",
  lyricPosterRowBreakpoint: 28,
  lyricPosterTransition: "none"};

const ROOM_UTILITY_KEY = "pocketdj-room-utility-v56";
let roomUtility = loadRoomUtilitySettings();



async function boot(): Promise<void> {
  if (!loadClientId()) saveClientId(STANDARD_SPOTIFY_CLIENT_ID);
  renderShell(state);
  dj = new DjController(qs("#djSprite"), qs("#modePill"));
  bindControls();
  updateSidePanelLockUi();
  updateLyricsToggleUi(lyricsState.status, lyricsEnabled);
  scheduleSidePanelAutoHide();
  bindRoomUtilityControls();
  applyRoomUtilitySettings();

  if (state.spotifyClientId) {
    try {
      await handleSpotifyCallback(state.spotifyClientId, state.redirectUri);
    } catch (error) {
      lastPollError = error instanceof Error ? error.message : String(error);
      console.warn(lastPollError);
    }
  }

  if (loadTokens()) {
    await pollSpotifyNow();
    void loadPlaylists();
    scheduleNextPoll(6000);
  } else {
    updatePlaybackUi(state.playback, state.debugOpen);
  }

  requestAnimationFrame(tick);
}

function bindControls(): void {
  qs<HTMLButtonElement>("#panelToggle").addEventListener("click", () => {
    openSidePanel(true);
  });

  qs<HTMLButtonElement>("#lyricsToggle").addEventListener("click", () => {
    lyricsEnabled = !lyricsEnabled;
    const lyricProgressMs = getEstimatedPlaybackProgress(state.playback);
    const activeLyricIndex = getActiveLyricIndex(lyricsState.syncedLyrics, lyricProgressMs);
    updateLyricsCeiling(lyricsState, lyricProgressMs, activeLyricIndex, lyricsEnabled, state.playback.isPlaying || state.playback.source === "demo");
  });


  qs<HTMLButtonElement>("#panelLockToggle").addEventListener("click", () => {
    setSidePanelLocked(!sidePanelLocked);
  });

  const controlCard = qs<HTMLElement>("#controlCard");
  controlCard.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  controlCard.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  controlCard.addEventListener("mouseenter", () => {
    clearSidePanelHideTimer();
  });
  controlCard.addEventListener("mouseleave", () => {
    scheduleSidePanelAutoHide();
  });

  const sideTab = qs<HTMLButtonElement>("#sidePanelTab");
  sideTab.addEventListener("mouseenter", () => {
    if (!roomUtility.panelHeightAdjustEnabled) openSidePanel(true);
  });
  sideTab.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!roomUtility.panelHeightAdjustEnabled) openSidePanel(true);
  });
  bindDraggableSidePanelTab(sideTab);

  qs<HTMLButtonElement>("#panelAdjustDone").addEventListener("click", (event) => {
    event.stopPropagation();
    setPanelHeightAdjustEnabled(false, true);
  });


  document.addEventListener("pointerdown", (event) => {
    closeSidePanelOnOutsidePointer(event);
  });

  bindFloorPlaybackControls();
  bindSeekControls();
  bindSpotifyBrowserControls();

  qs<HTMLButtonElement>("#connectSpotify").addEventListener("click", async () => {
    if (loadTokens()) {
      qs<HTMLElement>("#connectDropdown").classList.toggle("connect-dropdown-open");
      return;
    }

    state.spotifyClientId = STANDARD_SPOTIFY_CLIENT_ID;
    saveClientId(state.spotifyClientId);
    await startSpotifyLogin(state.spotifyClientId, state.redirectUri);
  });

  qs<HTMLButtonElement>("#disconnectSpotify").addEventListener("click", () => {
    disconnectSpotify();
    stopDemo();
    useDemo = false;
    state.playback = emptyTrack();
    panelAutoHiddenAfterConnect = false;
    openSidePanel(true);
    updatePlaybackUi(state.playback, state.debugOpen);
    qs<HTMLElement>("#connectDropdown").classList.remove("connect-dropdown-open");
  });

  qs<HTMLButtonElement>("#demoButton").addEventListener("click", () => {
    useDemo = toggleDemo();
    if (useDemo && pollTimer) window.clearTimeout(pollTimer);
    state.playback = getDemoTrack();
    panelAutoHiddenAfterConnect = false;
    updatePlaybackUi(state.playback, state.debugOpen);
  });

  qs<HTMLButtonElement>("#debugButton").addEventListener("click", () => {
    state.debugOpen = !state.debugOpen;
    updatePlaybackUi(lastPollError ? { ...state.playback, artist: `${state.playback.artist} | ${lastPollError}` } : state.playback, state.debugOpen);
  });

  qs<HTMLInputElement>("#spotifyVolume").addEventListener("input", (event) => {
    const input = event.target as HTMLInputElement;
    phase2Volume = Number(input.value);
    qs<HTMLElement>("#spotifyVolumeValue").textContent = String(phase2Volume);
  });

  qs<HTMLInputElement>("#spotifyVolume").addEventListener("change", () => {
    void runSpotifyPlaybackCommand(async () => {
      await setSpotifyVolume(state.spotifyClientId, phase2Volume);
    });
  });

  qs<HTMLButtonElement>("#panelShuffleButton").addEventListener("click", () => {
    phase2ShuffleEnabled = !phase2ShuffleEnabled;
    updatePhase2SpotifyControls();
    void runSpotifyPlaybackCommand(async () => {
      await setSpotifyShuffle(state.spotifyClientId, phase2ShuffleEnabled);
    });
  });

  qs<HTMLButtonElement>("#panelRepeatButton").addEventListener("click", () => {
    phase2RepeatMode = phase2RepeatMode === "off" ? "context" : phase2RepeatMode === "context" ? "track" : "off";
    updatePhase2SpotifyControls();
    void runSpotifyPlaybackCommand(async () => {
      await setSpotifyRepeat(state.spotifyClientId, phase2RepeatMode);
    });
  });

  qs<HTMLInputElement>("#clientIdInput").addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    state.spotifyClientId = input.value.trim();
    saveClientId(state.spotifyClientId);
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !useDemo && loadTokens()) void pollSpotifyNow();
  });
}




let sidePanelTabDragState: {
  pointerId: number;
  startY: number;
  startPanelY: number;
  moved: boolean;
} | null = null;

function clampPanelStartY(value: number): number {
  return Math.max(4, Math.min(86, value));
}

function updatePanelStartY(value: number, persist = false): void {
  const clamped = Math.round(clampPanelStartY(value) * 10) / 10;
  roomUtility = { ...roomUtility, panelStartY: clamped };

  const slider = document.querySelector<HTMLInputElement>("#panelStartY");
  const label = document.querySelector<HTMLElement>("#panelStartYValue");
  if (slider) slider.value = String(clamped);
  if (label) setUtilityLabel("panelStartYValue", clamped);

  applyRoomUtilitySettings();
  if (persist) saveRoomUtilitySettings();
}


function setPanelHeightAdjustEnabled(enabled: boolean, openPanelAfter = false): void {
  roomUtility = { ...roomUtility, panelHeightAdjustEnabled: enabled };

  const checkbox = document.querySelector<HTMLInputElement>("#panelHeightAdjustEnabled");
  if (checkbox) checkbox.checked = enabled;

  applyRoomUtilitySettings();
  saveRoomUtilitySettings();

  if (openPanelAfter) {
    openSidePanel(true);
  }
}

function bindDraggableSidePanelTab(tab: HTMLButtonElement): void {
  tab.addEventListener("pointerdown", (event) => {
    if (!roomUtility.panelHeightAdjustEnabled) return;
    if (event.button !== 0) return;
    sidePanelTabDragState = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startPanelY: roomUtility.panelStartY,
      moved: false,
    };
    tab.setPointerCapture(event.pointerId);
    tab.classList.add("side-panel-tab-dragging");
  });

  tab.addEventListener("pointermove", (event) => {
    if (!sidePanelTabDragState || sidePanelTabDragState.pointerId !== event.pointerId) return;

    const deltaY = event.clientY - sidePanelTabDragState.startY;
    if (Math.abs(deltaY) > 3) sidePanelTabDragState.moved = true;

    const deltaPercent = (deltaY / Math.max(1, window.innerHeight)) * 100;
    updatePanelStartY(sidePanelTabDragState.startPanelY + deltaPercent, false);
  });

  const finishDrag = (event: PointerEvent) => {
    if (!sidePanelTabDragState || sidePanelTabDragState.pointerId !== event.pointerId) return;

    const wasDragged = sidePanelTabDragState.moved;
    sidePanelTabDragState = null;
    tab.classList.remove("side-panel-tab-dragging");
    try {
      tab.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }

    saveRoomUtilitySettings();

    if (!wasDragged && !roomUtility.panelHeightAdjustEnabled) {
      openSidePanel(true);
    }
  };

  tab.addEventListener("pointerup", finishDrag);
  tab.addEventListener("pointercancel", finishDrag);
}


function closeSidePanelOnOutsidePointer(event: PointerEvent): void {
  if (sidePanelLocked) return;

  const panel = qs<HTMLElement>("#controlCard");
  if (!panel.classList.contains("control-card-open")) return;

  const target = event.target;
  if (!(target instanceof Node)) return;

  const sideTab = qs<HTMLElement>("#sidePanelTab");
  const panelToggle = qs<HTMLElement>("#panelToggle");

  if (panel.contains(target) || sideTab.contains(target) || panelToggle.contains(target)) return;

  closeSidePanel();
}

function openSidePanel(autoHide = true): void {
  setControlPanelOpen(true);
  clearSidePanelHideTimer();

  if (autoHide && !sidePanelLocked) {
    scheduleSidePanelAutoHide();
  }
}

function closeSidePanel(): void {
  setControlPanelOpen(false);
  clearSidePanelHideTimer();
  qs<HTMLElement>("#connectDropdown").classList.remove("connect-dropdown-open");
}

function scheduleSidePanelAutoHide(): void {
  if (sidePanelLocked) return;
  clearSidePanelHideTimer();

  sidePanelHideTimer = window.setTimeout(() => {
    if (!sidePanelLocked) closeSidePanel();
  }, 1_500);
}

function clearSidePanelHideTimer(): void {
  if (sidePanelHideTimer) {
    window.clearTimeout(sidePanelHideTimer);
    sidePanelHideTimer = null;
  }
}

function setSidePanelLocked(locked: boolean): void {
  sidePanelLocked = locked;
  updateSidePanelLockUi();

  if (locked) {
    openSidePanel(false);
  } else {
    scheduleSidePanelAutoHide();
  }
}

function updateSidePanelLockUi(): void {
  const lock = qs<HTMLButtonElement>("#panelLockToggle");
  const panel = qs<HTMLElement>("#controlCard");

  lock.classList.toggle("panel-lock-active", sidePanelLocked);
  panel.classList.toggle("control-card-locked", sidePanelLocked);
  lock.setAttribute("aria-pressed", String(sidePanelLocked));
  lock.setAttribute("title", sidePanelLocked ? "Unlock side panel auto-hide" : "Lock side panel open");
  lock.setAttribute("aria-label", sidePanelLocked ? "Unlock side panel auto-hide" : "Lock side panel open");
}

function bindFloorPlaybackControls(): void {
  const floor = qs<HTMLElement>("#floorPlayer");

  floor.addEventListener("mouseenter", () => {
    if (floorControlsHideTimer) window.clearTimeout(floorControlsHideTimer);
    floorControlsHideTimer = null;
    setFloorControlsOpen(true, false);
  });

  floor.addEventListener("mouseleave", () => {
    scheduleFloorControlsAutoHide();
  });

  setFloorControlsOpen(true);

  qs<HTMLButtonElement>("#floorPlayButton").addEventListener("click", () => {
    void runSpotifyPlaybackCommand(async () => {
      if (state.playback.isPlaying) await pauseSpotify(state.spotifyClientId);
      else await playSpotify(state.spotifyClientId);
    });
  });

  qs<HTMLButtonElement>("#floorNextButton").addEventListener("click", () => {
    void runSpotifyPlaybackCommand(async () => {
      await nextSpotifyTrack(state.spotifyClientId);
    });
  });

  qs<HTMLButtonElement>("#floorPrevButton").addEventListener("click", () => {
    void runSpotifyPlaybackCommand(async () => {
      const estimatedProgress = getEstimatedPlaybackProgress(state.playback);
      if (estimatedProgress > 3_000) {
        await seekSpotify(state.spotifyClientId, 0);
      } else {
        await previousSpotifyTrack(state.spotifyClientId);
      }
    });
  });

  qs<HTMLButtonElement>("#floorMoreButton").addEventListener("click", () => {
    const panel = qs<HTMLElement>("#controlCard");
    const isPanelOpen = panel.classList.contains("control-card-open");
    if (isPanelOpen && !sidePanelLocked) closeSidePanel();
    else openSidePanel(true);
    setFloorControlsOpen(true, false);
  });

  qs<HTMLButtonElement>("#panelPlayButton").addEventListener("click", () => {
    void runSpotifyPlaybackCommand(async () => {
      if (state.playback.isPlaying) await pauseSpotify(state.spotifyClientId);
      else await playSpotify(state.spotifyClientId);
    });
  });

  qs<HTMLButtonElement>("#panelNextButton").addEventListener("click", () => {
    void runSpotifyPlaybackCommand(async () => {
      await nextSpotifyTrack(state.spotifyClientId);
    });
  });

  qs<HTMLButtonElement>("#panelPrevButton").addEventListener("click", () => {
    void runSpotifyPlaybackCommand(async () => {
      const estimatedProgress = getEstimatedPlaybackProgress(state.playback);
      if (estimatedProgress > 3_000) {
        await seekSpotify(state.spotifyClientId, 0);
      } else {
        await previousSpotifyTrack(state.spotifyClientId);
      }
    });
  });
}

function bindSeekControls(): void {
  bindSeekSurface(qs<HTMLElement>("#panelSeekBar"));
  bindSeekSurface(qs<HTMLElement>("#floorSeekBar"));
}

function bindSeekSurface(surface: HTMLElement): void {
  let dragging = false;

  const previewSeek = (clientX: number): number => {
    const rect = surface.getBoundingClientRect();
    const ratio = rect.width > 0 ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) : 0;
    const positionMs = Math.round(ratio * (state.playback.durationMs || 0));
    const percent = ratio * 100;

    if (surface.id === "panelSeekBar") {
      qs<HTMLDivElement>("#progressFill").style.width = `${percent}%`;
      qs<HTMLElement>("#panelSeekBar").setAttribute("aria-valuenow", String(Math.round(percent)));
    } else {
      qs<HTMLDivElement>("#floorProgressFill").style.width = `${percent}%`;
      qs<HTMLElement>("#floorSeekBar").setAttribute("aria-valuenow", String(Math.round(percent)));
    }

    return positionMs;
  };

  const commitSeek = (clientX: number): void => {
    if (!state.playback.durationMs) return;
    const positionMs = previewSeek(clientX);
    void runSpotifyPlaybackCommand(async () => {
      await seekSpotify(state.spotifyClientId, positionMs);
    });
  };

  surface.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    dragging = true;
    surface.setPointerCapture(event.pointerId);
    previewSeek(event.clientX);
  });

  surface.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    previewSeek(event.clientX);
  });

  surface.addEventListener("pointerup", (event) => {
    if (!dragging) return;
    dragging = false;
    surface.releasePointerCapture(event.pointerId);
    commitSeek(event.clientX);
  });

  surface.addEventListener("pointercancel", (event) => {
    dragging = false;
    if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
  });
}

function setFloorControlsOpen(open: boolean, autoHide = true): void {
  floorControlsOpen = true;
  const floor = qs<HTMLElement>("#floorPlayer");

  floor.classList.remove("floor-player-hidden");
  floor.classList.add("floor-player-visible");
  floor.classList.toggle("floor-player-idle", !open);

  if (autoHide) scheduleFloorControlsAutoHide();
}

function setFloorControlsLocked(_locked: boolean): void {
  // Deprecated. Floor controls are now always visible and dim automatically.
  floorControlsLocked = false;
  setFloorControlsOpen(true);
}

function scheduleFloorControlsAutoHide(): void {
  if (floorControlsHideTimer) window.clearTimeout(floorControlsHideTimer);
  floorControlsHideTimer = window.setTimeout(() => {
    const floor = qs<HTMLElement>("#floorPlayer");
    floor.classList.add("floor-player-idle");
  }, 1_500);
}

function getEstimatedPlaybackProgress(track: AppState["playback"]): number {
  if (!track.isPlaying) return track.progressMs;
  return Math.min(track.durationMs || track.progressMs, track.progressMs + (Date.now() - track.updatedAt));
}

async function runSpotifyPlaybackCommand(command: () => Promise<void>): Promise<void> {
  if (useDemo) {
    lastPollError = "Spotify controls are disabled in Demo Mode.";
    updatePlaybackUi({ ...state.playback, artist: `${state.playback.artist} | ${lastPollError}` }, state.debugOpen);
    return;
  }

  if (!state.spotifyClientId || !loadTokens()) {
    lastPollError = "Connect Spotify before using playback controls.";
    updatePlaybackUi({ ...state.playback, artist: `${state.playback.artist} | ${lastPollError}` }, state.debugOpen);
    return;
  }

  try {
    lastPollError = "";
    await command();
    await pollSpotifyNow();
    setFloorControlsOpen(true);
  } catch (error) {
    lastPollError = error instanceof Error ? error.message : String(error);
    console.warn(lastPollError);
    updatePlaybackUi({ ...state.playback, artist: `${state.playback.artist} | ${lastPollError}` }, state.debugOpen);
  }
}

function updatePhase2SpotifyControls(): void {
  const shuffle = qs<HTMLButtonElement>("#panelShuffleButton");
  const repeat = qs<HTMLButtonElement>("#panelRepeatButton");
  const volume = qs<HTMLInputElement>("#spotifyVolume");

  shuffle.classList.toggle("spotify-control-active", phase2ShuffleEnabled);
  shuffle.setAttribute("title", phase2ShuffleEnabled ? "Shuffle on" : "Shuffle off");

  repeat.classList.toggle("spotify-control-active", phase2RepeatMode !== "off");
  repeat.setAttribute("title", `Repeat: ${phase2RepeatMode}`);

  volume.value = String(phase2Volume);
  qs<HTMLElement>("#spotifyVolumeValue").textContent = String(phase2Volume);
}


function escapeHtmlInline(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char] || char));
}

function formatDurationMs(value: number): string {
  if (!value) return "";
  const totalSeconds = Math.round(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function loadSpotifyPinnedPlaylists(): Set<string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SPOTIFY_PINNED_PLAYLISTS_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

function saveSpotifyPinnedPlaylists(): void {
  localStorage.setItem(SPOTIFY_PINNED_PLAYLISTS_KEY, JSON.stringify([...pinnedPlaylistIds]));
}

function loadSpotifyPlaylistRecency(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SPOTIFY_PLAYLIST_RECENCY_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed as Record<string, number> : {};
  } catch {
    return {};
  }
}

function saveSpotifyPlaylistRecency(): void {
  localStorage.setItem(SPOTIFY_PLAYLIST_RECENCY_KEY, JSON.stringify(playlistRecency));
}

function rememberPlaylistUse(playlistId: string): void {
  playlistRecency = { ...playlistRecency, [playlistId]: Date.now() };
  saveSpotifyPlaylistRecency();
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function recentTrackRank(track: SpotifyCatalogTrack): number {
  const index = recentTrackIds.indexOf(track.id);
  return index === -1 ? 999_999 : index;
}

function sortTracks(tracks: SpotifyCatalogTrack[], sort: SpotifyBrowserSort): SpotifyCatalogTrack[] {
  const sorted = [...tracks];
  if (sort === "alpha") return sorted.sort((a, b) => compareText(a.name, b.name));
  if (sort === "artist") return sorted.sort((a, b) => compareText(a.artists, b.artists) || compareText(a.name, b.name));
  if (sort === "album") return sorted.sort((a, b) => compareText(a.album, b.album) || compareText(a.name, b.name));
  return sorted.sort((a, b) => recentTrackRank(a) - recentTrackRank(b) || compareText(a.name, b.name));
}

function sortPlaylists(playlists: SpotifyCatalogPlaylist[], sort: SpotifyBrowserSort): SpotifyCatalogPlaylist[] {
  const sorted = [...playlists];
  if (sort === "alpha") {
    return sorted.sort((a, b) =>
      Number(pinnedPlaylistIds.has(b.id)) - Number(pinnedPlaylistIds.has(a.id))
      || compareText(a.name, b.name)
    );
  }

  return sorted.sort((a, b) =>
    Number(pinnedPlaylistIds.has(b.id)) - Number(pinnedPlaylistIds.has(a.id))
    || (playlistRecency[b.id] || 0) - (playlistRecency[a.id] || 0)
    || compareText(a.name, b.name)
  );
}

function getPlaylistSortMode(): SpotifyBrowserSort {
  return qs<HTMLSelectElement>("#playlistSortSelect").value as SpotifyBrowserSort;
}

function getLibrarySortMode(): SpotifyBrowserSort {
  return qs<HTMLSelectElement>("#librarySortSelect").value as SpotifyBrowserSort;
}

function setSpotifyBrowserStatus(message: string, busy = false): void {
  spotifyBrowserStatus = message;
  spotifyBrowserBusy = busy;
  const status = qs<HTMLElement>("#spotifyBrowserStatus");
  status.textContent = message;
  status.classList.toggle("spotify-browser-status-busy", busy);
}

function setSpotifyBrowserTab(tab: SpotifyBrowserTab): void {
  spotifyBrowserTab = tab;
  qs<HTMLElement>("#spotifySearchPane").classList.toggle("spotify-browser-pane-active", tab === "search");
  qs<HTMLElement>("#spotifyPlaylistsPane").classList.toggle("spotify-browser-pane-active", tab === "playlists");
  qs<HTMLElement>("#spotifyLibraryPane").classList.toggle("spotify-browser-pane-active", tab === "library");

  qs<HTMLButtonElement>("#spotifyTabSearch").classList.toggle("spotify-browser-tab-active", tab === "search");
  qs<HTMLButtonElement>("#spotifyTabPlaylists").classList.toggle("spotify-browser-tab-active", tab === "playlists");
  qs<HTMLButtonElement>("#spotifyTabLibrary").classList.toggle("spotify-browser-tab-active", tab === "library");
}

function renderTrackRows(containerId: string, tracks: SpotifyCatalogTrack[], emptyMessage: string, sort: SpotifyBrowserSort = "recent"): void {
  const container = qs<HTMLElement>(`#${containerId}`);
  const visibleTracks = sortTracks(tracks, sort);
  if (!visibleTracks.length) {
    container.classList.add("spotify-browser-empty");
    container.innerHTML = escapeHtmlInline(emptyMessage);
    return;
  }

  container.classList.remove("spotify-browser-empty");
  container.innerHTML = visibleTracks.map((track) => `
    <article class="spotify-result-row spotify-track-row" data-uri="${escapeHtmlInline(track.uri)}">
      <div class="spotify-result-art">${track.albumArtUrl ? `<img src="${escapeHtmlInline(track.albumArtUrl)}" alt="" />` : "<span>♪</span>"}</div>
      <div class="spotify-result-copy">
        <div class="spotify-result-title">${escapeHtmlInline(track.name)}</div>
        <div class="spotify-result-subtitle">${escapeHtmlInline(track.artists)}${track.album ? ` • ${escapeHtmlInline(track.album)}` : ""}</div>
      </div>
      <div class="spotify-result-duration">${formatDurationMs(track.durationMs)}</div>
      <button class="spotify-row-button" type="button" data-action="play-uri" data-uri="${escapeHtmlInline(track.uri)}">Play</button>
      <button class="spotify-row-button secondary" type="button" data-action="queue-uri" data-uri="${escapeHtmlInline(track.uri)}">Queue</button>
    </article>
  `).join("");
}

function renderPlaylistRows(containerId: string, playlists: SpotifyCatalogPlaylist[], emptyMessage: string): void {
  const container = qs<HTMLElement>(`#${containerId}`);
  const visiblePlaylists = sortPlaylists(playlists, getPlaylistSortMode());
  if (!visiblePlaylists.length) {
    container.classList.add("spotify-browser-empty");
    container.innerHTML = escapeHtmlInline(emptyMessage);
    return;
  }

  container.classList.remove("spotify-browser-empty");
  container.innerHTML = visiblePlaylists.map((playlist) => {
    const pinned = pinnedPlaylistIds.has(playlist.id);
    const recentLabel = playlistRecency[playlist.id] ? "Recently opened" : "Not opened here yet";
    return `
      <article class="spotify-result-row spotify-playlist-row${pinned ? " spotify-playlist-pinned" : ""}" data-playlist-id="${escapeHtmlInline(playlist.id)}" data-uri="${escapeHtmlInline(playlist.uri)}">
        <div class="spotify-result-art">${playlist.imageUrl ? `<img src="${escapeHtmlInline(playlist.imageUrl)}" alt="" />` : "<span>▤</span>"}</div>
        <div class="spotify-result-copy">
          <button class="spotify-result-title spotify-result-title-button" type="button" data-action="open-playlist" data-playlist-id="${escapeHtmlInline(playlist.id)}">${pinned ? "★ " : ""}${escapeHtmlInline(playlist.name)}</button>
          <div class="spotify-result-subtitle">${escapeHtmlInline(playlist.owner)} • ${playlist.trackCount} tracks • ${recentLabel}</div>
        </div>
        <button class="spotify-row-button" type="button" data-action="play-context" data-playlist-id="${escapeHtmlInline(playlist.id)}" data-uri="${escapeHtmlInline(playlist.uri)}">Play</button>
        <button class="spotify-row-button secondary" type="button" data-action="shuffle-context" data-playlist-id="${escapeHtmlInline(playlist.id)}" data-uri="${escapeHtmlInline(playlist.uri)}">Shuffle</button>
      </article>
    `;
  }).join("");
}

function renderArtistRows(artists: SpotifyCatalogArtist[]): string {
  if (!artists.length) return "";
  return `
    <div class="spotify-result-group-title">Artists</div>
    ${artists.map((artist) => `
      <article class="spotify-result-row spotify-artist-row" data-artist-id="${escapeHtmlInline(artist.id)}" data-uri="${escapeHtmlInline(artist.uri)}">
        <div class="spotify-result-art spotify-result-art-round">${artist.imageUrl ? `<img src="${escapeHtmlInline(artist.imageUrl)}" alt="" />` : "<span>◎</span>"}</div>
        <div class="spotify-result-copy">
          <button class="spotify-result-title spotify-result-title-button" type="button" data-action="artist-top-tracks" data-artist-id="${escapeHtmlInline(artist.id)}" data-artist-name="${escapeHtmlInline(artist.name)}">${escapeHtmlInline(artist.name)}</button>
          <div class="spotify-result-subtitle">${artist.followers ? `${artist.followers.toLocaleString()} followers` : "Artist"}</div>
        </div>
        <button class="spotify-row-button" type="button" data-action="artist-top-tracks" data-artist-id="${escapeHtmlInline(artist.id)}" data-artist-name="${escapeHtmlInline(artist.name)}">Top Tracks</button>
      </article>
    `).join("")}
  `;
}

function renderSearchResults(): void {
  const parts: string[] = [];
  if (spotifyBrowserTracks.length) {
    parts.push(`<div class="spotify-result-group-title">Tracks</div>`);
    parts.push(sortTracks(spotifyBrowserTracks, "recent").map((track) => `
      <article class="spotify-result-row spotify-track-row" data-uri="${escapeHtmlInline(track.uri)}">
        <div class="spotify-result-art">${track.albumArtUrl ? `<img src="${escapeHtmlInline(track.albumArtUrl)}" alt="" />` : "<span>♪</span>"}</div>
        <div class="spotify-result-copy">
          <button class="spotify-result-title spotify-result-title-button" type="button" data-action="play-uri" data-uri="${escapeHtmlInline(track.uri)}">${escapeHtmlInline(track.name)}</button>
          <div class="spotify-result-subtitle">${escapeHtmlInline(track.artists)}${track.album ? ` • ${escapeHtmlInline(track.album)}` : ""}</div>
        </div>
        <div class="spotify-result-duration">${formatDurationMs(track.durationMs)}</div>
        <button class="spotify-row-button" type="button" data-action="play-uri" data-uri="${escapeHtmlInline(track.uri)}">Play</button>
        <button class="spotify-row-button secondary" type="button" data-action="queue-uri" data-uri="${escapeHtmlInline(track.uri)}">Queue</button>
      </article>
    `).join(""));
  }

  parts.push(renderArtistRows(spotifyBrowserArtists));

  if (spotifyBrowserPlaylists.length) {
    parts.push(`<div class="spotify-result-group-title">Playlists</div>`);
    parts.push(sortPlaylists(spotifyBrowserPlaylists, "recent").map((playlist) => {
      const pinned = pinnedPlaylistIds.has(playlist.id);
      return `
        <article class="spotify-result-row spotify-playlist-row${pinned ? " spotify-playlist-pinned" : ""}" data-playlist-id="${escapeHtmlInline(playlist.id)}" data-uri="${escapeHtmlInline(playlist.uri)}">
          <div class="spotify-result-art">${playlist.imageUrl ? `<img src="${escapeHtmlInline(playlist.imageUrl)}" alt="" />` : "<span>▤</span>"}</div>
          <div class="spotify-result-copy">
            <button class="spotify-result-title spotify-result-title-button" type="button" data-action="open-playlist" data-playlist-id="${escapeHtmlInline(playlist.id)}">${pinned ? "★ " : ""}${escapeHtmlInline(playlist.name)}</button>
            <div class="spotify-result-subtitle">${escapeHtmlInline(playlist.owner)} • ${playlist.trackCount} tracks</div>
          </div>
          <button class="spotify-row-button" type="button" data-action="play-context" data-playlist-id="${escapeHtmlInline(playlist.id)}" data-uri="${escapeHtmlInline(playlist.uri)}">Play</button>
          <button class="spotify-row-button secondary" type="button" data-action="shuffle-context" data-playlist-id="${escapeHtmlInline(playlist.id)}" data-uri="${escapeHtmlInline(playlist.uri)}">Shuffle</button>
        </article>
      `;
    }).join(""));
  }

  const container = qs<HTMLElement>("#spotifySearchResults");
  const html = parts.filter(Boolean).join("");
  if (!html.trim()) {
    container.classList.add("spotify-browser-empty");
    container.innerHTML = "No Spotify results found.";
  } else {
    container.classList.remove("spotify-browser-empty");
    container.innerHTML = html;
  }
}

async function ensureRecentTrackIds(): Promise<void> {
  if (recentTrackIds.length) return;
  const recent = await getRecentlyPlayed(state.spotifyClientId, 50);
  recentTrackIds = recent.map((track) => track.id);
}

async function runSpotifyBrowserAction(action: () => Promise<void>): Promise<void> {
  if (useDemo) {
    setSpotifyBrowserStatus("Spotify browser is disabled in Demo Mode.", false);
    return;
  }

  if (!state.spotifyClientId || !loadTokens()) {
    setSpotifyBrowserStatus("Connect Spotify first. If you just added new Spotify scopes, reconnect once.", false);
    openSidePanel(true);
    return;
  }

  try {
    setSpotifyBrowserStatus("Talking to Spotify...", true);
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setSpotifyBrowserStatus(message, false);
    console.warn(message);
  }
}

async function performSpotifySearch(): Promise<void> {
  const input = qs<HTMLInputElement>("#spotifySearchInput");
  const searchType = qs<HTMLSelectElement>("#spotifySearchType").value as "track" | "artist" | "playlist" | "all";
  const query = input.value.trim();
  if (!query) {
    setSpotifyBrowserStatus("Type something to search Spotify.", false);
    return;
  }

  await runSpotifyBrowserAction(async () => {
    await ensureRecentTrackIds();
    const results = await searchSpotifyCatalog(state.spotifyClientId, query, searchType, 10);
    spotifyBrowserTracks = results.tracks;
    spotifyBrowserArtists = results.artists;
    spotifyBrowserPlaylists = results.playlists;
    renderSearchResults();
    setSpotifyBrowserStatus(`Search complete for "${query}".`, false);
  });
}

async function loadPlaylists(): Promise<void> {
  await runSpotifyBrowserAction(async () => {
    selectedPlaylist = null;
    currentPlaylistTracks = [];
    spotifyBrowserPlaylists = await getUserPlaylists(state.spotifyClientId, 50);
    renderPlaylistRows("spotifyPlaylistsResults", spotifyBrowserPlaylists, "No playlists returned.");
    qs<HTMLButtonElement>("#playlistBackButton").disabled = true;
    setSpotifyBrowserStatus(`Loaded ${spotifyBrowserPlaylists.length} playlists. Pinned and recently opened are first.`, false);
  });
}

async function openPlaylist(playlistId: string): Promise<void> {
  const playlist = spotifyBrowserPlaylists.find((item) => item.id === playlistId) || null;
  selectedPlaylist = playlist;
  rememberPlaylistUse(playlistId);

  await runSpotifyBrowserAction(async () => {
    await ensureRecentTrackIds();
    currentPlaylistTracks = await getPlaylistTracks(state.spotifyClientId, playlistId, 100);
    renderTrackRows("spotifyPlaylistsResults", currentPlaylistTracks, "No tracks returned for this playlist.", getPlaylistSortMode());
    qs<HTMLButtonElement>("#playlistBackButton").disabled = false;
    setSpotifyBrowserStatus(`Opened ${playlist?.name || "playlist"} with ${currentPlaylistTracks.length} tracks.`, false);
  });
}

async function loadSavedSpotifyTracks(): Promise<void> {
  await runSpotifyBrowserAction(async () => {
    await ensureRecentTrackIds();
    currentLibraryTracks = await getSavedTracks(state.spotifyClientId, 50);
    renderTrackRows("spotifyLibraryResults", currentLibraryTracks, "No liked songs returned.", getLibrarySortMode());
    setSpotifyBrowserStatus(`Loaded ${currentLibraryTracks.length} liked songs.`, false);
  });
}

async function loadRecentSpotifyTracks(): Promise<void> {
  await runSpotifyBrowserAction(async () => {
    const tracks = await getRecentlyPlayed(state.spotifyClientId, 50);
    recentTrackIds = tracks.map((track) => track.id);
    currentLibraryTracks = tracks;
    renderTrackRows("spotifyLibraryResults", currentLibraryTracks, "No recently played tracks returned.", getLibrarySortMode());
    setSpotifyBrowserStatus(`Loaded ${currentLibraryTracks.length} recently played tracks.`, false);
  });
}

async function openArtistTopTracks(artistId: string, artistName: string): Promise<void> {
  await runSpotifyBrowserAction(async () => {
    const tracks = await getArtistTopTracks(state.spotifyClientId, artistId);
    spotifyBrowserTracks = tracks;
    spotifyBrowserArtists = [];
    spotifyBrowserPlaylists = [];
    renderSearchResults();
    setSpotifyBrowserTab("search");
    setSpotifyBrowserStatus(`Loaded top tracks for ${artistName}.`, false);
  });
}

function bindSpotifyBrowserControls(): void {
  qs<HTMLButtonElement>("#spotifyTabSearch").addEventListener("click", () => setSpotifyBrowserTab("search"));
  qs<HTMLButtonElement>("#spotifyTabPlaylists").addEventListener("click", () => {
    setSpotifyBrowserTab("playlists");
    if (!spotifyBrowserPlaylists.length && !spotifyBrowserBusy) void loadPlaylists();
  });
  qs<HTMLButtonElement>("#spotifyTabLibrary").addEventListener("click", () => setSpotifyBrowserTab("library"));

  qs<HTMLButtonElement>("#spotifySearchButton").addEventListener("click", () => {
    void performSpotifySearch();
  });

  qs<HTMLInputElement>("#spotifySearchInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void performSpotifySearch();
    }
  });

  document.querySelector<HTMLButtonElement>("#loadPlaylistsButton")?.addEventListener("click", () => {
    void loadPlaylists();
  });

  qs<HTMLSelectElement>("#playlistSortSelect").addEventListener("change", () => {
    if (selectedPlaylist) renderTrackRows("spotifyPlaylistsResults", currentPlaylistTracks, "No tracks returned for this playlist.", getPlaylistSortMode());
    else renderPlaylistRows("spotifyPlaylistsResults", spotifyBrowserPlaylists, "Load your Spotify playlists.");
  });

  qs<HTMLSelectElement>("#librarySortSelect").addEventListener("change", () => {
    renderTrackRows("spotifyLibraryResults", currentLibraryTracks, "Choose liked songs or recently played tracks.", getLibrarySortMode());
  });

  qs<HTMLButtonElement>("#playlistBackButton").addEventListener("click", () => {
    selectedPlaylist = null;
    currentPlaylistTracks = [];
    renderPlaylistRows("spotifyPlaylistsResults", spotifyBrowserPlaylists, "Load your Spotify playlists.");
    qs<HTMLButtonElement>("#playlistBackButton").disabled = true;
    setSpotifyBrowserStatus("Back to My Playlists.", false);
  });
  qs<HTMLButtonElement>("#playlistBackButton").disabled = true;

  qs<HTMLButtonElement>("#loadSavedTracksButton").addEventListener("click", () => {
    void loadSavedSpotifyTracks();
  });

  qs<HTMLButtonElement>("#loadRecentTracksButton").addEventListener("click", () => {
    void loadRecentSpotifyTracks();
  });

  qs<HTMLElement>("#spotifyBrowserPanel").addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>("[data-action]");
    if (!button) return;

    const action = button.dataset.action || "";
    const uri = button.dataset.uri || "";
    const playlistId = button.dataset.playlistId || "";
    const artistId = button.dataset.artistId || "";
    const artistName = button.dataset.artistName || "artist";

    if (action === "play-uri" && uri) {
      void runSpotifyBrowserAction(async () => {
        await playSpotifyUri(state.spotifyClientId, uri);
        await pollSpotifyNow();
        setSpotifyBrowserStatus("Playing selected track.", false);
      });
    }

    if (action === "queue-uri" && uri) {
      void runSpotifyBrowserAction(async () => {
        await addSpotifyUriToQueue(state.spotifyClientId, uri);
        setSpotifyBrowserStatus("Added track to Spotify queue.", false);
      });
    }

    if (action === "play-context" && uri) {
      void runSpotifyBrowserAction(async () => {
        if (playlistId) rememberPlaylistUse(playlistId);
        phase2ShuffleEnabled = false;
        await setSpotifyShuffle(state.spotifyClientId, false);
        await playSpotifyContext(state.spotifyClientId, uri);
        updatePhase2SpotifyControls();
        await pollSpotifyNow();
        setSpotifyBrowserStatus("Playing playlist.", false);
      });
    }

    if (action === "shuffle-context" && uri) {
      void runSpotifyBrowserAction(async () => {
        if (playlistId) rememberPlaylistUse(playlistId);
        phase2ShuffleEnabled = true;
        await playSpotifyContextShuffled(state.spotifyClientId, uri);
        updatePhase2SpotifyControls();
        await pollSpotifyNow();
        setSpotifyBrowserStatus("Shuffling playlist.", false);
      });
    }

    if (action === "open-playlist" && playlistId) {
      setSpotifyBrowserTab("playlists");
      void openPlaylist(playlistId);
    }

    if (action === "pin-playlist" && playlistId) {
      if (pinnedPlaylistIds.has(playlistId)) pinnedPlaylistIds.delete(playlistId);
      else pinnedPlaylistIds.add(playlistId);
      saveSpotifyPinnedPlaylists();
      if (spotifyBrowserTab === "search") renderSearchResults();
      else if (selectedPlaylist) renderTrackRows("spotifyPlaylistsResults", currentPlaylistTracks, "No tracks returned for this playlist.", getPlaylistSortMode());
      else renderPlaylistRows("spotifyPlaylistsResults", spotifyBrowserPlaylists, "Load your Spotify playlists.");
    }

    if (action === "artist-top-tracks" && artistId) {
      void openArtistTopTracks(artistId, artistName);
    }
  });

  setSpotifyBrowserTab("search");
}

function bindRoomUtilityControls(): void {
  const sceneFilter = qs<HTMLSelectElement>("#sceneFilterSelect");
  const lyricPosterMaxRows = qs<HTMLSelectElement>("#lyricPosterMaxRows");
  const lyricPosterTransition = qs<HTMLSelectElement>("#lyricPosterTransition");
  const lyricPosterStrokeColor = qs<HTMLInputElement>("#lyricPosterStrokeColor");
  const lyricPosterFillColor = qs<HTMLInputElement>("#lyricPosterFillColor");
  const lyricPosterEffectDropShadow = qs<HTMLInputElement>("#lyricPosterEffectDropShadow");
  const lyricPosterEffectEmboss = qs<HTMLInputElement>("#lyricPosterEffectEmboss");
  const lyricPosterEffectInsetEmboss = qs<HTMLInputElement>("#lyricPosterEffectInsetEmboss");
  const lyricPosterEffectBevel = qs<HTMLInputElement>("#lyricPosterEffectBevel");
  const lyricPosterEffectSoftBlur = qs<HTMLInputElement>("#lyricPosterEffectSoftBlur");
  const panelHeightAdjustEnabled = qs<HTMLInputElement>("#panelHeightAdjustEnabled");

  sceneFilter.value = roomUtility.sceneFilter;
  lyricPosterMaxRows.value = roomUtility.lyricPosterMaxRows;
  lyricPosterTransition.value = roomUtility.lyricPosterTransition;
  lyricPosterStrokeColor.value = roomUtility.lyricPosterStrokeColor;
  lyricPosterFillColor.value = roomUtility.lyricPosterFillColor;
  lyricPosterEffectDropShadow.checked = roomUtility.lyricPosterEffectDropShadow;
  lyricPosterEffectEmboss.checked = roomUtility.lyricPosterEffectEmboss;
  lyricPosterEffectInsetEmboss.checked = roomUtility.lyricPosterEffectInsetEmboss;
  lyricPosterEffectBevel.checked = roomUtility.lyricPosterEffectBevel;
  lyricPosterEffectSoftBlur.checked = roomUtility.lyricPosterEffectSoftBlur;
  panelHeightAdjustEnabled.checked = roomUtility.panelHeightAdjustEnabled;

  panelHeightAdjustEnabled.addEventListener("change", () => {
    setPanelHeightAdjustEnabled(panelHeightAdjustEnabled.checked, false);
  });

  const controls = [
    ["speakerLeftX", "speakerLeftXValue"],
    ["speakerRightX", "speakerRightXValue"],
    ["speakerY", "speakerYValue"],
    ["speakerScale", "speakerScaleValue"],
    ["speakerOpacity", "speakerOpacityValue"],
    ["speakerPulse", "speakerPulseValue"],
    ["speakerPulseX", "speakerPulseXValue"],
    ["speakerPulseY", "speakerPulseYValue"],
    ["speakerPulseSize", "speakerPulseSizeValue"],
    ["speakerWarpOpacity", "speakerWarpOpacityValue"],
    ["filterStrength", "filterStrengthValue"],
    ["vignetteStrength", "vignetteStrengthValue"],
    ["shadowOpacity", "shadowOpacityValue"],
    ["tableShadowScale", "tableShadowScaleValue"],
    ["floorControlsIdleOpacity", "floorControlsIdleOpacityValue"],
    ["panelStartY", "panelStartYValue"],
    ["lyricPosterGuideOpacity", "lyricPosterGuideOpacityValue"],
    ["lyricPosterCenterGuideOpacity", "lyricPosterCenterGuideOpacityValue"],
    ["lyricPosterShortGuideOpacity", "lyricPosterShortGuideOpacityValue"],
    ["lyricPosterShortTopLeftX", "lyricPosterShortTopLeftXValue"],
    ["lyricPosterShortTopLeftY", "lyricPosterShortTopLeftYValue"],
    ["lyricPosterShortTopRightX", "lyricPosterShortTopRightXValue"],
    ["lyricPosterShortTopRightY", "lyricPosterShortTopRightYValue"],
    ["lyricPosterShortBottomLeftX", "lyricPosterShortBottomLeftXValue"],
    ["lyricPosterShortBottomLeftY", "lyricPosterShortBottomLeftYValue"],
    ["lyricPosterShortBottomRightX", "lyricPosterShortBottomRightXValue"],
    ["lyricPosterShortBottomRightY", "lyricPosterShortBottomRightYValue"],
    ["lyricPosterShortVerticalStretch", "lyricPosterShortVerticalStretchValue"],
    ["lyricPosterShortPerspective", "lyricPosterShortPerspectiveValue"],
    ["lyricPosterShortTilt", "lyricPosterShortTiltValue"],
    ["lyricPosterShortTextTopLeftX", "lyricPosterShortTextTopLeftXValue"],
    ["lyricPosterShortTextTopLeftY", "lyricPosterShortTextTopLeftYValue"],
    ["lyricPosterShortTextTopRightX", "lyricPosterShortTextTopRightXValue"],
    ["lyricPosterShortTextTopRightY", "lyricPosterShortTextTopRightYValue"],
    ["lyricPosterShortTextBottomLeftX", "lyricPosterShortTextBottomLeftXValue"],
    ["lyricPosterShortTextBottomLeftY", "lyricPosterShortTextBottomLeftYValue"],
    ["lyricPosterShortTextBottomRightX", "lyricPosterShortTextBottomRightXValue"],
    ["lyricPosterShortTextBottomRightY", "lyricPosterShortTextBottomRightYValue"],
    ["lyricPosterTwoRowBandGuideOpacity", "lyricPosterTwoRowBandGuideOpacityValue"],
    ["lyricPosterThreeRowBandGuideOpacity", "lyricPosterThreeRowBandGuideOpacityValue"],
    ["lyricPosterTopLeftX", "lyricPosterTopLeftXValue"],
    ["lyricPosterTopLeftY", "lyricPosterTopLeftYValue"],
    ["lyricPosterTopRightX", "lyricPosterTopRightXValue"],
    ["lyricPosterTopRightY", "lyricPosterTopRightYValue"],
    ["lyricPosterBottomLeftX", "lyricPosterBottomLeftXValue"],
    ["lyricPosterBottomLeftY", "lyricPosterBottomLeftYValue"],
    ["lyricPosterBottomRightX", "lyricPosterBottomRightXValue"],
    ["lyricPosterBottomRightY", "lyricPosterBottomRightYValue"],
    ["lyricPosterStroke", "lyricPosterStrokeValue"],
    ["lyricPosterRowBreakpoint", "lyricPosterRowBreakpointValue"],
    ["lyricPosterStrokeOpacity", "lyricPosterStrokeOpacityValue"],
    ["lyricPosterFillOpacity", "lyricPosterFillOpacityValue"],
    ["lyricPosterGlow", "lyricPosterGlowValue"],
    ["lyricPosterOneRowVerticalStretch", "lyricPosterOneRowVerticalStretchValue"],
    ["lyricPosterOneRowTightness", "lyricPosterOneRowTightnessValue"],
    ["lyricPosterOneRowPerspective", "lyricPosterOneRowPerspectiveValue"],
    ["lyricPosterOneRowTilt", "lyricPosterOneRowTiltValue"],
    ["lyricPosterOneRowTextTopLeftX", "lyricPosterOneRowTextTopLeftXValue"],
    ["lyricPosterOneRowTextTopLeftY", "lyricPosterOneRowTextTopLeftYValue"],
    ["lyricPosterOneRowTextTopRightX", "lyricPosterOneRowTextTopRightXValue"],
    ["lyricPosterOneRowTextTopRightY", "lyricPosterOneRowTextTopRightYValue"],
    ["lyricPosterOneRowTextBottomLeftX", "lyricPosterOneRowTextBottomLeftXValue"],
    ["lyricPosterOneRowTextBottomLeftY", "lyricPosterOneRowTextBottomLeftYValue"],
    ["lyricPosterOneRowTextBottomRightX", "lyricPosterOneRowTextBottomRightXValue"],
    ["lyricPosterOneRowTextBottomRightY", "lyricPosterOneRowTextBottomRightYValue"],
    ["lyricPosterTwoRowVerticalStretch", "lyricPosterTwoRowVerticalStretchValue"],
    ["lyricPosterTwoRowTopBandTopY", "lyricPosterTwoRowTopBandTopYValue"],
    ["lyricPosterTwoRowTopBandBottomY", "lyricPosterTwoRowTopBandBottomYValue"],
    ["lyricPosterTwoRowBottomBandTopY", "lyricPosterTwoRowBottomBandTopYValue"],
    ["lyricPosterTwoRowBottomBandBottomY", "lyricPosterTwoRowBottomBandBottomYValue"],
    ["lyricPosterTwoRowTopY", "lyricPosterTwoRowTopYValue"],
    ["lyricPosterTwoRowBottomY", "lyricPosterTwoRowBottomYValue"],
    ["lyricPosterTwoRowTightness", "lyricPosterTwoRowTightnessValue"],
    ["lyricPosterTwoRowPerspective", "lyricPosterTwoRowPerspectiveValue"],
    ["lyricPosterTwoRowTilt", "lyricPosterTwoRowTiltValue"],
    ["lyricPosterThreeRowVerticalStretch", "lyricPosterThreeRowVerticalStretchValue"],
    ["lyricPosterThreeRowTopBandTopY", "lyricPosterThreeRowTopBandTopYValue"],
    ["lyricPosterThreeRowTopBandBottomY", "lyricPosterThreeRowTopBandBottomYValue"],
    ["lyricPosterThreeRowMiddleBandTopY", "lyricPosterThreeRowMiddleBandTopYValue"],
    ["lyricPosterThreeRowMiddleBandBottomY", "lyricPosterThreeRowMiddleBandBottomYValue"],
    ["lyricPosterThreeRowBottomBandTopY", "lyricPosterThreeRowBottomBandTopYValue"],
    ["lyricPosterThreeRowBottomBandBottomY", "lyricPosterThreeRowBottomBandBottomYValue"],
    ["lyricPosterThreeRowTopY", "lyricPosterThreeRowTopYValue"],
    ["lyricPosterThreeRowMiddleY", "lyricPosterThreeRowMiddleYValue"],
    ["lyricPosterThreeRowBottomY", "lyricPosterThreeRowBottomYValue"],
    ["lyricPosterThreeRowTightness", "lyricPosterThreeRowTightnessValue"],
    ["lyricPosterThreeRowPerspective", "lyricPosterThreeRowPerspectiveValue"],
    ["lyricPosterThreeRowTilt", "lyricPosterThreeRowTiltValue"],
    ["lyricPosterTwoRowTopTextTopLeftX", "lyricPosterTwoRowTopTextTopLeftXValue"],
    ["lyricPosterTwoRowTopTextTopLeftY", "lyricPosterTwoRowTopTextTopLeftYValue"],
    ["lyricPosterTwoRowTopTextTopRightX", "lyricPosterTwoRowTopTextTopRightXValue"],
    ["lyricPosterTwoRowTopTextTopRightY", "lyricPosterTwoRowTopTextTopRightYValue"],
    ["lyricPosterTwoRowTopTextBottomLeftX", "lyricPosterTwoRowTopTextBottomLeftXValue"],
    ["lyricPosterTwoRowTopTextBottomLeftY", "lyricPosterTwoRowTopTextBottomLeftYValue"],
    ["lyricPosterTwoRowTopTextBottomRightX", "lyricPosterTwoRowTopTextBottomRightXValue"],
    ["lyricPosterTwoRowTopTextBottomRightY", "lyricPosterTwoRowTopTextBottomRightYValue"],
    ["lyricPosterTwoRowBottomTextTopLeftX", "lyricPosterTwoRowBottomTextTopLeftXValue"],
    ["lyricPosterTwoRowBottomTextTopLeftY", "lyricPosterTwoRowBottomTextTopLeftYValue"],
    ["lyricPosterTwoRowBottomTextTopRightX", "lyricPosterTwoRowBottomTextTopRightXValue"],
    ["lyricPosterTwoRowBottomTextTopRightY", "lyricPosterTwoRowBottomTextTopRightYValue"],
    ["lyricPosterTwoRowBottomTextBottomLeftX", "lyricPosterTwoRowBottomTextBottomLeftXValue"],
    ["lyricPosterTwoRowBottomTextBottomLeftY", "lyricPosterTwoRowBottomTextBottomLeftYValue"],
    ["lyricPosterTwoRowBottomTextBottomRightX", "lyricPosterTwoRowBottomTextBottomRightXValue"],
    ["lyricPosterTwoRowBottomTextBottomRightY", "lyricPosterTwoRowBottomTextBottomRightYValue"],
    ["lyricPosterThreeRowTopTextTopLeftX", "lyricPosterThreeRowTopTextTopLeftXValue"],
    ["lyricPosterThreeRowTopTextTopLeftY", "lyricPosterThreeRowTopTextTopLeftYValue"],
    ["lyricPosterThreeRowTopTextTopRightX", "lyricPosterThreeRowTopTextTopRightXValue"],
    ["lyricPosterThreeRowTopTextTopRightY", "lyricPosterThreeRowTopTextTopRightYValue"],
    ["lyricPosterThreeRowTopTextBottomLeftX", "lyricPosterThreeRowTopTextBottomLeftXValue"],
    ["lyricPosterThreeRowTopTextBottomLeftY", "lyricPosterThreeRowTopTextBottomLeftYValue"],
    ["lyricPosterThreeRowTopTextBottomRightX", "lyricPosterThreeRowTopTextBottomRightXValue"],
    ["lyricPosterThreeRowTopTextBottomRightY", "lyricPosterThreeRowTopTextBottomRightYValue"],
    ["lyricPosterThreeRowMiddleTextTopLeftX", "lyricPosterThreeRowMiddleTextTopLeftXValue"],
    ["lyricPosterThreeRowMiddleTextTopLeftY", "lyricPosterThreeRowMiddleTextTopLeftYValue"],
    ["lyricPosterThreeRowMiddleTextTopRightX", "lyricPosterThreeRowMiddleTextTopRightXValue"],
    ["lyricPosterThreeRowMiddleTextTopRightY", "lyricPosterThreeRowMiddleTextTopRightYValue"],
    ["lyricPosterThreeRowMiddleTextBottomLeftX", "lyricPosterThreeRowMiddleTextBottomLeftXValue"],
    ["lyricPosterThreeRowMiddleTextBottomLeftY", "lyricPosterThreeRowMiddleTextBottomLeftYValue"],
    ["lyricPosterThreeRowMiddleTextBottomRightX", "lyricPosterThreeRowMiddleTextBottomRightXValue"],
    ["lyricPosterThreeRowMiddleTextBottomRightY", "lyricPosterThreeRowMiddleTextBottomRightYValue"],
    ["lyricPosterThreeRowBottomTextTopLeftX", "lyricPosterThreeRowBottomTextTopLeftXValue"],
    ["lyricPosterThreeRowBottomTextTopLeftY", "lyricPosterThreeRowBottomTextTopLeftYValue"],
    ["lyricPosterThreeRowBottomTextTopRightX", "lyricPosterThreeRowBottomTextTopRightXValue"],
    ["lyricPosterThreeRowBottomTextTopRightY", "lyricPosterThreeRowBottomTextTopRightYValue"],
    ["lyricPosterThreeRowBottomTextBottomLeftX", "lyricPosterThreeRowBottomTextBottomLeftXValue"],
    ["lyricPosterThreeRowBottomTextBottomLeftY", "lyricPosterThreeRowBottomTextBottomLeftYValue"],
    ["lyricPosterThreeRowBottomTextBottomRightX", "lyricPosterThreeRowBottomTextBottomRightXValue"],
    ["lyricPosterThreeRowBottomTextBottomRightY", "lyricPosterThreeRowBottomTextBottomRightYValue"],
  ] as const;

  controls.forEach(([inputId, labelId]) => {
    const input = qs<HTMLInputElement>(`#${inputId}`);
    const key = inputId as keyof Omit<RoomUtilitySettings, "sceneFilter" | "lyricPosterMaxRows" | "lyricPosterTransition">;
    input.value = String(roomUtility[key]);
    setUtilityLabel(labelId, Number(input.value));

    input.addEventListener("input", () => {
      roomUtility = { ...roomUtility, [key]: Number(input.value) };
      setUtilityLabel(labelId, Number(input.value));
      if (String(key).startsWith("lyric")) lyricAnimationRevision += 1;
      applyRoomUtilitySettings();
    });
  });

  sceneFilter.addEventListener("change", () => {
    roomUtility = { ...roomUtility, sceneFilter: sceneFilter.value as SceneFilter };
    applyRoomUtilitySettings();
    saveRoomUtilitySettings();
  });

  lyricPosterMaxRows.addEventListener("change", () => {
    lyricAnimationRevision += 1;
    roomUtility = { ...roomUtility, lyricPosterMaxRows: lyricPosterMaxRows.value as RoomUtilitySettings["lyricPosterMaxRows"] };
    applyRoomUtilitySettings();
  });

  lyricPosterTransition.addEventListener("change", () => {
    lyricAnimationRevision += 1;
    roomUtility = { ...roomUtility, lyricPosterTransition: lyricPosterTransition.value as RoomUtilitySettings["lyricPosterTransition"] };
    applyRoomUtilitySettings();
  });

  lyricPosterStrokeColor.addEventListener("input", () => {
    roomUtility = { ...roomUtility, lyricPosterStrokeColor: lyricPosterStrokeColor.value };
    applyRoomUtilitySettings();
  });

  lyricPosterFillColor.addEventListener("input", () => {
    roomUtility = { ...roomUtility, lyricPosterFillColor: lyricPosterFillColor.value };
    applyRoomUtilitySettings();
  });

  [
    [lyricPosterEffectDropShadow, "lyricPosterEffectDropShadow"],
    [lyricPosterEffectEmboss, "lyricPosterEffectEmboss"],
    [lyricPosterEffectInsetEmboss, "lyricPosterEffectInsetEmboss"],
    [lyricPosterEffectBevel, "lyricPosterEffectBevel"],
    [lyricPosterEffectSoftBlur, "lyricPosterEffectSoftBlur"],
  ].forEach(([checkbox, key]) => {
    (checkbox as HTMLInputElement).addEventListener("change", () => {
      roomUtility = { ...roomUtility, [key as keyof RoomUtilitySettings]: (checkbox as HTMLInputElement).checked };
      applyRoomUtilitySettings();
    });
  });

  qs<HTMLButtonElement>("#saveRoomUtility").addEventListener("click", () => {
    saveRoomUtilitySettings();
    applyRoomUtilitySettings();
  });

  qs<HTMLButtonElement>("#resetRoomUtility").addEventListener("click", () => {
    roomUtility = { ...DEFAULT_ROOM_UTILITY };
    sceneFilter.value = roomUtility.sceneFilter;
    lyricPosterMaxRows.value = roomUtility.lyricPosterMaxRows;
    lyricPosterTransition.value = roomUtility.lyricPosterTransition;
    lyricPosterStrokeColor.value = roomUtility.lyricPosterStrokeColor;
    lyricPosterFillColor.value = roomUtility.lyricPosterFillColor;
    lyricPosterEffectDropShadow.checked = roomUtility.lyricPosterEffectDropShadow;
    lyricPosterEffectEmboss.checked = roomUtility.lyricPosterEffectEmboss;
    lyricPosterEffectInsetEmboss.checked = roomUtility.lyricPosterEffectInsetEmboss;
    lyricPosterEffectBevel.checked = roomUtility.lyricPosterEffectBevel;
    lyricPosterEffectSoftBlur.checked = roomUtility.lyricPosterEffectSoftBlur;

    controls.forEach(([inputId, labelId]) => {
      const input = qs<HTMLInputElement>(`#${inputId}`);
      const key = inputId as keyof Omit<RoomUtilitySettings, "sceneFilter" | "lyricPosterMaxRows" | "lyricPosterTransition">;
      input.value = String(roomUtility[key]);
      setUtilityLabel(labelId, Number(input.value));
    });

    lyricAnimationRevision += 1;
    saveRoomUtilitySettings();
        panelHeightAdjustEnabled.checked = roomUtility.panelHeightAdjustEnabled;
    applyRoomUtilitySettings();
  });
}

function hexToRgbParts(hex: string): string {
  const normalized = hex.replace("#", "").trim();

  if (/^[0-9a-fA-F]{3}$/.test(normalized)) {
    return normalized
      .split("")
      .map((char) => parseInt(`${char}${char}`, 16))
      .join(", ");
  }

  if (/^[0-9a-fA-F]{6}$/.test(normalized)) {
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return `${r}, ${g}, ${b}`;
  }

  return "0, 0, 0";
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function applyRoomUtilitySettings(): void {
  const root = document.documentElement;

  root.style.setProperty("--speaker-left-x", `${roomUtility.speakerLeftX}%`);
  root.style.setProperty("--speaker-right-x", `${roomUtility.speakerRightX}%`);
  root.style.setProperty("--speaker-y", `${roomUtility.speakerY}%`);
  root.style.setProperty("--speaker-scale", String(roomUtility.speakerScale));
  root.style.setProperty("--speaker-opacity", String(roomUtility.speakerOpacity));
  root.style.setProperty("--speaker-pulse", String(roomUtility.speakerPulse));
  root.style.setProperty("--speaker-pulse-x", `${roomUtility.speakerPulseX}%`);
  root.style.setProperty("--speaker-pulse-y", `${roomUtility.speakerPulseY}%`);
  root.style.setProperty("--speaker-pulse-size", `${roomUtility.speakerPulseSize}%`);
  root.style.setProperty("--speaker-warp-opacity", String(roomUtility.speakerWarpOpacity));
  root.style.setProperty("--scene-filter-strength", String(roomUtility.filterStrength));
  root.style.setProperty("--scene-vignette-strength", String(roomUtility.vignetteStrength));
  root.style.setProperty("--shadow-opacity", String(roomUtility.shadowOpacity));
  root.style.setProperty("--table-shadow-scale", String(roomUtility.tableShadowScale));
  root.style.setProperty("--floor-controls-idle-opacity", String(roomUtility.floorControlsIdleOpacity));
  root.style.setProperty("--panel-start-y", `${roomUtility.panelStartY}%`);
  root.style.setProperty("--panel-start-y-ratio", String(roomUtility.panelStartY / 100));
  root.classList.toggle("panel-height-adjust-enabled", roomUtility.panelHeightAdjustEnabled);

  const filterOverlay = document.querySelector<HTMLElement>("#roomFilterOverlay");
  if (filterOverlay) {
    filterOverlay.className = `room-filter-overlay ${roomUtility.sceneFilter}`;
  }

  root.style.setProperty("--lyric-poster-guide-opacity", String(roomUtility.lyricPosterGuideOpacity));
  root.style.setProperty("--lyric-poster-center-guide-opacity", String(roomUtility.lyricPosterCenterGuideOpacity));
  root.style.setProperty("--lyric-poster-short-guide-opacity", String(roomUtility.lyricPosterShortGuideOpacity));
  root.style.setProperty("--lyric-poster-short-tl-x", `${roomUtility.lyricPosterShortTopLeftX}px`);
  root.style.setProperty("--lyric-poster-short-tl-y", `${roomUtility.lyricPosterShortTopLeftY}px`);
  root.style.setProperty("--lyric-poster-short-tr-x", `${roomUtility.lyricPosterShortTopRightX}px`);
  root.style.setProperty("--lyric-poster-short-tr-y", `${roomUtility.lyricPosterShortTopRightY}px`);
  root.style.setProperty("--lyric-poster-short-bl-x", `${roomUtility.lyricPosterShortBottomLeftX}px`);
  root.style.setProperty("--lyric-poster-short-bl-y", `${roomUtility.lyricPosterShortBottomLeftY}px`);
  root.style.setProperty("--lyric-poster-short-br-x", `${roomUtility.lyricPosterShortBottomRightX}px`);
  root.style.setProperty("--lyric-poster-short-br-y", `${roomUtility.lyricPosterShortBottomRightY}px`);
  root.style.setProperty("--lyric-poster-short-vertical-stretch", String(roomUtility.lyricPosterShortVerticalStretch));
  root.style.setProperty("--lyric-poster-short-perspective", String(roomUtility.lyricPosterShortPerspective));
  root.style.setProperty("--lyric-poster-short-tilt", `${roomUtility.lyricPosterShortTilt}deg`);
  root.style.setProperty("--lyric-poster-short-text-tl-x", `${roomUtility.lyricPosterShortTextTopLeftX}px`);
  root.style.setProperty("--lyric-poster-short-text-tl-y", `${roomUtility.lyricPosterShortTextTopLeftY}px`);
  root.style.setProperty("--lyric-poster-short-text-tr-x", `${roomUtility.lyricPosterShortTextTopRightX}px`);
  root.style.setProperty("--lyric-poster-short-text-tr-y", `${roomUtility.lyricPosterShortTextTopRightY}px`);
  root.style.setProperty("--lyric-poster-short-text-bl-x", `${roomUtility.lyricPosterShortTextBottomLeftX}px`);
  root.style.setProperty("--lyric-poster-short-text-bl-y", `${roomUtility.lyricPosterShortTextBottomLeftY}px`);
  root.style.setProperty("--lyric-poster-short-text-br-x", `${roomUtility.lyricPosterShortTextBottomRightX}px`);
  root.style.setProperty("--lyric-poster-short-text-br-y", `${roomUtility.lyricPosterShortTextBottomRightY}px`);
  root.style.setProperty("--lyric-poster-two-row-band-guide-opacity", String(roomUtility.lyricPosterTwoRowBandGuideOpacity));
  root.style.setProperty("--lyric-poster-three-row-band-guide-opacity", String(roomUtility.lyricPosterThreeRowBandGuideOpacity));
  root.style.setProperty("--lyric-poster-top-left-x", `${roomUtility.lyricPosterTopLeftX}px`);
  root.style.setProperty("--lyric-poster-top-left-y", `${roomUtility.lyricPosterTopLeftY}px`);
  root.style.setProperty("--lyric-poster-top-right-x", `${roomUtility.lyricPosterTopRightX}px`);
  root.style.setProperty("--lyric-poster-top-right-y", `${roomUtility.lyricPosterTopRightY}px`);
  root.style.setProperty("--lyric-poster-bottom-left-x", `${roomUtility.lyricPosterBottomLeftX}px`);
  root.style.setProperty("--lyric-poster-bottom-left-y", `${roomUtility.lyricPosterBottomLeftY}px`);
  root.style.setProperty("--lyric-poster-bottom-right-x", `${roomUtility.lyricPosterBottomRightX}px`);
  root.style.setProperty("--lyric-poster-bottom-right-y", `${roomUtility.lyricPosterBottomRightY}px`);
  root.style.setProperty("--lyric-poster-stroke", `${roomUtility.lyricPosterStroke}px`);
  root.style.setProperty("--lyric-poster-stroke-color", roomUtility.lyricPosterStrokeColor);
  root.style.setProperty("--lyric-poster-fill-color", roomUtility.lyricPosterFillColor);
  root.style.setProperty("--lyric-poster-stroke-opacity", String(roomUtility.lyricPosterStrokeOpacity));
  root.style.setProperty("--lyric-poster-fill-opacity", String(roomUtility.lyricPosterFillOpacity));
  root.style.setProperty("--lyric-poster-glow", String(roomUtility.lyricPosterGlow));
  root.style.setProperty("--lyric-poster-one-row-vertical-stretch", String(roomUtility.lyricPosterOneRowVerticalStretch));
  root.style.setProperty("--lyric-poster-one-row-tightness", String(roomUtility.lyricPosterOneRowTightness));
  root.style.setProperty("--lyric-poster-one-row-perspective", String(roomUtility.lyricPosterOneRowPerspective));
  root.style.setProperty("--lyric-poster-one-row-tilt", String(roomUtility.lyricPosterOneRowTilt));
  root.style.setProperty("--lyric-poster-one-row-text-top-left-x", `${roomUtility.lyricPosterOneRowTextTopLeftX}px`);
  root.style.setProperty("--lyric-poster-one-row-text-top-left-y", `${roomUtility.lyricPosterOneRowTextTopLeftY}px`);
  root.style.setProperty("--lyric-poster-one-row-text-top-right-x", `${roomUtility.lyricPosterOneRowTextTopRightX}px`);
  root.style.setProperty("--lyric-poster-one-row-text-top-right-y", `${roomUtility.lyricPosterOneRowTextTopRightY}px`);
  root.style.setProperty("--lyric-poster-one-row-text-bottom-left-x", `${roomUtility.lyricPosterOneRowTextBottomLeftX}px`);
  root.style.setProperty("--lyric-poster-one-row-text-bottom-left-y", `${roomUtility.lyricPosterOneRowTextBottomLeftY}px`);
  root.style.setProperty("--lyric-poster-one-row-text-bottom-right-x", `${roomUtility.lyricPosterOneRowTextBottomRightX}px`);
  root.style.setProperty("--lyric-poster-one-row-text-bottom-right-y", `${roomUtility.lyricPosterOneRowTextBottomRightY}px`);
  root.style.setProperty("--lyric-poster-two-row-vertical-stretch", String(roomUtility.lyricPosterTwoRowVerticalStretch));
  root.style.setProperty("--lyric-poster-two-row-top-band-top-y", `${roomUtility.lyricPosterTwoRowTopBandTopY}px`);
  root.style.setProperty("--lyric-poster-two-row-top-band-bottom-y", `${roomUtility.lyricPosterTwoRowTopBandBottomY}px`);
  root.style.setProperty("--lyric-poster-two-row-bottom-band-top-y", `${roomUtility.lyricPosterTwoRowBottomBandTopY}px`);
  root.style.setProperty("--lyric-poster-two-row-bottom-band-bottom-y", `${roomUtility.lyricPosterTwoRowBottomBandBottomY}px`);
  root.style.setProperty("--lyric-poster-two-row-top-y", `${roomUtility.lyricPosterTwoRowTopY}px`);
  root.style.setProperty("--lyric-poster-two-row-bottom-y", `${roomUtility.lyricPosterTwoRowBottomY}px`);
  root.style.setProperty("--lyric-poster-two-row-tightness", String(roomUtility.lyricPosterTwoRowTightness));
  root.style.setProperty("--lyric-poster-two-row-perspective", String(roomUtility.lyricPosterTwoRowPerspective));
  root.style.setProperty("--lyric-poster-two-row-tilt", String(roomUtility.lyricPosterTwoRowTilt));
  root.style.setProperty("--lyric-poster-three-row-vertical-stretch", String(roomUtility.lyricPosterThreeRowVerticalStretch));
  root.style.setProperty("--lyric-poster-three-row-top-band-top-y", `${roomUtility.lyricPosterThreeRowTopBandTopY}px`);
  root.style.setProperty("--lyric-poster-three-row-top-band-bottom-y", `${roomUtility.lyricPosterThreeRowTopBandBottomY}px`);
  root.style.setProperty("--lyric-poster-three-row-middle-band-top-y", `${roomUtility.lyricPosterThreeRowMiddleBandTopY}px`);
  root.style.setProperty("--lyric-poster-three-row-middle-band-bottom-y", `${roomUtility.lyricPosterThreeRowMiddleBandBottomY}px`);
  root.style.setProperty("--lyric-poster-three-row-bottom-band-top-y", `${roomUtility.lyricPosterThreeRowBottomBandTopY}px`);
  root.style.setProperty("--lyric-poster-three-row-bottom-band-bottom-y", `${roomUtility.lyricPosterThreeRowBottomBandBottomY}px`);
  root.style.setProperty("--lyric-poster-three-row-top-y", `${roomUtility.lyricPosterThreeRowTopY}px`);
  root.style.setProperty("--lyric-poster-three-row-middle-y", `${roomUtility.lyricPosterThreeRowMiddleY}px`);
  root.style.setProperty("--lyric-poster-three-row-bottom-y", `${roomUtility.lyricPosterThreeRowBottomY}px`);
  root.style.setProperty("--lyric-poster-three-row-tightness", String(roomUtility.lyricPosterThreeRowTightness));
  root.style.setProperty("--lyric-poster-three-row-perspective", String(roomUtility.lyricPosterThreeRowPerspective));
  root.style.setProperty("--lyric-poster-three-row-tilt", String(roomUtility.lyricPosterThreeRowTilt));
  root.style.setProperty("--lyric-poster-two-row-top-text-top-left-x", `${roomUtility.lyricPosterTwoRowTopTextTopLeftX}px`);
  root.style.setProperty("--lyric-poster-two-row-top-text-top-left-y", `${roomUtility.lyricPosterTwoRowTopTextTopLeftY}px`);
  root.style.setProperty("--lyric-poster-two-row-top-text-top-right-x", `${roomUtility.lyricPosterTwoRowTopTextTopRightX}px`);
  root.style.setProperty("--lyric-poster-two-row-top-text-top-right-y", `${roomUtility.lyricPosterTwoRowTopTextTopRightY}px`);
  root.style.setProperty("--lyric-poster-two-row-top-text-bottom-left-x", `${roomUtility.lyricPosterTwoRowTopTextBottomLeftX}px`);
  root.style.setProperty("--lyric-poster-two-row-top-text-bottom-left-y", `${roomUtility.lyricPosterTwoRowTopTextBottomLeftY}px`);
  root.style.setProperty("--lyric-poster-two-row-top-text-bottom-right-x", `${roomUtility.lyricPosterTwoRowTopTextBottomRightX}px`);
  root.style.setProperty("--lyric-poster-two-row-top-text-bottom-right-y", `${roomUtility.lyricPosterTwoRowTopTextBottomRightY}px`);
  root.style.setProperty("--lyric-poster-two-row-bottom-text-top-left-x", `${roomUtility.lyricPosterTwoRowBottomTextTopLeftX}px`);
  root.style.setProperty("--lyric-poster-two-row-bottom-text-top-left-y", `${roomUtility.lyricPosterTwoRowBottomTextTopLeftY}px`);
  root.style.setProperty("--lyric-poster-two-row-bottom-text-top-right-x", `${roomUtility.lyricPosterTwoRowBottomTextTopRightX}px`);
  root.style.setProperty("--lyric-poster-two-row-bottom-text-top-right-y", `${roomUtility.lyricPosterTwoRowBottomTextTopRightY}px`);
  root.style.setProperty("--lyric-poster-two-row-bottom-text-bottom-left-x", `${roomUtility.lyricPosterTwoRowBottomTextBottomLeftX}px`);
  root.style.setProperty("--lyric-poster-two-row-bottom-text-bottom-left-y", `${roomUtility.lyricPosterTwoRowBottomTextBottomLeftY}px`);
  root.style.setProperty("--lyric-poster-two-row-bottom-text-bottom-right-x", `${roomUtility.lyricPosterTwoRowBottomTextBottomRightX}px`);
  root.style.setProperty("--lyric-poster-two-row-bottom-text-bottom-right-y", `${roomUtility.lyricPosterTwoRowBottomTextBottomRightY}px`);
  root.style.setProperty("--lyric-poster-three-row-top-text-top-left-x", `${roomUtility.lyricPosterThreeRowTopTextTopLeftX}px`);
  root.style.setProperty("--lyric-poster-three-row-top-text-top-left-y", `${roomUtility.lyricPosterThreeRowTopTextTopLeftY}px`);
  root.style.setProperty("--lyric-poster-three-row-top-text-top-right-x", `${roomUtility.lyricPosterThreeRowTopTextTopRightX}px`);
  root.style.setProperty("--lyric-poster-three-row-top-text-top-right-y", `${roomUtility.lyricPosterThreeRowTopTextTopRightY}px`);
  root.style.setProperty("--lyric-poster-three-row-top-text-bottom-left-x", `${roomUtility.lyricPosterThreeRowTopTextBottomLeftX}px`);
  root.style.setProperty("--lyric-poster-three-row-top-text-bottom-left-y", `${roomUtility.lyricPosterThreeRowTopTextBottomLeftY}px`);
  root.style.setProperty("--lyric-poster-three-row-top-text-bottom-right-x", `${roomUtility.lyricPosterThreeRowTopTextBottomRightX}px`);
  root.style.setProperty("--lyric-poster-three-row-top-text-bottom-right-y", `${roomUtility.lyricPosterThreeRowTopTextBottomRightY}px`);
  root.style.setProperty("--lyric-poster-three-row-middle-text-top-left-x", `${roomUtility.lyricPosterThreeRowMiddleTextTopLeftX}px`);
  root.style.setProperty("--lyric-poster-three-row-middle-text-top-left-y", `${roomUtility.lyricPosterThreeRowMiddleTextTopLeftY}px`);
  root.style.setProperty("--lyric-poster-three-row-middle-text-top-right-x", `${roomUtility.lyricPosterThreeRowMiddleTextTopRightX}px`);
  root.style.setProperty("--lyric-poster-three-row-middle-text-top-right-y", `${roomUtility.lyricPosterThreeRowMiddleTextTopRightY}px`);
  root.style.setProperty("--lyric-poster-three-row-middle-text-bottom-left-x", `${roomUtility.lyricPosterThreeRowMiddleTextBottomLeftX}px`);
  root.style.setProperty("--lyric-poster-three-row-middle-text-bottom-left-y", `${roomUtility.lyricPosterThreeRowMiddleTextBottomLeftY}px`);
  root.style.setProperty("--lyric-poster-three-row-middle-text-bottom-right-x", `${roomUtility.lyricPosterThreeRowMiddleTextBottomRightX}px`);
  root.style.setProperty("--lyric-poster-three-row-middle-text-bottom-right-y", `${roomUtility.lyricPosterThreeRowMiddleTextBottomRightY}px`);
  root.style.setProperty("--lyric-poster-three-row-bottom-text-top-left-x", `${roomUtility.lyricPosterThreeRowBottomTextTopLeftX}px`);
  root.style.setProperty("--lyric-poster-three-row-bottom-text-top-left-y", `${roomUtility.lyricPosterThreeRowBottomTextTopLeftY}px`);
  root.style.setProperty("--lyric-poster-three-row-bottom-text-top-right-x", `${roomUtility.lyricPosterThreeRowBottomTextTopRightX}px`);
  root.style.setProperty("--lyric-poster-three-row-bottom-text-top-right-y", `${roomUtility.lyricPosterThreeRowBottomTextTopRightY}px`);
  root.style.setProperty("--lyric-poster-three-row-bottom-text-bottom-left-x", `${roomUtility.lyricPosterThreeRowBottomTextBottomLeftX}px`);
  root.style.setProperty("--lyric-poster-three-row-bottom-text-bottom-left-y", `${roomUtility.lyricPosterThreeRowBottomTextBottomLeftY}px`);
  root.style.setProperty("--lyric-poster-three-row-bottom-text-bottom-right-x", `${roomUtility.lyricPosterThreeRowBottomTextBottomRightX}px`);
  root.style.setProperty("--lyric-poster-three-row-bottom-text-bottom-right-y", `${roomUtility.lyricPosterThreeRowBottomTextBottomRightY}px`);
  root.style.setProperty("--lyric-poster-max-rows", roomUtility.lyricPosterMaxRows);
  root.style.setProperty("--lyric-poster-row-breakpoint", String(roomUtility.lyricPosterRowBreakpoint));
  root.style.setProperty("--lyric-poster-transition", roomUtility.lyricPosterTransition);
  root.style.setProperty("--lyrics-animation-revision", String(lyricAnimationRevision));

  root.classList.toggle("lyric-poster-transition-none", roomUtility.lyricPosterTransition === "none");
  root.classList.toggle("lyric-poster-transition-push", roomUtility.lyricPosterTransition === "push-slide");
  root.classList.toggle("lyric-poster-transition-fade", roomUtility.lyricPosterTransition === "fade-slide");
  root.classList.toggle("lyric-poster-transition-shadow-slide", roomUtility.lyricPosterTransition === "shadow-slide");
  root.classList.toggle("lyric-poster-transition-ceiling-stamp", roomUtility.lyricPosterTransition === "ceiling-stamp");
  root.classList.toggle("lyric-poster-transition-soft-dissolve", roomUtility.lyricPosterTransition === "soft-dissolve");
  root.classList.toggle("lyric-poster-transition-ghost-drift", roomUtility.lyricPosterTransition === "ghost-drift");
  root.classList.toggle("lyric-poster-transition-back-push", roomUtility.lyricPosterTransition === "back-push");
  root.classList.toggle("lyric-poster-effect-drop-shadow", roomUtility.lyricPosterEffectDropShadow);
  root.classList.toggle("lyric-poster-effect-emboss", roomUtility.lyricPosterEffectEmboss);
  root.classList.toggle("lyric-poster-effect-inset-emboss", roomUtility.lyricPosterEffectInsetEmboss);
  root.classList.toggle("lyric-poster-effect-bevel", roomUtility.lyricPosterEffectBevel);
  root.classList.toggle("lyric-poster-effect-soft-blur", roomUtility.lyricPosterEffectSoftBlur);
}

function updateSpeakerPulse(isPlaying: boolean): void {
  const left = qs<HTMLElement>("#leftSpeaker");
  const right = qs<HTMLElement>("#rightSpeaker");
  left.classList.toggle("playing", isPlaying);
  right.classList.toggle("playing", isPlaying);
}

function setUtilityLabel(id: string, value: number): void {
  const decimals =
    id.includes("Opacity") ||
    id.includes("Scale") ||
    id.includes("Tightness") ||
    id.includes("Strength") ||
    id.includes("Stretch") ||
    id.includes("Perspective")
      ? 2
      : id.includes("Stroke")
        ? 1
        : 0;
  qs(`#${id}`).textContent = value.toFixed(decimals);
}

function loadRoomUtilitySettings(): RoomUtilitySettings {
  try {
    const raw = window.localStorage.getItem(ROOM_UTILITY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<RoomUtilitySettings>;
      return { ...DEFAULT_ROOM_UTILITY, ...parsed };
    }
  } catch (error) {
    console.warn("Could not load Pocket DJ room utility settings", error);
  }

  return { ...DEFAULT_ROOM_UTILITY };
}

function saveRoomUtilitySettings(): void {
  window.localStorage.setItem(ROOM_UTILITY_KEY, JSON.stringify(roomUtility));
}


async function refreshLyricsForCurrentTrack(): Promise<void> {
  const track = state.playback;
  const key = getLyricsTrackKey(track);

  if (!key || track.source === "none") {
    lyricsState = emptyLyrics("idle");
    lyricsFetchKey = "";
    updateLyricsCeiling(lyricsState, 0, -1, lyricsEnabled, false);
    return;
  }

  if (key === lyricsFetchKey) return;

  lyricsFetchKey = key;
  lyricsState = { ...emptyLyrics("loading"), trackKey: key };
  updateLyricsCeiling(lyricsState, getEstimatedPlaybackProgress(track), -1, lyricsEnabled, state.playback.isPlaying || state.playback.source === "demo");

  lyricsState = await fetchLyricsForTrack(track);
  const lyricProgressMs = getEstimatedPlaybackProgress(track);
  const activeLyricIndex = getActiveLyricIndex(lyricsState.syncedLyrics, lyricProgressMs);
  updateLyricsCeiling(lyricsState, lyricProgressMs, activeLyricIndex, lyricsEnabled, state.playback.isPlaying || state.playback.source === "demo");
}

async function pollSpotifyNow(): Promise<void> {
  if (useDemo) return;
  if (!state.spotifyClientId) return;

  try {
    lastPollError = "";
    state.playback = await getCurrentlyPlaying(state.spotifyClientId);
    updatePlaybackUi(state.playback, state.debugOpen);
    void refreshLyricsForCurrentTrack();

    if (state.playback.isAuthenticated && !panelAutoHiddenAfterConnect) {
      panelAutoHiddenAfterConnect = true;
      window.setTimeout(() => setControlPanelOpen(false), 900);
    }
  } catch (error) {
    lastPollError = error instanceof Error ? error.message : String(error);
    console.warn(lastPollError);
  } finally {
    // Keep visible-page polling fast so the DJ state changes quickly when Spotify starts,
    // pauses, stops, or switches tracks. The previous 7s/18s visible intervals made
    // idle-to-active and active-to-idle transitions feel delayed.
    const interval = document.hidden ? 45_000 : 2_500;
    scheduleNextPoll(interval);
  }
}

function scheduleNextPoll(delayMs: number): void {
  if (pollTimer) window.clearTimeout(pollTimer);
  pollTimer = window.setTimeout(() => void pollSpotifyNow(), delayMs);
}

function tick(): void {
  if (useDemo) {
    state.playback = getDemoTrack();
  }
  state.djMode = dj.update(state.playback);
  updateSpeakerPulse(state.playback.isPlaying || state.playback.source === "demo");
  updatePlaybackUi(state.playback, state.debugOpen);

  const lyricProgressMs = getEstimatedPlaybackProgress(state.playback);
  const activeLyricIndex = getActiveLyricIndex(lyricsState.syncedLyrics, lyricProgressMs);
  updateLyricsCeiling(lyricsState, lyricProgressMs, activeLyricIndex, lyricsEnabled, state.playback.isPlaying || state.playback.source === "demo");

  requestAnimationFrame(tick);
}

void boot();
