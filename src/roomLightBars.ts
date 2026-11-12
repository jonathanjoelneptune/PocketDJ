/**
 * Two album-reactive light bars positioned in room-space behind speakers / DJ.
 * Their palette is provided by the shared roomSpotlights.ts album-color variables;
 * main.ts already interpolates these values between tracks over five seconds.
 * Controls update CSS variables only: no independent timers or color snapping.
 */
export type LightBarPauseMode = "lit" | "dim" | "off";
export type RoomLightBarSettings = {
  enabled: boolean;
  brightness: number;
  glow: number;
  width: number;
  height: number;
  top: number;
  leftX: number;
  rightX: number;
  swap: boolean;
  pauseMode: LightBarPauseMode;
};

const STORAGE_KEY = "pocketdj-room-light-bars-v1";
const DEFAULTS_MIGRATION_KEY = "pocketdj-room-light-bars-defaults-20261112";
export const DEFAULT_ROOM_LIGHT_BARS: RoomLightBarSettings = {
  enabled: true,
  brightness: 1,
  glow: 0.90,
  width: 3.2,
  height: 15,
  top: 38.4,
  leftX: 31.6,
  rightX: 69.6,
  swap: false,
  pauseMode: "dim",
};

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function normalize(source: Partial<RoomLightBarSettings>): RoomLightBarSettings {
  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : DEFAULT_ROOM_LIGHT_BARS.enabled,
    brightness: clamp(source.brightness, DEFAULT_ROOM_LIGHT_BARS.brightness, 0, 1.5),
    glow: clamp(source.glow, DEFAULT_ROOM_LIGHT_BARS.glow, 0, 1.5),
    width: clamp(source.width, DEFAULT_ROOM_LIGHT_BARS.width, 1.4, 4.5),
    height: clamp(source.height, DEFAULT_ROOM_LIGHT_BARS.height, 8, 22),
    top: clamp(source.top, DEFAULT_ROOM_LIGHT_BARS.top, 24, 60),
    leftX: clamp(source.leftX, DEFAULT_ROOM_LIGHT_BARS.leftX, 24, 44),
    rightX: clamp(source.rightX, DEFAULT_ROOM_LIGHT_BARS.rightX, 56, 76),
    swap: typeof source.swap === "boolean" ? source.swap : DEFAULT_ROOM_LIGHT_BARS.swap,
    pauseMode: source.pauseMode === "dim" || source.pauseMode === "off" ? source.pauseMode : "lit",
  };
}

function readSettings(): RoomLightBarSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ROOM_LIGHT_BARS };
    const saved = JSON.parse(raw) as Partial<RoomLightBarSettings>;

    // One-time update for fixtures created in the first release. Only migrate
    // unchanged old defaults, so custom widths/positions/glows survive.
    if (!localStorage.getItem(DEFAULTS_MIGRATION_KEY)) {
      if (saved.width === 2.7) saved.width = DEFAULT_ROOM_LIGHT_BARS.width;
      if (saved.height === 12) saved.height = DEFAULT_ROOM_LIGHT_BARS.height;
      if (saved.leftX === 33.7) saved.leftX = DEFAULT_ROOM_LIGHT_BARS.leftX;
      if (saved.rightX === 66.7) saved.rightX = DEFAULT_ROOM_LIGHT_BARS.rightX;
      // The initial 'lit' was the default; select the owner's new dim preference.
      // An explicitly selected 'off' remains untouched, and later edits persist.
      if (saved.pauseMode === "lit" || saved.pauseMode == null) saved.pauseMode = "dim";
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
        localStorage.setItem(DEFAULTS_MIGRATION_KEY, "1");
      } catch { /* Read-only storage: apply migration to this session. */ }
    }
    return normalize(saved);
  } catch {
    return { ...DEFAULT_ROOM_LIGHT_BARS };
  }
}

let settings = readSettings();

function save(): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
  catch { /* Safe when storage is blocked; controls remain responsive. */ }
}

