import "./styles.css";
import { DjController } from "./dj/djController";
import { getDemoTrack, stopDemo, toggleDemo } from "./demo";
import { emptyTrack, type AppState } from "./state/types";
import { disconnectSpotify, getCurrentlyPlaying, getDefaultRedirectUri, handleSpotifyCallback, nextSpotifyTrack, pauseSpotify, playSpotify, previousSpotifyTrack, seekSpotify, setSpotifyRepeat, setSpotifyShuffle, setSpotifyVolume, startSpotifyLogin } from "./spotify/spotifyClient";
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
  lyricPosterStroke: number;
  lyricPosterStrokeOpacity: number;
  lyricPosterFillOpacity: number;
  lyricPosterGlow: number;
  lyricPosterOverallY: number;
  lyricPosterOverallScale: number;
  lyricPosterRowTightness: number;
  lyricPosterPerspectiveStrength: number;
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
  lyricPosterTwoRowTightness: number;
  lyricPosterTwoRowPerspective: number;
  lyricPosterTwoRowTilt: number;
  lyricPosterThreeRowVerticalStretch: number;
  lyricPosterThreeRowTightness: number;
  lyricPosterThreeRowPerspective: number;
  lyricPosterThreeRowTilt: number;
  lyricPosterMaxRows: "auto" | "1" | "2" | "3";
  lyricPosterTransition: "push-slide" | "fade-slide";
};

const DEFAULT_ROOM_UTILITY: RoomUtilitySettings = {
  speakerLeftX: 36.9,
  speakerRightX: 64.9,
  speakerY: 70.5,
  speakerScale: 1.47,
  speakerOpacity: 1.00,
  speakerPulse: 0.50,
  speakerPulseX: 50.9,
  speakerPulseY: 48.8,
  speakerPulseSize: 55.3,
  speakerWarpOpacity: 1.00,
  sceneFilter: "neon-purple",
  filterStrength: 0.20,
  vignetteStrength: 0.20,
  shadowOpacity: 1.00,
  tableShadowScale: 1.16,
  lyricPosterTopLeftX: 221,
  lyricPosterTopLeftY: 17,
  lyricPosterTopRightX: 1562,
  lyricPosterTopRightY: 3,
  lyricPosterBottomLeftX: 454,
  lyricPosterBottomLeftY: 189,
  lyricPosterBottomRightX: 1343,
  lyricPosterBottomRightY: 189,
  lyricPosterGuideOpacity: 0.00,
  lyricPosterCenterGuideOpacity: 0.00,
  lyricPosterStroke: 2.4,
  lyricPosterStrokeOpacity: 0.52,
  lyricPosterFillOpacity: 0,
  lyricPosterGlow: 0,
  lyricPosterOverallY: 22,
  lyricPosterOverallScale: 0.80,
  lyricPosterRowTightness: -0.30,
  lyricPosterPerspectiveStrength: 2.25,
  lyricPosterOneRowVerticalStretch: 0.87,
  lyricPosterOneRowTightness: 0.00,
  lyricPosterOneRowPerspective: 1.33,
  lyricPosterOneRowTilt: -32,
  lyricPosterOneRowTextTopLeftX: 0,
  lyricPosterOneRowTextTopLeftY: 0,
  lyricPosterOneRowTextTopRightX: 0,
  lyricPosterOneRowTextTopRightY: 0,
  lyricPosterOneRowTextBottomLeftX: 0,
  lyricPosterOneRowTextBottomLeftY: 0,
  lyricPosterOneRowTextBottomRightX: 0,
  lyricPosterOneRowTextBottomRightY: 0,
  lyricPosterTwoRowVerticalStretch: 0.93,
  lyricPosterTwoRowTightness: 0.45,
  lyricPosterTwoRowPerspective: 1.00,
  lyricPosterTwoRowTilt: -10,
  lyricPosterThreeRowVerticalStretch: 0.51,
  lyricPosterThreeRowTightness: 0.52,
  lyricPosterThreeRowPerspective: 1.00,
  lyricPosterThreeRowTilt: -12,
  lyricPosterMaxRows: "auto",
  lyricPosterTransition: "push-slide"
};

