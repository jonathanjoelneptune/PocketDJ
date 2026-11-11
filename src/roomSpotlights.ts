/**
 * Living Atmosphere V2: lightweight wall-localized spotlight motion.
 * No RAF loop, timers, canvas, per-frame DOM updates, or touch-device effects.
 * Settings are independent of Room Lighting and prior experimental particles.
 */
export type SpotlightPalette = "duo" | "album" | "warm" | "cool";
export type SpotlightMode = "walls" | "zones" | "full";
export type RoomSpotlightSettings = {
  enabled: boolean;
  strength: number;
  speed: number;
  palette: SpotlightPalette;
  mode: SpotlightMode;
};

const STORAGE_KEY = "pocketdj-room-spotlight-v2";
export const DEFAULT_ROOM_SPOTLIGHTS: RoomSpotlightSettings = {
  enabled: true,
  strength: 0.90,
  speed: 22,
  palette: "duo",
  mode: "zones",
};
const PALETTES: SpotlightPalette[] = ["duo", "album", "warm", "cool"];
const MODES: SpotlightMode[] = ["walls", "zones", "full"];

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
    mode: MODES.includes(settings.mode as SpotlightMode) ? settings.mode as SpotlightMode : DEFAULT_ROOM_SPOTLIGHTS.mode,
  };
}

function readSettings(): RoomSpotlightSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ROOM_SPOTLIGHTS };
    const stored = JSON.parse(raw) as Partial<RoomSpotlightSettings>;
    // Existing V2 installations retain their wall-only mode until explicitly changed.
    return normalize({ ...stored, mode: stored.mode ?? "walls" });
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
  root.dataset.roomSpotlightMode = settings.mode;
  root.style.setProperty("--room-spotlight-strength", settings.strength.toFixed(2));
  root.style.setProperty("--room-spotlight-speed", `${settings.speed}s`);

  const enabledInput = document.querySelector<HTMLInputElement>("#menu2SpotlightEnabled");
  const intensityInput = document.querySelector<HTMLInputElement>("#menu2SpotlightStrength");
  const speedInput = document.querySelector<HTMLInputElement>("#menu2SpotlightSpeed");
  const paletteInput = document.querySelector<HTMLSelectElement>("#menu2SpotlightPalette");
  const modeInput = document.querySelector<HTMLSelectElement>("#menu2SpotlightMode");
  const intensityLabel = document.querySelector<HTMLElement>("#menu2SpotlightStrengthValue");
  const speedLabel = document.querySelector<HTMLElement>("#menu2SpotlightSpeedValue");
  if (enabledInput) enabledInput.checked = settings.enabled;
  if (intensityInput) intensityInput.value = settings.strength.toFixed(2);
  if (speedInput) speedInput.value = String(settings.speed);
  if (paletteInput) paletteInput.value = settings.palette;
  if (modeInput) modeInput.value = settings.mode;
  if (intensityLabel) intensityLabel.textContent = settings.strength.toFixed(2);
  if (speedLabel) speedLabel.textContent = `${settings.speed}s`;
}


type RgbColor = readonly [number, number, number];
type HslColor = { h: number; s: number; l: number };
let recentAlbumColors: { accent: RgbColor; glow: RgbColor } | null = null;

function rgbToHsl(rgb: RgbColor): HslColor {
  const r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const delta = max - min, l = (max + min) / 2;
  if (delta < 0.0001) return { h: 0, s: 0, l };
  let h = 0;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  const denominator = 1 - Math.abs(2 * l - 1);
  const s = denominator > 0 ? delta / denominator : 0;
  return { h: (h * 60 + 360) % 360, s, l };
}

function hslToRgb(value: HslColor): RgbColor {
  const hue = ((value.h % 360) + 360) % 360;
  const chroma = (1 - Math.abs(2 * value.l - 1)) * value.s;
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = value.l - chroma / 2;
  let rgb: [number, number, number];
  if (hue < 60) rgb = [chroma, x, 0];
  else if (hue < 120) rgb = [x, chroma, 0];
  else if (hue < 180) rgb = [0, chroma, x];
  else if (hue < 240) rgb = [0, x, chroma];
  else if (hue < 300) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];
  return rgb.map(channel => Math.round((channel + m) * 255)) as [number, number, number];
}
function hueSeparation(a: number, b: number): number {
  const delta = Math.abs(a - b) % 360;
  return Math.min(delta, 360 - delta);
}
function mixHue(from: number, to: number, ratio: number): number {
  const delta = ((to - from + 540) % 360) - 180;
  return ((from + delta * ratio) % 360 + 360) % 360;
}

/**
 * The canonical room palette is interpolated by main.ts across 5 seconds.
 * Derive two vivid, distinct accent lights from those rendered colors only.
 * If the two hues converge, gradually move the secondary toward a complementary
 * hue instead of letting both lights become one muddy color. No threshold snap.
 * Does not change the canonical room/album palette.
 */
export function updateSpotlightAlbumColors(accent: RgbColor, glow: RgbColor): void {
  recentAlbumColors = { accent, glow };
  if (settings.palette !== "album") return;
  const primary = rgbToHsl(accent);
  const secondary = rgbToHsl(glow);
  // When neutral, borrow the other hue; default to a stable amber/blue pairing.
  const primaryHue = primary.s >= 0.12 ? primary.h : secondary.s >= 0.12 ? secondary.h : 35;
  const secondHue = secondary.s >= 0.12 ? secondary.h : (primaryHue + 150) % 360;
  const distance = hueSeparation(primaryHue, secondHue);
  const separationWeight = Math.max(0, Math.min(1, (105 - distance) / 105));
  const boostedSecondaryHue = mixHue(secondHue, (primaryHue + 150) % 360, separationWeight);
  const first = hslToRgb({ h: primaryHue, s: Math.max(primary.s, 0.62), l: Math.max(0.46, Math.min(0.63, primary.l)) });
  const second = hslToRgb({ h: boostedSecondaryHue, s: Math.max(secondary.s, 0.61), l: Math.max(0.43, Math.min(0.60, secondary.l)) });
  const root = document.documentElement;
  root.style.setProperty("--room-spotlight-album-primary-rgb", first.join(", "));
  root.style.setProperty("--room-spotlight-album-secondary-rgb", second.join(", "));
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
    if (recentAlbumColors) updateSpotlightAlbumColors(recentAlbumColors.accent, recentAlbumColors.glow);
  });
  document.querySelector<HTMLSelectElement>("#menu2SpotlightMode")?.addEventListener("change", (event) => {
    settings = normalize({ ...settings, mode: (event.target as HTMLSelectElement).value as SpotlightMode });
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
