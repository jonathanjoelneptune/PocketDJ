import "./styles.css";
import { DjController } from "./dj/djController";
import { getDemoTrack, stopDemo, toggleDemo } from "./demo";
import { emptyTrack, type AppState } from "./state/types";
import { disconnectSpotify, getCurrentlyPlaying, getDefaultRedirectUri, handleSpotifyCallback, startSpotifyLogin } from "./spotify/spotifyClient";
import { loadClientId, loadTokens, saveClientId } from "./spotify/tokenStore";
import { qs } from "./utils/dom";
import { renderShell, setControlPanelOpen, updatePlaybackUi } from "./ui";

const state: AppState = {
  spotifyClientId: loadClientId(),
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
  speakerDriverX: number;
  speakerDriverY: number;
  speakerDriverSize: number;
  speakerDarkness: number;
  sceneFilter: SceneFilter;
  filterStrength: number;
  vignetteStrength: number;
  shadowOpacity: number;
  tableShadowScale: number;
};

const DEFAULT_ROOM_UTILITY: RoomUtilitySettings = {
  speakerLeftX: 38.6,
  speakerRightX: 63.1,
  speakerY: 70.5,
  speakerScale: 1.15,
  speakerOpacity: 1.00,
  speakerPulse: 0.50,
  speakerDriverX: 50.0,
  speakerDriverY: 53.5,
  speakerDriverSize: 42.0,
  speakerDarkness: 0.48,
  sceneFilter: "neon-purple",
  filterStrength: 0.20,
  vignetteStrength: 0.20,
  shadowOpacity: 1.00,
  tableShadowScale: 1.16
};

const ROOM_UTILITY_KEY = "pocketdj-room-utility-v1";
let roomUtility = loadRoomUtilitySettings();



async function boot(): Promise<void> {
  renderShell(state);
  dj = new DjController(qs("#djSprite"), qs("#modePill"));
  bindControls();
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
    setControlPanelOpen(true);
  });

  qs<HTMLButtonElement>("#hidePanel").addEventListener("click", () => {
    setControlPanelOpen(false);
  });

  qs<HTMLButtonElement>("#animationDebugToggle").addEventListener("click", () => {
    const panel = qs<HTMLPreElement>("#animationDebugPanel");
    panel.hidden = !panel.hidden;
  });

  qs<HTMLButtonElement>("#connectSpotify").addEventListener("click", async () => {
    const clientId = qs<HTMLInputElement>("#clientIdInput").value.trim();
    await startSpotifyLogin(clientId, state.redirectUri);
  });

  qs<HTMLButtonElement>("#disconnectSpotify").addEventListener("click", () => {
    disconnectSpotify();
    stopDemo();
    useDemo = false;
    state.playback = emptyTrack();
    panelAutoHiddenAfterConnect = false;
    setControlPanelOpen(true);
    updatePlaybackUi(state.playback, state.debugOpen);
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

  qs<HTMLInputElement>("#clientIdInput").addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    state.spotifyClientId = input.value.trim();
    saveClientId(state.spotifyClientId);
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !useDemo && loadTokens()) void pollSpotifyNow();
  });
}


