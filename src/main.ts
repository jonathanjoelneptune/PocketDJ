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

type LyricAnimationPreset = "focus-sweep" | "vertical-marquee" | "active-horizontal-marquee" | "soft-slide" | "pulse-pop" | "instant";
type ActiveLyricPreset = "amber-crisp" | "gold-neon" | "warm-white" | "violet-glow";
type InactiveLyricPreset = "soft-ghost" | "warm-dim" | "clean-readable" | "minimal";
type LyricActiveLayout = "single-line" | "two-line";

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
  lyricPastTopX: number;
  lyricPastTopY: number;
  lyricPastTopW: number;
  lyricPastBottomX: number;
  lyricPastBottomY: number;
  lyricPastBottomW: number;
  lyricFutureTopX: number;
  lyricFutureTopY: number;
  lyricFutureTopW: number;
  lyricFutureBottomX: number;
  lyricFutureBottomY: number;
  lyricFutureBottomW: number;
  lyricActiveX: number;
  lyricActiveY: number;
  lyricActiveW: number;
  lyricActiveH: number;
  lyricActiveZoom: number;
  lyricActiveStroke: number;
  lyricActiveBgOpacity: number;
  lyricActiveBgColor: string;
  lyricGuideOpacity: number;
  lyricLineCount: number;
  lyricAnimationPreset: LyricAnimationPreset;
  lyricActivePreset: ActiveLyricPreset;
  lyricInactivePreset: InactiveLyricPreset;
  lyricBaseFontSize: number;
  lyricActiveLayout: LyricActiveLayout;
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
  lyricPastTopX: 881,
  lyricPastTopY: 42,
  lyricPastTopW: 1177,
  lyricPastBottomX: 882,
  lyricPastBottomY: 142,
  lyricPastBottomW: 920,
  lyricFutureTopX: 882,
  lyricFutureTopY: 250,
  lyricFutureTopW: 860,
  lyricFutureBottomX: 882,
  lyricFutureBottomY: 346,
  lyricFutureBottomW: 900,
  lyricActiveX: 882,
  lyricActiveY: 192,
  lyricActiveW: 850,
  lyricActiveH: 58,
  lyricActiveZoom: 1.08,
  lyricActiveStroke: 2,
  lyricActiveBgOpacity: 0.86,
  lyricActiveBgColor: "#050208",
  lyricGuideOpacity: 0.0,
  lyricLineCount: 11,
  lyricAnimationPreset: "vertical-marquee",
  lyricActivePreset: "amber-crisp",
  lyricInactivePreset: "clean-readable",
  lyricBaseFontSize: 12,
  lyricActiveLayout: "two-line"
};

