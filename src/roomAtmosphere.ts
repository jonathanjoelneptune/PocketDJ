/**
 * Phase 1 living atmosphere: decorative, CSS-animated room light and dust.
 * Kept separate from scene geometry, lyric layout, and Spotify playback.
 * Particles are created only on setup or count changes; no JavaScript RAF loop.
 */
export type RoomAtmosphereSettings = {
  driftEnabled: boolean;
  driftIntensity: number;
  particlesEnabled: boolean;
  particleCount: number;
  particleOpacity: number;
};

const STORAGE_KEY = "pocketdj-room-atmosphere-v1";
export const DEFAULT_ROOM_ATMOSPHERE: RoomAtmosphereSettings = {
  driftEnabled: true,
  driftIntensity: 0.38,
  particlesEnabled: true,
  particleCount: 12,
  particleOpacity: 0.45,
};

function safeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function normalizedSettings(value: Partial<RoomAtmosphereSettings>): RoomAtmosphereSettings {
  return {
    driftEnabled: typeof value.driftEnabled === "boolean" ? value.driftEnabled : DEFAULT_ROOM_ATMOSPHERE.driftEnabled,
    driftIntensity: safeNumber(value.driftIntensity, DEFAULT_ROOM_ATMOSPHERE.driftIntensity, 0, 1),
    particlesEnabled: typeof value.particlesEnabled === "boolean" ? value.particlesEnabled : DEFAULT_ROOM_ATMOSPHERE.particlesEnabled,
    particleCount: Math.round(safeNumber(value.particleCount, DEFAULT_ROOM_ATMOSPHERE.particleCount, 0, 40)),
    particleOpacity: safeNumber(value.particleOpacity, DEFAULT_ROOM_ATMOSPHERE.particleOpacity, 0, 1),
  };
}

function loadSettings(): RoomAtmosphereSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? normalizedSettings(JSON.parse(saved) as Partial<RoomAtmosphereSettings>) : { ...DEFAULT_ROOM_ATMOSPHERE };
  } catch {
    return { ...DEFAULT_ROOM_ATMOSPHERE };
  }
}

let settings: RoomAtmosphereSettings = loadSettings();

function persistSettings(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private browsing / limited storage: current-session controls still work.
  }
}

// Deterministic positions prevent particles visibly jumping on re-entry.
function seededFraction(index: number, salt: number): number {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function renderParticles(): void {
  const host = document.querySelector<HTMLElement>("#roomAtmosphereParticles");
  if (!host || host.childElementCount === settings.particleCount) return;

  const fragment = document.createDocumentFragment();
  for (let index = 0; index < settings.particleCount; index += 1) {
    const mote = document.createElement("span");
    mote.className = index % 4 === 0 ? "room-atmosphere-mote room-atmosphere-mote-blue" : "room-atmosphere-mote";
    const duration = 17 + seededFraction(index, 4) * 15;
    mote.style.setProperty("--mote-x", `${(9 + seededFraction(index, 1) * 82).toFixed(2)}%`);
    mote.style.setProperty("--mote-y", `${(38 + seededFraction(index, 2) * 48).toFixed(2)}%`);
    mote.style.setProperty("--mote-size", (2.2 + seededFraction(index, 3) * 1.7).toFixed(2));
    mote.style.setProperty("--mote-drift-x", ((seededFraction(index, 5) - 0.5) * 112).toFixed(1));
    mote.style.setProperty("--mote-rise", (65 + seededFraction(index, 6) * 130).toFixed(1));
    mote.style.setProperty("--mote-alpha", (0.44 + seededFraction(index, 7) * 0.45).toFixed(2));
    mote.style.setProperty("--mote-duration", `${duration.toFixed(1)}s`);
    mote.style.setProperty("--mote-delay", `${(-seededFraction(index, 8) * duration).toFixed(1)}s`);
    fragment.appendChild(mote);
  }
  host.replaceChildren(fragment);
}

function applySettings(): void {
  const root = document.documentElement;
  root.classList.toggle("room-atmosphere-drift-enabled", settings.driftEnabled && settings.driftIntensity > 0);
  root.classList.toggle("room-atmosphere-particles-enabled", settings.particlesEnabled && settings.particleCount > 0 && settings.particleOpacity > 0);
  root.style.setProperty("--room-atmosphere-drift-intensity", settings.driftIntensity.toFixed(2));
  root.style.setProperty("--room-atmosphere-particle-opacity", settings.particleOpacity.toFixed(2));

  const driftEnabled = document.querySelector<HTMLInputElement>("#menu2AtmosphereDriftEnabled");
  const particlesEnabled = document.querySelector<HTMLInputElement>("#menu2AtmosphereParticlesEnabled");
  if (driftEnabled) driftEnabled.checked = settings.driftEnabled;
  if (particlesEnabled) particlesEnabled.checked = settings.particlesEnabled;

  const fields: Array<[keyof Pick<RoomAtmosphereSettings, "driftIntensity" | "particleCount" | "particleOpacity">, string]> = [
    ["driftIntensity", "menu2AtmosphereDriftIntensity"],
    ["particleCount", "menu2AtmosphereParticleCount"],
    ["particleOpacity", "menu2AtmosphereParticleOpacity"],
  ];
  for (const [key, id] of fields) {
    const number = settings[key];
    const value = key === "particleCount" ? String(number) : number.toFixed(2);
    const input = document.querySelector<HTMLInputElement>(`#${id}`);
    const readout = document.querySelector<HTMLElement>(`#${id}Value`);
    if (input) input.value = value;
    if (readout) readout.textContent = value;
  }
}

function updateMotionVisibility(): void {
  document.documentElement.classList.toggle("room-atmosphere-paused", document.hidden);
}

export function initializeRoomAtmosphere(): void {
  const bindToggle = (id: string, key: "driftEnabled" | "particlesEnabled"): void => {
    document.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener("change", (event) => {
      settings = { ...settings, [key]: (event.target as HTMLInputElement).checked };
      persistSettings();
      applySettings();
    });
  };
  bindToggle("menu2AtmosphereDriftEnabled", "driftEnabled");
  bindToggle("menu2AtmosphereParticlesEnabled", "particlesEnabled");

  const bindSlider = (id: string, key: "driftIntensity" | "particleCount" | "particleOpacity"): void => {
    document.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener("input", (event) => {
      const previousCount = settings.particleCount;
      settings = normalizedSettings({ ...settings, [key]: Number((event.target as HTMLInputElement).value) });
      persistSettings();
      if (settings.particleCount !== previousCount) renderParticles();
      applySettings();
    });
  };
  bindSlider("menu2AtmosphereDriftIntensity", "driftIntensity");
  bindSlider("menu2AtmosphereParticleCount", "particleCount");
  bindSlider("menu2AtmosphereParticleOpacity", "particleOpacity");

  document.querySelector<HTMLButtonElement>("#menu2AtmosphereReset")?.addEventListener("click", () => {
    settings = { ...DEFAULT_ROOM_ATMOSPHERE };
    persistSettings();
    renderParticles();
    applySettings();
  });

  renderParticles();
  applySettings();
  updateMotionVisibility();
  document.addEventListener("visibilitychange", updateMotionVisibility);
  window.addEventListener("pagehide", () => document.documentElement.classList.add("room-atmosphere-paused"));
  window.addEventListener("pageshow", updateMotionVisibility);
}
