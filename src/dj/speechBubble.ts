// Wordless Spotify AI DJ bubble. Consumes existing /me/player data, makes no calls.
export type SpotifyDjSpeechObservation = {
  httpStatus: 200 | 204;
  isPlaying: boolean;
  itemPresent: boolean;
  currentlyPlayingType: string | null;
};
type Palette = "amber" | "violet" | "teal" | "rose" | "parchment";
type Settings = { enabled: boolean; palette: Palette; x: number; y: number; scale: number; opacity: number; glow: number };
type Range = "x" | "y" | "scale" | "opacity" | "glow";
type SpeechState = "off" | "music" | "possible" | "likely";

const STORAGE_KEY = "pocketdj-spotify-ai-dj-bubble-v1";
const DEFAULTS: Settings = { enabled: true, palette: "amber", x: 60.8, y: 34, scale: 1, opacity: 0.92, glow: 0.45 };
const PALETTES: Palette[] = ["amber", "violet", "teal", "rose", "parchment"];
const LIMITS: Record<Range, [number, number]> = {
  x: [4, 94], y: [7, 82], scale: [0.5, 2.2], opacity: [0.12, 1], glow: [0, 1],
};
const byId = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;
function finite(value: unknown, fallback: number, min: number, max: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(min, Math.min(max, num)) : fallback;
}
function validate(value: Partial<Settings>): Settings {
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULTS.enabled,
    palette: PALETTES.includes(value.palette as Palette) ? value.palette as Palette : DEFAULTS.palette,
    x: finite(value.x, DEFAULTS.x, ...LIMITS.x),
    y: finite(value.y, DEFAULTS.y, ...LIMITS.y),
    scale: finite(value.scale, DEFAULTS.scale, ...LIMITS.scale),
    opacity: finite(value.opacity, DEFAULTS.opacity, ...LIMITS.opacity),
    glow: finite(value.glow, DEFAULTS.glow, ...LIMITS.glow),
  };
}
function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? validate(JSON.parse(raw) as Partial<Settings>) : { ...DEFAULTS };
  } catch { return { ...DEFAULTS }; }
}
let settings = load();
let state: SpeechState = "off";
let musicObserved = false;
let candidateStreak = 0;
let previewTimer: number | null = null;
let expiryTimer: number | null = null;
let initialized = false;