function bindRoomUtilityControls(): void {
  const sceneFilter = qs<HTMLSelectElement>("#sceneFilterSelect");
  sceneFilter.value = roomUtility.sceneFilter;

  const controls = [
    ["speakerLeftX", "speakerLeftXValue"],
    ["speakerRightX", "speakerRightXValue"],
    ["speakerY", "speakerYValue"],
    ["speakerScale", "speakerScaleValue"],
    ["speakerOpacity", "speakerOpacityValue"],
    ["speakerPulse", "speakerPulseValue"],
    ["speakerDriverX", "speakerDriverXValue"],
    ["speakerDriverY", "speakerDriverYValue"],
    ["speakerDriverSize", "speakerDriverSizeValue"],
    ["speakerDarkness", "speakerDarknessValue"],
    ["filterStrength", "filterStrengthValue"],
    ["vignetteStrength", "vignetteStrengthValue"],
    ["shadowOpacity", "shadowOpacityValue"],
    ["tableShadowScale", "tableShadowScaleValue"]
  ] as const;

  controls.forEach(([inputId, labelId]) => {
    const input = qs<HTMLInputElement>(`#${inputId}`);
    const key = inputId as keyof Omit<RoomUtilitySettings, "sceneFilter">;
    input.value = String(roomUtility[key]);
    setUtilityLabel(labelId, Number(input.value));

    input.addEventListener("input", () => {
      roomUtility = { ...roomUtility, [key]: Number(input.value) };
      setUtilityLabel(labelId, Number(input.value));
      applyRoomUtilitySettings();
    });
  });

  sceneFilter.addEventListener("change", () => {
    roomUtility = { ...roomUtility, sceneFilter: sceneFilter.value as SceneFilter };
    applyRoomUtilitySettings();
  });

  qs<HTMLButtonElement>("#saveRoomUtility").addEventListener("click", () => {
    saveRoomUtilitySettings();
    applyRoomUtilitySettings();
  });

  qs<HTMLButtonElement>("#resetRoomUtility").addEventListener("click", () => {
    roomUtility = { ...DEFAULT_ROOM_UTILITY };
    sceneFilter.value = roomUtility.sceneFilter;
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

function applyRoomUtilitySettings(): void {
  const root = document.documentElement;

  root.style.setProperty("--speaker-left-x", `${roomUtility.speakerLeftX}%`);
  root.style.setProperty("--speaker-right-x", `${roomUtility.speakerRightX}%`);
  root.style.setProperty("--speaker-y", `${roomUtility.speakerY}%`);
  root.style.setProperty("--speaker-scale", String(roomUtility.speakerScale));
  root.style.setProperty("--speaker-opacity", String(roomUtility.speakerOpacity));
  root.style.setProperty("--speaker-pulse", String(roomUtility.speakerPulse));
  root.style.setProperty("--speaker-driver-x", `${roomUtility.speakerDriverX}%`);
  root.style.setProperty("--speaker-driver-y", `${roomUtility.speakerDriverY}%`);
  root.style.setProperty("--speaker-driver-size", `${roomUtility.speakerDriverSize}%`);
  root.style.setProperty("--speaker-darkness", String(roomUtility.speakerDarkness));
  root.style.setProperty("--scene-filter-strength", String(roomUtility.filterStrength));
  root.style.setProperty("--scene-vignette-strength", String(roomUtility.vignetteStrength));
  root.style.setProperty("--shadow-opacity", String(roomUtility.shadowOpacity));
  root.style.setProperty("--table-shadow-scale", String(roomUtility.tableShadowScale));

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
  qs(`#${id}`).textContent = value.toFixed(id.includes("Scale") ? 2 : 1);
}

function loadRoomUtilitySettings(): RoomUtilitySettings {
  try {
    const raw = window.localStorage.getItem(ROOM_UTILITY_KEY);
    if (!raw) return { ...DEFAULT_ROOM_UTILITY };
    const parsed = JSON.parse(raw) as Partial<RoomUtilitySettings>;
    return { ...DEFAULT_ROOM_UTILITY, ...parsed };
  } catch {
    return { ...DEFAULT_ROOM_UTILITY };
  }
}

function saveRoomUtilitySettings(): void {
  window.localStorage.setItem(ROOM_UTILITY_KEY, JSON.stringify(roomUtility));
}


async function pollSpotifyNow(): Promise<void> {
  if (useDemo) return;
  if (!state.spotifyClientId) return;

  try {
    lastPollError = "";
    state.playback = await getCurrentlyPlaying(state.spotifyClientId);
    updatePlaybackUi(state.playback, state.debugOpen);

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
  requestAnimationFrame(tick);
}

void boot();