function apply(): void {
  const root = document.documentElement;
  root.classList.toggle("room-light-bars-enabled", settings.enabled);
  root.dataset.roomLightBarSwap = String(settings.swap);
  root.dataset.roomLightBarPause = settings.pauseMode;
  root.style.setProperty("--room-light-bar-brightness", settings.brightness.toFixed(2));
  root.style.setProperty("--room-light-bar-glow", settings.glow.toFixed(2));
  root.style.setProperty("--room-light-bar-width", `${settings.width}%`);
  root.style.setProperty("--room-light-bar-height", `${settings.height}%`);
  root.style.setProperty("--room-light-bar-top", `${settings.top}%`);
  root.style.setProperty("--room-light-bar-left-x", `${settings.leftX}%`);
  root.style.setProperty("--room-light-bar-right-x", `${settings.rightX}%`);

  const numeric: Array<[keyof RoomLightBarSettings, string, string]> = [
    ["brightness", "menu2LightBarsBrightness", "menu2LightBarsBrightnessValue"],
    ["glow", "menu2LightBarsGlow", "menu2LightBarsGlowValue"],
    ["width", "menu2LightBarsWidth", "menu2LightBarsWidthValue"],
    ["height", "menu2LightBarsHeight", "menu2LightBarsHeightValue"],
    ["top", "menu2LightBarsTop", "menu2LightBarsTopValue"],
    ["leftX", "menu2LightBarsLeftX", "menu2LightBarsLeftXValue"],
    ["rightX", "menu2LightBarsRightX", "menu2LightBarsRightXValue"],
  ];
  for (const [key, id, labelId] of numeric) {
    const value = settings[key] as number;
    const input = document.getElementById(id) as HTMLInputElement | null;
    const label = document.getElementById(labelId);
    if (input) input.value = String(value);
    if (label) label.textContent = key === "brightness" || key === "glow"
      ? value.toFixed(2) : `${value.toFixed(1)}%`;
  }
  const enabled = document.getElementById("menu2LightBarsEnabled") as HTMLInputElement | null;
  const swap = document.getElementById("menu2LightBarsSwap") as HTMLInputElement | null;
  const pause = document.getElementById("menu2LightBarsPauseMode") as HTMLSelectElement | null;
  if (enabled) enabled.checked = settings.enabled;
  if (swap) swap.checked = settings.swap;
  if (pause) pause.value = settings.pauseMode;
}

export function initializeRoomLightBars(): void {
  const numericKeys = [
    ["brightness", "menu2LightBarsBrightness"],
    ["glow", "menu2LightBarsGlow"],
    ["width", "menu2LightBarsWidth"],
    ["height", "menu2LightBarsHeight"],
    ["top", "menu2LightBarsTop"],
    ["leftX", "menu2LightBarsLeftX"],
    ["rightX", "menu2LightBarsRightX"],
  ] as const;
  for (const [key, id] of numericKeys) {
    document.getElementById(id)?.addEventListener("input", (event) => {
      settings = normalize({ ...settings, [key]: Number((event.target as HTMLInputElement).value) });
      save();
      apply();
    });
  }
  document.getElementById("menu2LightBarsEnabled")?.addEventListener("change", (event) => {
    settings = { ...settings, enabled: (event.target as HTMLInputElement).checked };
    save();
    apply();
  });
  document.getElementById("menu2LightBarsSwap")?.addEventListener("change", (event) => {
    settings = { ...settings, swap: (event.target as HTMLInputElement).checked };
    save();
    apply();
  });
  document.getElementById("menu2LightBarsPauseMode")?.addEventListener("change", (event) => {
    settings = normalize({ ...settings, pauseMode: (event.target as HTMLSelectElement).value as LightBarPauseMode });
    save();
    apply();
  });
  document.getElementById("menu2LightBarsReset")?.addEventListener("click", () => {
    settings = { ...DEFAULT_ROOM_LIGHT_BARS };
    save();
    apply();
  });
  apply();
}
