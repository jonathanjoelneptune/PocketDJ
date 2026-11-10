/**
 * Living Atmosphere V2: lightweight wall-localized spotlight motion.
 * No RAF loop, timers, canvas, per-frame DOM updates, or touch-device effects.
 * Settings are independent of Room Lighting and prior experimental particles.
 */
export type SpotlightPalette = "duo" | "album" | "warm" | "cool";
export type RoomSpotlightSettings = {
  enabled: boolean;
  strength: number;
  speed: number;
  palette: SpotlightPalette;
};

const STORAGE_KEY = "pocketdj-room-spotlight-v2";
export const DEFAULT_ROOM_SPOTLIGHTS: RoomSpotlightSettings = {
  enabled: true,
  strength: 0.90,
  speed: 22,
  palette: "duo",
};
const PALETTES: SpotlightPalette[] = ["duo", "album", "warm", "cool"];

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
}

function normalize(settings: Partial<RoomSpotlightSettings>): RoomSpotlightSettings {
  return {
    enabled: typeof settings.enabled === "boolean" ? settings.enabled : DEFAULT_ROOM_SPOTLIGHTS.enabled,
    strength: clampNumber(settings.strength, DEFAULT_ROOM_SPOTLIGHTS.strength, 0, 1.5),
    speed: Math.round(clampNumber(settings.speed, DEFAULT_ROOM_SPOTLIGHTS.speed, 8, 60)),
    palette: PALETTES.includes(settings.palette as SpotlightPalette)
      ? settings.palette as SpotlightPalette : DEFAULT_ROOM_SPOTLIGHTS.palette,
  };
}

function readSettings(): RoomSpotlightSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw) as Partial<RoomSpotlightSettings>) : { ...DEFAULT_ROOM_SPOTLIGHTS };
  } catch {
    return { ...DEFAULT_ROOM_SPOTLIGHTS };
  }
}

let settings = readSettings();

function saveSettings(): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
  catch { /* Controls still work if local storage is unavailable. */ }
}

function applySettings(): void {
  const root = document.documentElement;
  root.classList.toggle("room-spotlight-enabled", settings.enabled && settings.strength > 0);
  root.dataset.roomSpotlightPalette = settings.palette;
  root.style.setProperty("--room-spotlight-strength", settings.strength.toFixed(2));
  root.style.setProperty("--room-spotlight-speed", `${settings.speed}s`);

  const enabledInput = document.querySelector<HTMLInputElement>("#menu2SpotlightEnabled");
  const intensityInput = document.querySelector<HTMLInputElement>("#menu2SpotlightStrength");
  const speedInput = document.querySelector<HTMLInputElement>("#menu2SpotlightSpeed");
  const paletteInput = document.querySelector<HTMLSelectElement>("#menu2SpotlightPalette");
  const intensityLabel = document.querySelector<HTMLElement>("#menu2SpotlightStrengthValue");
  const speedLabel = document.querySelector<HTMLElement>("#menu2SpotlightSpeedValue");
  if (enabledInput) enabledInput.checked = settings.enabled;
  if (intensityInput) intensityInput.value = settings.strength.toFixed(2);
  if (speedInput) speedInput.value = String(settings.speed);
  if (paletteInput) paletteInput.value = settings.palette;
  if (intensityLabel) intensityLabel.textContent = settings.strength.toFixed(2);
  if (speedLabel) speedLabel.textContent = `${settings.speed}s`;
}

/** Call once after renderShell(). No runtime or Spotify dependencies. */
export function initializeRoomSpotlights(): void {
  document.querySelector<HTMLInputElement>("#menu2SpotlightEnabled")?.addEventListener("change", (event) => {
    settings = { ...settings, enabled: (event.target as HTMLInputElement).checked };
    saveSettings();
    applySettings();
  });
  document.querySelector<HTMLInputElement>("#menu2SpotlightStrength")?.addEventListener("input", (event) => {
    settings = normalize({ ...settings, strength: Number((event.target as HTMLInputElement).value) });
    saveSettings();
    applySettings();
  });
  document.querySelector<HTMLInputElement>("#menu2SpotlightSpeed")?.addEventListener("input", (event) => {
    settings = normalize({ ...settings, speed: Number((event.target as HTMLInputElement).value) });
    saveSettings();
    applySettings();
  });
  document.querySelector<HTMLSelectElement>("#menu2SpotlightPalette")?.addEventListener("change", (event) => {
    settings = normalize({ ...settings, palette: (event.target as HTMLSelectElement).value as SpotlightPalette });
    saveSettings();
    applySettings();
  });
  document.querySelector<HTMLButtonElement>("#menu2SpotlightReset")?.addEventListener("click", () => {
    settings = { ...DEFAULT_ROOM_SPOTLIGHTS };
    saveSettings();
    applySettings();
  });
  applySettings();
}
