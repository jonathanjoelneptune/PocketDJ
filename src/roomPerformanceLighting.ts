/**
 * Playback-scene lighting. One opacity-only resting dimmer and one
 * album-reactive gradient wash. The playback state comes from main.ts
 * and album colors come from its existing five-second interpolation.
 */
export type RoomPerformanceLightingSettings = {
  idleDim: number;
  colorStrength: number;
};

const STORAGE_KEY = "pocketdj-room-performance-lighting-v1";
const LIGHTING_REBALANCE_MIGRATION = "pocketdj-room-performance-wash-rebalance-20261112";
const SOFTER_WASH_MIGRATION = "pocketdj-room-performance-softer-background-20261112";
export const DEFAULT_ROOM_PERFORMANCE_LIGHTING: RoomPerformanceLightingSettings = {
  idleDim: 0.25,
  colorStrength: 0.85,
};

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
function normalize(source: Partial<RoomPerformanceLightingSettings>): RoomPerformanceLightingSettings {
  return {
    idleDim: clamp(source.idleDim, DEFAULT_ROOM_PERFORMANCE_LIGHTING.idleDim, 0, 0.92),
    colorStrength: clamp(source.colorStrength, DEFAULT_ROOM_PERFORMANCE_LIGHTING.colorStrength, 0, 1.8),
  };
}
function load(): RoomPerformanceLightingSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ROOM_PERFORMANCE_LIGHTING };
    const saved = JSON.parse(raw) as Partial<RoomPerformanceLightingSettings>;
    // Migrate only the original, untouched defaults from the previous build.
    // A separately customized value is preserved, and this runs once only.
    if (!localStorage.getItem(LIGHTING_REBALANCE_MIGRATION)) {
      if (saved.idleDim === 0.76) saved.idleDim = DEFAULT_ROOM_PERFORMANCE_LIGHTING.idleDim;
      if (saved.colorStrength === 1.25) saved.colorStrength = DEFAULT_ROOM_PERFORMANCE_LIGHTING.colorStrength;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
        localStorage.setItem(LIGHTING_REBALANCE_MIGRATION, "1");
      } catch { /* Keep the adjusted values in this session. */ }
    }
    // One-time follow-up: update only the previous 1.00 default. Values
    // already customized to other strengths retain their saved tuning.
    if (!localStorage.getItem(SOFTER_WASH_MIGRATION)) {
      if (saved.colorStrength === 1.00) saved.colorStrength = DEFAULT_ROOM_PERFORMANCE_LIGHTING.colorStrength;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
        localStorage.setItem(SOFTER_WASH_MIGRATION, "1");
      } catch { /* Continue using in-memory settings if storage is blocked. */ }
    }
    return normalize(saved);
  } catch {
    return { ...DEFAULT_ROOM_PERFORMANCE_LIGHTING };
  }
}
let settings = load();

function save(): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
  catch { /* Function safely if persistence is blocked. */ }
}

function apply(): void {
  const root = document.documentElement;
  root.style.setProperty("--room-performance-idle-dim", settings.idleDim.toFixed(2));
  root.style.setProperty("--room-performance-color-strength", settings.colorStrength.toFixed(2));
  const idleInput = document.querySelector<HTMLInputElement>("#menu2PerformanceIdleDim");
  const colorInput = document.querySelector<HTMLInputElement>("#menu2PerformanceColor");
  const idleValue = document.querySelector<HTMLElement>("#menu2PerformanceIdleDimValue");
  const colorValue = document.querySelector<HTMLElement>("#menu2PerformanceColorValue");
  if (idleInput) idleInput.value = String(settings.idleDim);
  if (colorInput) colorInput.value = String(settings.colorStrength);
  if (idleValue) idleValue.textContent = settings.idleDim.toFixed(2);
  if (colorValue) colorValue.textContent = settings.colorStrength.toFixed(2);
}

export function initializePerformanceLighting(): void {
  document.querySelector<HTMLInputElement>("#menu2PerformanceIdleDim")?.addEventListener("input", event => {
    settings = normalize({ ...settings, idleDim: Number((event.target as HTMLInputElement).value) });
    save(); apply();
  });
  document.querySelector<HTMLInputElement>("#menu2PerformanceColor")?.addEventListener("input", event => {
    settings = normalize({ ...settings, colorStrength: Number((event.target as HTMLInputElement).value) });
    save(); apply();
  });
  document.querySelector<HTMLButtonElement>("#menu2PerformanceReset")?.addEventListener("click", () => {
    settings = { ...DEFAULT_ROOM_PERFORMANCE_LIGHTING };
    save(); apply();
  });
  apply();
}