function save(): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* optional persistence */ }
}
function renderState(): void {
  const bubble = byId<HTMLElement>("spotifyDjSpeechBubble");
  if (!bubble) return;
  const preview = previewTimer !== null;
  const show = preview || (settings.enabled && (state === "possible" || state === "likely"));
  bubble.dataset.speechState = show ? (preview ? "likely" : state) : "off";
  bubble.classList.toggle("spotify-dj-speech-visible", show);
  bubble.setAttribute("aria-hidden", "true"); // Decorative only; never claims to quote Spotify.
  const status = byId<HTMLElement>("menu2DjSpeechBubbleStatus");
  if (status) status.textContent = preview ? "Visual preview; detector unaffected" :
    !settings.enabled ? "Off (disabled)" :
    state === "likely" ? "Likely DJ speaking (multiple samples)" :
    state === "possible" ? "Possible DJ speaking (first sample)" :
    state === "music" ? "Music playing; bubble hidden" : "Waiting for music; bubble hidden";
}
function applySettings(): void {
  const bubble = byId<HTMLElement>("spotifyDjSpeechBubble");
  if (bubble) {
    bubble.dataset.palette = settings.palette;
    bubble.style.setProperty("--dj-speech-x", settings.x.toFixed(1) + "%");
    bubble.style.setProperty("--dj-speech-y", settings.y.toFixed(1) + "%");
    bubble.style.setProperty("--dj-speech-scale", settings.scale.toFixed(2));
    bubble.style.setProperty("--dj-speech-opacity", settings.opacity.toFixed(2));
    bubble.style.setProperty("--dj-speech-glow", settings.glow.toFixed(2));
  }
  const enabled = byId<HTMLInputElement>("menu2DjSpeechBubbleEnabled");
  const palette = byId<HTMLSelectElement>("menu2DjSpeechBubblePalette");
  if (enabled) enabled.checked = settings.enabled;
  if (palette) palette.value = settings.palette;
  const format: Record<Range, (v: number) => string> = {
    x: v => v.toFixed(1) + "%", y: v => v.toFixed(1) + "%",
    scale: v => v.toFixed(2) + "x", opacity: v => Math.round(v * 100) + "%",
    glow: v => Math.round(v * 100) + "%",
  };
  for (const key of Object.keys(LIMITS) as Range[]) {
    const id = "menu2DjSpeechBubble" + key[0].toUpperCase() + key.slice(1);
    const input = byId<HTMLInputElement>(id);
    const value = byId<HTMLElement>(id + "Value");
    if (input) input.value = String(settings[key]);
    if (value) value.textContent = format[key](settings[key]);
  }
  renderState();
}
function endPreview(): void {
  if (previewTimer !== null) window.clearTimeout(previewTimer);
  previewTimer = null;
  const button = byId<HTMLButtonElement>("menu2DjSpeechBubblePreview");
  if (button) button.textContent = "Preview for 5 seconds";
  renderState();
}
function preview(): void {
  if (previewTimer !== null) endPreview();
  previewTimer = window.setTimeout(endPreview, 5000);
  const button = byId<HTMLButtonElement>("menu2DjSpeechBubblePreview");
  if (button) button.textContent = "Previewing...";
  renderState();
}
export function initializeSpotifyDjSpeechBubble(): void {
  if (initialized) return;
  initialized = true;
  byId<HTMLInputElement>("menu2DjSpeechBubbleEnabled")?.addEventListener("change", event => {
    settings.enabled = (event.target as HTMLInputElement).checked;
    save();
    applySettings();
  });
  byId<HTMLSelectElement>("menu2DjSpeechBubblePalette")?.addEventListener("change", event => {
    const value = (event.target as HTMLSelectElement).value as Palette;
    settings.palette = PALETTES.includes(value) ? value : DEFAULTS.palette;
    save();
    applySettings();
  });
  for (const key of Object.keys(LIMITS) as Range[]) {
    const id = "menu2DjSpeechBubble" + key[0].toUpperCase() + key.slice(1);
    byId<HTMLInputElement>(id)?.addEventListener("input", event => {
      settings = validate({ ...settings, [key]: Number((event.target as HTMLInputElement).value) });
      save();
      applySettings();
    });
  }
  byId<HTMLButtonElement>("menu2DjSpeechBubblePreview")?.addEventListener("click", preview);
  byId<HTMLButtonElement>("menu2DjSpeechBubbleReset")?.addEventListener("click", () => {
    settings = { ...DEFAULTS };
    save();
    applySettings();
  });
  applySettings();
}

// Spotify item:null is not an official AI DJ flag. Only infer speech after
// a normal track and while Spotify reports active playback of a track-type item.
export function observeSpotifyDjSpeech(observation: SpotifyDjSpeechObservation): void {
  if (observation.httpStatus !== 200 || !observation.isPlaying) {
    state = "off";
    musicObserved = false;
    candidateStreak = 0;
  } else if (observation.itemPresent) {
    state = "music";
    candidateStreak = 0;
    musicObserved = observation.currentlyPlayingType === "track";
  } else if (observation.currentlyPlayingType === "track" && musicObserved) {
    candidateStreak++;
    state = candidateStreak > 1 ? "likely" : "possible";
  } else {
    state = "off";
    candidateStreak = 0;
  }
  if (expiryTimer !== null) window.clearTimeout(expiryTimer);
  expiryTimer = window.setTimeout(() => {
    expiryTimer = null;
    if (state === "possible" || state === "likely") {
      state = "off";
      candidateStreak = 0;
      renderState();
    }
  }, 9000);
  renderState();
}
export function clearSpotifyDjSpeechBubble(): void {
  state = "off";
  musicObserved = false;
  candidateStreak = 0;
  if (expiryTimer !== null) window.clearTimeout(expiryTimer);
  expiryTimer = null;
  endPreview();
  renderState();
}
