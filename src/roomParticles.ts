/**
 * Optional floating dust motes, isolated from spotlights, lyrics, and gameplay.
 *
 * Prevents the previously reported mobile flicker: no nodes are created unless
 * a fine-pointer desktop media query matches. No canvas, filters, full-room
 * blend modes, JS frame loops, timers, or changes to existing scene geometry.
 */
export type RoomParticleSettings = {
  enabled: boolean;
  count: number;
  visibility: number;
};

const STORAGE_KEY = "pocketdj-room-particles-v2";
const DESKTOP_MOTION_QUERY = "(hover: hover) and (pointer: fine) and (min-width: 960px) and (prefers-reduced-motion: no-preference)";
const DEFAULTS: RoomParticleSettings = { enabled: true, count: 14, visibility: 0.65 };
let settings = readSettings();
let desktopMedia: MediaQueryList | null = null;
let lastRenderedCount = -1;

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(min, Math.min(max, num)) : fallback;
}

function normalize(source: Partial<RoomParticleSettings>): RoomParticleSettings {
  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : DEFAULTS.enabled,
    count: Math.round(clamp(source.count, DEFAULTS.count, 0, 40)),
    visibility: clamp(source.visibility, DEFAULTS.visibility, 0, 1),
  };
}
function readSettings(): RoomParticleSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw) as Partial<RoomParticleSettings>) : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}
function save(): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
  catch { /* Do not break playback if storage is unavailable. */ }
}
function randomPosition(index: number, salt: number): number {
  const value = Math.sin(index * 32.217 + salt * 71.391) * 143758.5453;
  return value - Math.floor(value);
}

function render(): void {
  const host = document.querySelector<HTMLElement>("#roomParticles");
  if (!host) return;
  // Also remove pre-existing particles when resized into a mobile / touch layout.
  if (!desktopMedia?.matches || !settings.enabled || settings.count === 0 || settings.visibility === 0) {
    if (host.childElementCount) host.replaceChildren();
    lastRenderedCount = -1;
    return;
  }
  if (lastRenderedCount === settings.count && host.childElementCount === settings.count) return;
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < settings.count; index += 1) {
    const particle = document.createElement("span");
    particle.className = index % 4 === 0 ? "room-particle room-particle-cool" : "room-particle";
    particle.style.setProperty("--particle-x", `${(7 + randomPosition(index + 1, 1) * 86).toFixed(2)}%`);
    particle.style.setProperty("--particle-y", `${(34 + randomPosition(index + 1, 2) * 47).toFixed(2)}%`);
    particle.style.setProperty("--particle-size", (3.0 + randomPosition(index + 1, 3) * 3.1).toFixed(2));
    particle.style.setProperty("--particle-drift-x", ((randomPosition(index + 1, 4) - 0.5) * 155).toFixed(1));
    particle.style.setProperty("--particle-rise", (55 + randomPosition(index + 1, 5) * 150).toFixed(1));
    particle.style.setProperty("--particle-alpha", (0.55 + randomPosition(index + 1, 6) * 0.45).toFixed(2));
    const duration = 18 + randomPosition(index + 1, 7) * 17;
    particle.style.setProperty("--particle-duration", `${duration.toFixed(2)}s`);
    particle.style.setProperty("--particle-delay", `${(-duration * randomPosition(index + 1, 8)).toFixed(2)}s`);
    fragment.appendChild(particle);
  }
  host.replaceChildren(fragment);
  lastRenderedCount = settings.count;
}

function update(): void {
  const root = document.documentElement;
  root.classList.toggle("room-particles-active", settings.enabled && settings.count > 0 && settings.visibility > 0 && Boolean(desktopMedia?.matches));
  root.classList.toggle("room-particles-paused", document.hidden);
  root.style.setProperty("--room-particles-opacity", settings.visibility.toFixed(2));
  const enabled = document.querySelector<HTMLInputElement>("#menu2ParticlesEnabled");
  const count = document.querySelector<HTMLInputElement>("#menu2ParticlesCount");
  const visibility = document.querySelector<HTMLInputElement>("#menu2ParticlesVisibility");
  const countReadout = document.querySelector<HTMLElement>("#menu2ParticlesCountValue");
  const visibilityReadout = document.querySelector<HTMLElement>("#menu2ParticlesVisibilityValue");
  if (enabled) enabled.checked = settings.enabled;
  if (count) count.value = String(settings.count);
  if (visibility) visibility.value = settings.visibility.toFixed(2);
  if (countReadout) countReadout.textContent = String(settings.count);
  if (visibilityReadout) visibilityReadout.textContent = settings.visibility.toFixed(2);
  render();
}

export function initializeRoomParticles(): void {
  desktopMedia = window.matchMedia(DESKTOP_MOTION_QUERY);
  desktopMedia.addEventListener("change", update);
  document.addEventListener("visibilitychange", update);
  window.addEventListener("pageshow", update);

  document.querySelector<HTMLInputElement>("#menu2ParticlesEnabled")?.addEventListener("change", (event) => {
    settings = { ...settings, enabled: (event.target as HTMLInputElement).checked };
    save(); update();
  });
  document.querySelector<HTMLInputElement>("#menu2ParticlesCount")?.addEventListener("input", (event) => {
    settings = normalize({ ...settings, count: Number((event.target as HTMLInputElement).value) });
    save(); update();
  });
  document.querySelector<HTMLInputElement>("#menu2ParticlesVisibility")?.addEventListener("input", (event) => {
    settings = normalize({ ...settings, visibility: Number((event.target as HTMLInputElement).value) });
    save(); update();
  });
  document.querySelector<HTMLButtonElement>("#menu2ParticlesReset")?.addEventListener("click", () => {
    settings = { ...DEFAULTS };
    save(); update();
  });
  update();
}