const ROOM_UTILITY_KEY = "pocketdj-room-utility-v31";
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
    updateLyricsCeiling(lyricsState, lyricProgressMs, activeLyricIndex, lyricsEnabled);
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
    openSidePanel(true);
  });
  sideTab.addEventListener("click", (event) => {
    event.stopPropagation();
    openSidePanel(true);
  });

  document.addEventListener("pointerdown", (event) => {
    closeSidePanelOnOutsidePointer(event);
  });

  bindFloorPlaybackControls();
  bindSeekControls();

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
  }, 10_000);
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
  const toggle = qs<HTMLButtonElement>("#floorControlsToggle");
  const floor = qs<HTMLElement>("#floorPlayer");

  toggle.addEventListener("click", () => {
    setFloorControlsOpen(!floorControlsOpen);
  });

  qs<HTMLButtonElement>("#floorControlsLock").addEventListener("click", () => {
    setFloorControlsLocked(!floorControlsLocked);
  });

  floor.addEventListener("mouseenter", () => {
    if (floorControlsHideTimer) window.clearTimeout(floorControlsHideTimer);
  });

  floor.addEventListener("mouseleave", () => {
    if (!floorControlsLocked) scheduleFloorControlsAutoHide();
  });

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
  floorControlsOpen = open;
  const floor = qs<HTMLElement>("#floorPlayer");
  const toggle = qs<HTMLButtonElement>("#floorControlsToggle");
  const lock = qs<HTMLButtonElement>("#floorControlsLock");

  floor.classList.toggle("floor-player-hidden", !open);
  floor.classList.toggle("floor-player-visible", open);
  toggle.classList.toggle("floor-controls-toggle-open", open);
  toggle.setAttribute("aria-expanded", String(open));

  lock.classList.toggle("floor-lock-hidden", !open);
  lock.classList.toggle("floor-lock-visible", open);
  lock.setAttribute("aria-hidden", String(!open));

  if (open && autoHide && !floorControlsLocked) scheduleFloorControlsAutoHide();
  if ((!open || floorControlsLocked) && floorControlsHideTimer) {
    window.clearTimeout(floorControlsHideTimer);
    floorControlsHideTimer = null;
  }
}

function setFloorControlsLocked(locked: boolean): void {
  floorControlsLocked = locked;
  const lock = qs<HTMLButtonElement>("#floorControlsLock");
  const floor = qs<HTMLElement>("#floorPlayer");
  const toggle = qs<HTMLButtonElement>("#floorControlsToggle");

  lock.classList.toggle("floor-lock-active", locked);
  floor.classList.toggle("floor-player-locked", locked);
  toggle.classList.toggle("floor-controls-toggle-locked", locked);
  lock.setAttribute("aria-pressed", String(locked));
  lock.setAttribute("title", locked ? "Unlock auto-hide controls" : "Lock controls open");
  lock.setAttribute("aria-label", locked ? "Unlock floor playback controls" : "Lock floor playback controls open");

  if (locked) {
    setFloorControlsOpen(true, false);
  } else if (floorControlsOpen) {
    scheduleFloorControlsAutoHide();
  }
}