const ROOM_UTILITY_KEY = "pocketdj-room-utility-v5";
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
  const lyricAnimationPreset = qs<HTMLSelectElement>("#lyricAnimationPreset");
  const lyricActivePreset = qs<HTMLSelectElement>("#lyricActivePreset");
  const lyricInactivePreset = qs<HTMLSelectElement>("#lyricInactivePreset");
  const lyricActiveLayout = qs<HTMLSelectElement>("#lyricActiveLayout");
  const lyricActiveBgColor = qs<HTMLInputElement>("#lyricActiveBgColor");

  sceneFilter.value = roomUtility.sceneFilter;
  lyricAnimationPreset.value = roomUtility.lyricAnimationPreset;
  lyricActivePreset.value = roomUtility.lyricActivePreset;
  lyricInactivePreset.value = roomUtility.lyricInactivePreset;
  lyricActiveLayout.value = roomUtility.lyricActiveLayout;
  lyricActiveBgColor.value = roomUtility.lyricActiveBgColor;

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
    ["lyricPastTopX", "lyricPastTopXValue"],
    ["lyricPastTopY", "lyricPastTopYValue"],
    ["lyricPastTopW", "lyricPastTopWValue"],
    ["lyricPastBottomX", "lyricPastBottomXValue"],
    ["lyricPastBottomY", "lyricPastBottomYValue"],
    ["lyricPastBottomW", "lyricPastBottomWValue"],
    ["lyricFutureTopX", "lyricFutureTopXValue"],
    ["lyricFutureTopY", "lyricFutureTopYValue"],
    ["lyricFutureTopW", "lyricFutureTopWValue"],
    ["lyricFutureBottomX", "lyricFutureBottomXValue"],
    ["lyricFutureBottomY", "lyricFutureBottomYValue"],
    ["lyricFutureBottomW", "lyricFutureBottomWValue"],
    ["lyricActiveX", "lyricActiveXValue"],
    ["lyricActiveY", "lyricActiveYValue"],
    ["lyricActiveW", "lyricActiveWValue"],
    ["lyricActiveH", "lyricActiveHValue"],
    ["lyricActiveZoom", "lyricActiveZoomValue"],
    ["lyricActiveStroke", "lyricActiveStrokeValue"],
    ["lyricActiveBgOpacity", "lyricActiveBgOpacityValue"],
    ["lyricGuideOpacity", "lyricGuideOpacityValue"],
    ["lyricLineCount", "lyricLineCountValue"],
    ["lyricBaseFontSize", "lyricBaseFontSizeValue"]
  ] as const;

  controls.forEach(([inputId, labelId]) => {
    const input = qs<HTMLInputElement>(`#${inputId}`);
    const key = inputId as keyof Omit<RoomUtilitySettings, "sceneFilter">;
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

  lyricAnimationPreset.addEventListener("change", () => {
    lyricAnimationRevision += 1;
    roomUtility = { ...roomUtility, lyricAnimationPreset: lyricAnimationPreset.value as LyricAnimationPreset };
    applyRoomUtilitySettings();
  });

  lyricActivePreset.addEventListener("change", () => {
    roomUtility = { ...roomUtility, lyricActivePreset: lyricActivePreset.value as ActiveLyricPreset };
    applyRoomUtilitySettings();
  });

  lyricInactivePreset.addEventListener("change", () => {
    roomUtility = { ...roomUtility, lyricInactivePreset: lyricInactivePreset.value as InactiveLyricPreset };
    applyRoomUtilitySettings();
  });

  lyricActiveLayout.addEventListener("change", () => {
    roomUtility = { ...roomUtility, lyricActiveLayout: lyricActiveLayout.value as LyricActiveLayout };
    applyRoomUtilitySettings();
  });

  lyricActiveBgColor.addEventListener("input", () => {
    lyricAnimationRevision += 1;
    roomUtility = { ...roomUtility, lyricActiveBgColor: lyricActiveBgColor.value };
    applyRoomUtilitySettings();
  });

  qs<HTMLButtonElement>("#saveRoomUtility").addEventListener("click", () => {
    saveRoomUtilitySettings();
    applyRoomUtilitySettings();
  });

  qs<HTMLButtonElement>("#resetRoomUtility").addEventListener("click", () => {
    roomUtility = { ...DEFAULT_ROOM_UTILITY };
    sceneFilter.value = roomUtility.sceneFilter;
    lyricAnimationPreset.value = roomUtility.lyricAnimationPreset;
    lyricActivePreset.value = roomUtility.lyricActivePreset;
    lyricInactivePreset.value = roomUtility.lyricInactivePreset;
    lyricActiveLayout.value = roomUtility.lyricActiveLayout;
    lyricActiveBgColor.value = roomUtility.lyricActiveBgColor;
  lyricActiveBgColor.value = roomUtility.lyricActiveBgColor;
  lyricActiveLayout.value = roomUtility.lyricActiveLayout;
  lyricActiveBgColor.value = roomUtility.lyricActiveBgColor;
    controls.forEach(([inputId, labelId]) => {
      const input = qs<HTMLInputElement>(`#${inputId}`);
      const key = inputId as keyof Omit<RoomUtilitySettings, "sceneFilter">;
      input.value = String(roomUtility[key]);
      setUtilityLabel(labelId, Number(input.value));
    });
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

  return "5, 2, 8";
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
  root.style.setProperty("--lyrics-past-top-x", `${roomUtility.lyricPastTopX}px`);
  root.style.setProperty("--lyrics-past-top-y", `${roomUtility.lyricPastTopY}px`);
  root.style.setProperty("--lyrics-past-top-w", `${roomUtility.lyricPastTopW}px`);
  root.style.setProperty("--lyrics-past-bottom-x", `${roomUtility.lyricPastBottomX}px`);
  root.style.setProperty("--lyrics-past-bottom-y", `${roomUtility.lyricPastBottomY}px`);
  root.style.setProperty("--lyrics-past-bottom-w", `${roomUtility.lyricPastBottomW}px`);
  root.style.setProperty("--lyrics-future-top-x", `${roomUtility.lyricFutureTopX}px`);
  root.style.setProperty("--lyrics-future-top-y", `${roomUtility.lyricFutureTopY}px`);
  root.style.setProperty("--lyrics-future-top-w", `${roomUtility.lyricFutureTopW}px`);
  root.style.setProperty("--lyrics-future-bottom-x", `${roomUtility.lyricFutureBottomX}px`);
  root.style.setProperty("--lyrics-future-bottom-y", `${roomUtility.lyricFutureBottomY}px`);
  root.style.setProperty("--lyrics-future-bottom-w", `${roomUtility.lyricFutureBottomW}px`);

  root.style.setProperty("--lyrics-active-x", `${roomUtility.lyricActiveX}px`);
  root.style.setProperty("--lyrics-active-y", `${roomUtility.lyricActiveY}px`);
  root.style.setProperty("--lyrics-active-w", `${roomUtility.lyricActiveW}px`);
  root.style.setProperty("--lyrics-active-h", `${roomUtility.lyricActiveH}px`);
  root.style.setProperty("--lyrics-active-zoom", String(roomUtility.lyricActiveZoom));
  root.style.setProperty("--lyrics-active-stroke", `${roomUtility.lyricActiveStroke}px`);
  root.style.setProperty("--lyrics-active-bg-opacity", String(roomUtility.lyricActiveBgOpacity));
  root.style.setProperty("--lyrics-active-bg-color", roomUtility.lyricActiveBgColor);
  root.style.setProperty("--lyrics-active-bg-rgb", hexToRgbParts(roomUtility.lyricActiveBgColor));

  root.style.setProperty("--lyrics-guide-opacity", String(roomUtility.lyricGuideOpacity));
  root.style.setProperty("--lyrics-line-count", String(roomUtility.lyricLineCount));
  root.style.setProperty("--lyrics-base-font-size", `${roomUtility.lyricBaseFontSize}px`);
  root.style.setProperty("--lyrics-animation-revision", String(lyricAnimationRevision));

  const lineCount = roomUtility.lyricLineCount;
  const halfWindow = Math.floor(lineCount / 2);
  const pastCount = halfWindow;
  const futureCount = lineCount - halfWindow - 1;

  for (let slot = 0; slot < lineCount; slot += 1) {
    const offset = slot - halfWindow;

    if (offset < 0) {
      const t = pastCount <= 1 ? 1 : slot / (pastCount - 1);
      root.style.setProperty(`--lyrics-slot-${slot}-x`, `${lerp(roomUtility.lyricPastTopX, roomUtility.lyricPastBottomX, t)}px`);
      root.style.setProperty(`--lyrics-slot-${slot}-y`, `${lerp(roomUtility.lyricPastTopY, roomUtility.lyricPastBottomY, t)}px`);
      root.style.setProperty(`--lyrics-slot-${slot}-w`, `${lerp(roomUtility.lyricPastTopW, roomUtility.lyricPastBottomW, t)}px`);
    } else if (offset > 0) {
      const futureSlot = offset - 1;
      const t = futureCount <= 1 ? 0 : futureSlot / (futureCount - 1);
      root.style.setProperty(`--lyrics-slot-${slot}-x`, `${lerp(roomUtility.lyricFutureTopX, roomUtility.lyricFutureBottomX, t)}px`);
      root.style.setProperty(`--lyrics-slot-${slot}-y`, `${lerp(roomUtility.lyricFutureTopY, roomUtility.lyricFutureBottomY, t)}px`);
      root.style.setProperty(`--lyrics-slot-${slot}-w`, `${lerp(roomUtility.lyricFutureTopW, roomUtility.lyricFutureBottomW, t)}px`);
    } else {
      root.style.setProperty(`--lyrics-slot-${slot}-x`, `${roomUtility.lyricActiveX}px`);
      root.style.setProperty(`--lyrics-slot-${slot}-y`, `${roomUtility.lyricActiveY}px`);
      root.style.setProperty(`--lyrics-slot-${slot}-w`, `${roomUtility.lyricActiveW}px`);
    }
  }

  root.classList.toggle("lyrics-animation-focus-sweep", roomUtility.lyricAnimationPreset === "focus-sweep");
  root.classList.toggle("lyrics-animation-vertical-marquee", roomUtility.lyricAnimationPreset === "vertical-marquee");
  root.classList.toggle("lyrics-animation-active-horizontal-marquee", roomUtility.lyricAnimationPreset === "active-horizontal-marquee");
  root.classList.toggle("lyrics-animation-soft-slide", roomUtility.lyricAnimationPreset === "soft-slide");
  root.classList.toggle("lyrics-animation-pulse-pop", roomUtility.lyricAnimationPreset === "pulse-pop");
  root.classList.toggle("lyrics-animation-instant", roomUtility.lyricAnimationPreset === "instant");

  root.classList.toggle("lyrics-active-amber-crisp", roomUtility.lyricActivePreset === "amber-crisp");
  root.classList.toggle("lyrics-active-gold-neon", roomUtility.lyricActivePreset === "gold-neon");
  root.classList.toggle("lyrics-active-warm-white", roomUtility.lyricActivePreset === "warm-white");
  root.classList.toggle("lyrics-active-violet-glow", roomUtility.lyricActivePreset === "violet-glow");

  root.classList.toggle("lyrics-inactive-soft-ghost", roomUtility.lyricInactivePreset === "soft-ghost");
  root.classList.toggle("lyrics-inactive-warm-dim", roomUtility.lyricInactivePreset === "warm-dim");
  root.classList.toggle("lyrics-inactive-clean-readable", roomUtility.lyricInactivePreset === "clean-readable");
  root.classList.toggle("lyrics-inactive-minimal", roomUtility.lyricInactivePreset === "minimal");

  root.classList.toggle("lyrics-active-layout-single-line", roomUtility.lyricActiveLayout === "single-line");
  root.classList.toggle("lyrics-active-layout-two-line", roomUtility.lyricActiveLayout === "two-line");

  const overlay = qs<HTMLElement>("#roomFilterOverlay");
  overlay.className = `room-filter-overlay ${roomUtility.sceneFilter}`;
}

function updateSpeakerPulse(isPlaying: boolean): void {
  const left = qs<HTMLElement>("#leftSpeaker");
  const right = qs<HTMLElement>("#rightSpeaker");
  left.classList.toggle("playing", isPlaying);
  right.classList.toggle("playing", isPlaying);
}

function setUtilityLabel(id: string, value: number): void {
  const pxOrCount = id.startsWith("lyric") && !id.includes("GuideOpacity") && !id.includes("ActiveZoom") && !id.includes("BgOpacity") && !id.includes("Stroke");
  const decimals = id.includes("Scale") || id.includes("ActiveZoom") || id.includes("GuideOpacity") || id.includes("BgOpacity") || id.includes("Stroke") ? 2 : pxOrCount ? 0 : 1;
  qs(`#${id}`).textContent = value.toFixed(decimals);
}

function loadRoomUtilitySettings(): RoomUtilitySettings {
  try {
    const raw = window.localStorage.getItem(ROOM_UTILITY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<RoomUtilitySettings>;
      return { ...DEFAULT_ROOM_UTILITY, ...parsed };
    }

    const oldRaw = window.localStorage.getItem("pocketdj-room-utility-v4") ?? window.localStorage.getItem("pocketdj-room-utility-v3") ?? window.localStorage.getItem("pocketdj-room-utility-v2") ?? window.localStorage.getItem("pocketdj-room-utility-v1");
    if (!oldRaw) return { ...DEFAULT_ROOM_UTILITY };

    const oldParsed = JSON.parse(oldRaw) as Partial<RoomUtilitySettings>;
    const migratedNonLyricSettings: Partial<RoomUtilitySettings> = {
      speakerLeftX: oldParsed.speakerLeftX,
      speakerRightX: oldParsed.speakerRightX,
      speakerY: oldParsed.speakerY,
      speakerScale: oldParsed.speakerScale,
      speakerOpacity: oldParsed.speakerOpacity,
      speakerPulse: oldParsed.speakerPulse,
      speakerPulseX: oldParsed.speakerPulseX,
      speakerPulseY: oldParsed.speakerPulseY,
      speakerPulseSize: oldParsed.speakerPulseSize,
      speakerWarpOpacity: oldParsed.speakerWarpOpacity,
      sceneFilter: oldParsed.sceneFilter,
      filterStrength: oldParsed.filterStrength,
      vignetteStrength: oldParsed.vignetteStrength,
      shadowOpacity: oldParsed.shadowOpacity,
      tableShadowScale: oldParsed.tableShadowScale,
    };

    return { ...DEFAULT_ROOM_UTILITY, ...migratedNonLyricSettings };
  } catch {
    return { ...DEFAULT_ROOM_UTILITY };
  }
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