function scheduleFloorControlsAutoHide(): void {
  if (floorControlsLocked) return;
  if (floorControlsHideTimer) window.clearTimeout(floorControlsHideTimer);
  floorControlsHideTimer = window.setTimeout(() => {
    if (!floorControlsLocked) setFloorControlsOpen(false);
  }, 10_000);
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

function bindRoomUtilityControls(): void {
  const sceneFilter = qs<HTMLSelectElement>("#sceneFilterSelect");
  const lyricPosterMaxRows = qs<HTMLSelectElement>("#lyricPosterMaxRows");
  const lyricPosterTransition = qs<HTMLSelectElement>("#lyricPosterTransition");

  sceneFilter.value = roomUtility.sceneFilter;
  lyricPosterMaxRows.value = roomUtility.lyricPosterMaxRows;
  lyricPosterTransition.value = roomUtility.lyricPosterTransition;

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
    ["lyricPosterGuideOpacity", "lyricPosterGuideOpacityValue"],
    ["lyricPosterCenterGuideOpacity", "lyricPosterCenterGuideOpacityValue"],
    ["lyricPosterTopLeftX", "lyricPosterTopLeftXValue"],
    ["lyricPosterTopLeftY", "lyricPosterTopLeftYValue"],
    ["lyricPosterTopRightX", "lyricPosterTopRightXValue"],
    ["lyricPosterTopRightY", "lyricPosterTopRightYValue"],
    ["lyricPosterBottomLeftX", "lyricPosterBottomLeftXValue"],
    ["lyricPosterBottomLeftY", "lyricPosterBottomLeftYValue"],
    ["lyricPosterBottomRightX", "lyricPosterBottomRightXValue"],
    ["lyricPosterBottomRightY", "lyricPosterBottomRightYValue"],
    ["lyricPosterStroke", "lyricPosterStrokeValue"],
    ["lyricPosterStrokeOpacity", "lyricPosterStrokeOpacityValue"],
    ["lyricPosterFillOpacity", "lyricPosterFillOpacityValue"],
    ["lyricPosterGlow", "lyricPosterGlowValue"],
    ["lyricPosterOverallY", "lyricPosterOverallYValue"],
    ["lyricPosterOverallScale", "lyricPosterOverallScaleValue"],
    ["lyricPosterRowTightness", "lyricPosterRowTightnessValue"],
    ["lyricPosterPerspectiveStrength", "lyricPosterPerspectiveStrengthValue"],
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
    ["lyricPosterTwoRowTightness", "lyricPosterTwoRowTightnessValue"],
    ["lyricPosterTwoRowPerspective", "lyricPosterTwoRowPerspectiveValue"],
    ["lyricPosterTwoRowTilt", "lyricPosterTwoRowTiltValue"],
    ["lyricPosterThreeRowVerticalStretch", "lyricPosterThreeRowVerticalStretchValue"],
    ["lyricPosterThreeRowTightness", "lyricPosterThreeRowTightnessValue"],
    ["lyricPosterThreeRowPerspective", "lyricPosterThreeRowPerspectiveValue"],
    ["lyricPosterThreeRowTilt", "lyricPosterThreeRowTiltValue"]
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

  qs<HTMLButtonElement>("#saveRoomUtility").addEventListener("click", () => {
    saveRoomUtilitySettings();
    applyRoomUtilitySettings();
  });

  qs<HTMLButtonElement>("#resetRoomUtility").addEventListener("click", () => {
    roomUtility = { ...DEFAULT_ROOM_UTILITY };
    sceneFilter.value = roomUtility.sceneFilter;
    lyricPosterMaxRows.value = roomUtility.lyricPosterMaxRows;
    lyricPosterTransition.value = roomUtility.lyricPosterTransition;

    controls.forEach(([inputId, labelId]) => {
      const input = qs<HTMLInputElement>(`#${inputId}`);
      const key = inputId as keyof Omit<RoomUtilitySettings, "sceneFilter" | "lyricPosterMaxRows" | "lyricPosterTransition">;
      input.value = String(roomUtility[key]);
      setUtilityLabel(labelId, Number(input.value));
    });

    lyricAnimationRevision += 1;
    saveRoomUtilitySettings();
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

  root.style.setProperty("--lyric-poster-guide-opacity", String(roomUtility.lyricPosterGuideOpacity));
  root.style.setProperty("--lyric-poster-center-guide-opacity", String(roomUtility.lyricPosterCenterGuideOpacity));
  root.style.setProperty("--lyric-poster-top-left-x", `${roomUtility.lyricPosterTopLeftX}px`);
  root.style.setProperty("--lyric-poster-top-left-y", `${roomUtility.lyricPosterTopLeftY}px`);
  root.style.setProperty("--lyric-poster-top-right-x", `${roomUtility.lyricPosterTopRightX}px`);
  root.style.setProperty("--lyric-poster-top-right-y", `${roomUtility.lyricPosterTopRightY}px`);
  root.style.setProperty("--lyric-poster-bottom-left-x", `${roomUtility.lyricPosterBottomLeftX}px`);
  root.style.setProperty("--lyric-poster-bottom-left-y", `${roomUtility.lyricPosterBottomLeftY}px`);
  root.style.setProperty("--lyric-poster-bottom-right-x", `${roomUtility.lyricPosterBottomRightX}px`);
  root.style.setProperty("--lyric-poster-bottom-right-y", `${roomUtility.lyricPosterBottomRightY}px`);
  root.style.setProperty("--lyric-poster-stroke", `${roomUtility.lyricPosterStroke}px`);
  root.style.setProperty("--lyric-poster-stroke-opacity", String(roomUtility.lyricPosterStrokeOpacity));
  root.style.setProperty("--lyric-poster-fill-opacity", String(roomUtility.lyricPosterFillOpacity));
  root.style.setProperty("--lyric-poster-glow", String(roomUtility.lyricPosterGlow));
  root.style.setProperty("--lyric-poster-overall-y", `${roomUtility.lyricPosterOverallY}px`);
  root.style.setProperty("--lyric-poster-overall-scale", String(roomUtility.lyricPosterOverallScale));
  root.style.setProperty("--lyric-poster-row-tightness", String(roomUtility.lyricPosterRowTightness));
  root.style.setProperty("--lyric-poster-perspective-strength", String(roomUtility.lyricPosterPerspectiveStrength));
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
  root.style.setProperty("--lyric-poster-two-row-tightness", String(roomUtility.lyricPosterTwoRowTightness));
  root.style.setProperty("--lyric-poster-two-row-perspective", String(roomUtility.lyricPosterTwoRowPerspective));
  root.style.setProperty("--lyric-poster-two-row-tilt", String(roomUtility.lyricPosterTwoRowTilt));
  root.style.setProperty("--lyric-poster-three-row-vertical-stretch", String(roomUtility.lyricPosterThreeRowVerticalStretch));
  root.style.setProperty("--lyric-poster-three-row-tightness", String(roomUtility.lyricPosterThreeRowTightness));
  root.style.setProperty("--lyric-poster-three-row-perspective", String(roomUtility.lyricPosterThreeRowPerspective));
  root.style.setProperty("--lyric-poster-three-row-tilt", String(roomUtility.lyricPosterThreeRowTilt));
  root.style.setProperty("--lyric-poster-max-rows", roomUtility.lyricPosterMaxRows);
  root.style.setProperty("--lyric-poster-transition", roomUtility.lyricPosterTransition);
  root.style.setProperty("--lyrics-animation-revision", String(lyricAnimationRevision));

  root.classList.toggle("lyric-poster-transition-push", roomUtility.lyricPosterTransition === "push-slide");
  root.classList.toggle("lyric-poster-transition-fade", roomUtility.lyricPosterTransition === "fade-slide");
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
    updateLyricsCeiling(lyricsState, 0, -1, lyricsEnabled);
    return;
  }

  if (key === lyricsFetchKey) return;

  lyricsFetchKey = key;
  lyricsState = { ...emptyLyrics("loading"), trackKey: key };
  updateLyricsCeiling(lyricsState, getEstimatedPlaybackProgress(track), -1, lyricsEnabled);

  lyricsState = await fetchLyricsForTrack(track);
  const lyricProgressMs = getEstimatedPlaybackProgress(track);
  const activeLyricIndex = getActiveLyricIndex(lyricsState.syncedLyrics, lyricProgressMs);
  updateLyricsCeiling(lyricsState, lyricProgressMs, activeLyricIndex, lyricsEnabled);
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
  updateLyricsCeiling(lyricsState, lyricProgressMs, activeLyricIndex, lyricsEnabled);

  requestAnimationFrame(tick);
}

void boot();
