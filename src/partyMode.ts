/**
 * PocketDJ Party Mode: a single transparent Canvas 2D overlay.
 *
 * Independent of the existing room lighting. Uses the ALREADY interpolated
 * album colors and ALREADY determined speaker BPM from main.ts; no new
 * Spotify requests, animations on full-size CSS filters, or additional RAF.
 * updatePartyMode() is invoked from the existing main tick, and draws at a
 * bounded rate only while a party effect is visible or fading.
 */
type Rgb = readonly [number, number, number];
type PartyEffect = "concert" | "disco" | "lasers" | "haze";
export type PartyMode = "off" | "auto" | PartyEffect;

export type PartyFrame = {
  now: number;
  trackKey: string;
  title: string;
  artist: string;
  album: string;
  bpm: number;
  bpmSource: string;
  playing: boolean;
  speaking: boolean;
  primary: Rgb;
  secondary: Rgb;
};

type PartySettings = { mode: PartyMode; intensity: number };

const STORAGE_KEY = "pocketdj-party-mode-v1";
const MODES: readonly PartyMode[] = ["off", "auto", "concert", "disco", "lasers", "haze"];
const DEFAULT: PartySettings = { mode: "off", intensity: 0.72 };
const SMALL_SCREEN = window.matchMedia("(pointer: coarse)").matches;
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");
const DRAW_INTERVAL_MS = SMALL_SCREEN ? 55 : 35; // <=18 FPS mobile, <=29 desktop
const REST_AFTER_TRACK_CHANGE_MS = 1350;
const FADE_IN_MS = 1250;
const FADE_OUT_MS = 750;

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let settings: PartySettings = readSettings();
let lastFrame: PartyFrame | null = null;
let currentEffect: PartyEffect = "concert";
let desiredEffect: PartyEffect = "concert";
let lastTrackKey = "";
let restUntil = 0;
let opacity = 0;
let lastUpdate = 0;
let lastPaint = -Infinity;
let painted = false;
let pixelScale = 1;
let w = 0;
let h = 0;
let currentStatus = "";

function clamp(v: unknown, def: number, min: number, max: number): number {
  const value = Number(v);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : def;
}
function readSettings(): PartySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT };
    const value = JSON.parse(raw) as Partial<PartySettings>;
    return {
      mode: MODES.includes(value.mode as PartyMode) ? value.mode as PartyMode : DEFAULT.mode,
      intensity: clamp(value.intensity, DEFAULT.intensity, 0.2, 1),
    };
  } catch { return { ...DEFAULT }; }
}
function save(): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
  catch { /* The effect works with blocked storage. */ }
}
function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}
function noise(index: number, seed = 0): number {
  let x = Math.imul(index + 17, 0x45d9f3b) ^ Math.imul(seed + 19, 0x119de1f3);
  x ^= x >>> 16;
  x = Math.imul(x, 0x45d9f3b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967295;
}
function rgba(color: Rgb, a: number): string {
  return `rgba(${color[0]},${color[1]},${color[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

/** Genre hints are only text clues: Spotify playback doesn't supply genres.
 * Available BPM (possibly estimated) handles the rest. Stable track hashing
 * adds variety without a random effect switch midway through a song.
 */
function inferEffect(frame: PartyFrame): PartyEffect {
  const text = `${frame.title} ${frame.artist} ${frame.album}`.toLowerCase();
  if (/\b(disco|funk|funky|boogie|nu.?disco|motown|soul train)\b/.test(text)) return "disco";
  if (/\b(ambient|downtempo|lo.?fi|chill|dream pop|acoustic|ballad|meditation|relax|sleep)\b/.test(text)) return "haze";
  if (/\b(techno|house|trance|rave|dubstep|drum.?and.?bass|edm|electro|dancefloor|club mix)\b/.test(text)) return "lasers";
  if (/\b(rock|punk|metal|live|concert|festival|hip.?hop|rap|stadium)\b/.test(text)) return "concert";
  const bpm = clamp(frame.bpm, 98, 55, 200);
  const n = hash(frame.trackKey || text) % 10;
  if (bpm >= 135) return n < 8 ? "lasers" : "concert";
  if (bpm >= 114) return n < 4 ? "lasers" : n < 8 ? "disco" : "concert";
  if (bpm >= 92) return n < 5 ? "concert" : n < 8 ? "disco" : "haze";
  return n < 6 ? "haze" : n < 8 ? "disco" : "concert";
}
function resolveEffect(frame: PartyFrame): PartyEffect {
  return settings.mode === "auto" ? inferEffect(frame) :
    settings.mode === "off" ? currentEffect : settings.mode;
}
function label(effect: PartyEffect): string {
  return { concert: "Concert Lights", disco: "Disco Fever", lasers: "Laser Show", haze: "Atmospheric Haze" }[effect];
}
function syncMenu(): void {
  const select = document.getElementById("menu2PartyModeSelect") as HTMLSelectElement | null;
  const slider = document.getElementById("menu2PartyIntensity") as HTMLInputElement | null;
  const value = document.getElementById("menu2PartyIntensityValue");
  if (select) select.value = settings.mode;
  if (slider) slider.value = String(settings.intensity);
  if (value) value.textContent = settings.intensity.toFixed(2);
  document.documentElement.classList.toggle("party-mode-active", settings.mode !== "off");
  for (const id of ["roomPartyTapLeft", "roomPartyTapRight"]) {
    document.getElementById(id)?.setAttribute("aria-pressed", String(settings.mode !== "off"));
  }
  syncStatus();
}
function syncStatus(): void {
  const status = settings.mode === "off" ? "Off · Triple-tap either wall light to start Auto" :
    REDUCED_MOTION.matches ? "On · Effects hidden by reduced-motion preference" :
    !lastFrame?.playing ? "On · Resting until music plays" :
    lastFrame.speaking ? "On · Quiet while DJ speaks" :
    `${settings.mode === "auto" ? "Auto" : "Manual"} · ${label(desiredEffect)}`;
  if (status === currentStatus) return;
  currentStatus = status;
  const element = document.getElementById("menu2PartyStatus");
  if (element) element.textContent = status;
}
function setMode(mode: PartyMode): void {
  settings.mode = MODES.includes(mode) ? mode : "off";
  if (settings.mode !== "off" && lastFrame) desiredEffect = resolveEffect(lastFrame);
  save();
  syncMenu();
}
function toggleAuto(): void {
  setMode(settings.mode === "off" ? "auto" : "off");
}

/** Hitboxes sit just over the wall fixtures and allow native swipe gestures.
 * No tap calls preventDefault; only three completed stationary taps count.
 * Keyboard activation is available through these buttons and Room controls.
 */
function bindTripleTap(id: string): void {
  const hit = document.getElementById(id);
  if (!hit) return;
  let down: { id: number; x: number; y: number } | null = null;
  let taps = 0;
  let lastTapAt = -Infinity;
  hit.addEventListener("pointerdown", event => {
    const e = event as PointerEvent;
    if (e.button !== 0) return;
    down = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  hit.addEventListener("pointercancel", () => { down = null; taps = 0; });
  hit.addEventListener("pointerup", event => {
    const e = event as PointerEvent;
    if (!down || down.id !== e.pointerId) return;
    const distance = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (distance > 18) { taps = 0; return; }
    const t = performance.now();
    taps = t - lastTapAt <= 520 ? taps + 1 : 1;
    lastTapAt = t;
    if (taps >= 3) {
      taps = 0;
      lastTapAt = -Infinity;
      toggleAuto();
    }
  });
  hit.addEventListener("keydown", event => {
    const e = event as KeyboardEvent;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleAuto();
    }
  });
}
export function initializePartyMode(): void {
  canvas = document.getElementById("roomPartyCanvas") as HTMLCanvasElement | null;
  ctx = canvas?.getContext("2d", { alpha: true }) ?? null;
  bindTripleTap("roomPartyTapLeft");
  bindTripleTap("roomPartyTapRight");
  document.getElementById("menu2PartyModeSelect")?.addEventListener("change", event => {
    setMode((event.target as HTMLSelectElement).value as PartyMode);
  });
  document.getElementById("menu2PartyIntensity")?.addEventListener("input", event => {
    settings.intensity = clamp((event.target as HTMLInputElement).value, DEFAULT.intensity, 0.2, 1);
    save();
    syncMenu();
  });
  document.getElementById("menu2PartyReset")?.addEventListener("click", () => setMode("off"));
  syncMenu();
}

function resizeIfNeeded(): boolean {
  if (!canvas || !ctx) return false;
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (width < 4 || height < 4) return false;
  const limit = SMALL_SCREEN ? 1.45 : 1.75;
  const scale = Math.min(window.devicePixelRatio || 1, limit, 1400 / width, 1800 / height);
  const pxW = Math.round(width * scale), pxH = Math.round(height * scale);
  if (canvas.width !== pxW || canvas.height !== pxH) {
    canvas.width = pxW;
    canvas.height = pxH;
  }
  pixelScale = scale;
  w = width;
  h = height;
  ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
  return true;
}

function paintBeam(fromX: number, fromY: number, toX: number, toY: number,
                   spread: number, color: Rgb, alpha: number): void {
  if (!ctx) return;
  // Layered, feathered cones: no CSS blur, video, or other GPU surfaces.
  for (let layer = 3; layer >= 0; layer--) {
    const fraction = [0.24, 0.48, 0.75, 1.0][layer];
    const gradient = ctx.createLinearGradient(fromX, fromY, toX, toY);
    gradient.addColorStop(0, rgba(color, alpha * (layer === 0 ? 0.65 : 0.22)));
    gradient.addColorStop(0.45, rgba(color, alpha * (layer === 0 ? 0.45 : 0.20)));
    gradient.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX - spread * fraction, toY);
    ctx.lineTo(toX + spread * fraction, toY);
    ctx.closePath();
    ctx.fill();
  }
}
function drawConcert(t: number, bpm: number, a: Rgb, b: Rgb): void {
  if (!ctx) return;
  const tempo = Math.max(0.5, Math.min(1.65, bpm / 112));
  for (let i = 0; i < 6; i++) {
    const side = i % 2;
    const sx = side ? w * 1.065 : -w * 0.065;
    const sy = h * (-0.07 + (i % 3) * 0.028);
    const sweep = Math.sin(t * (0.31 + i * 0.038) * tempo + i * 1.83);
    const dx = w * (0.50 + 0.43 * sweep);
    const dy = h * (0.58 + 0.20 * Math.sin(t * 0.17 * tempo + i));
    paintBeam(sx, sy, dx, dy, w * 0.055, side ? b : a, 0.35);
  }
}
function drawDisco(t: number, bpm: number, a: Rgb, b: Rgb, seed: number): void {
  if (!ctx) return;
  const count = SMALL_SCREEN ? 43 : 64;
  const tempo = Math.max(0.55, Math.min(1.55, bpm / 115));
  for (let i = 0; i < count; i++) {
    const rx = noise(i * 17, seed), ry = noise(i * 29, seed);
    const angular = t * 0.14 * tempo + ry * Math.PI * 2;
    const x = ((rx * 1.24 - 0.12 + 0.11 * Math.cos(angular)) % 1.2) * w;
    const y = (0.07 + ry * 0.79 + 0.043 * Math.sin(angular + i)) * h;
    const radius = Math.max(1.5, w * (0.002 + noise(i * 41, seed) * 0.005));
    const color = i % 2 ? a : b;
    if (i % 4 === 0) {
      const halo = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.8);
      halo.addColorStop(0, rgba(color, 0.18));
      halo.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(x, y, radius * 2.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = rgba(color, 0.14 + 0.1 * noise(i * 23, seed));
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  }
}
function drawLasers(t: number, bpm: number, a: Rgb, b: Rgb): void {
  if (!ctx) return;
  const tempo = Math.max(0.6, Math.min(1.7, bpm / 118));
  ctx.lineCap = "round";
  for (let i = 0; i < 14; i++) {
    const side = i % 2;
    const startX = side ? w * 1.05 : -w * 0.05;
    const startY = h * (0.13 + (Math.floor(i / 2) % 3) * 0.28);
    const angle = t * (0.19 + i * 0.011) * tempo + i * 0.37;
    const targetX = w * (0.50 + 0.51 * Math.sin(angle));
    const targetY = h * (0.24 + 0.61 * (i / 14));
    const color = side ? b : a;
    ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(targetX, targetY);
    ctx.lineWidth = Math.max(2.2, w * 0.0045);
    ctx.strokeStyle = rgba(color, 0.085); ctx.stroke();
    ctx.lineWidth = Math.max(0.65, w * 0.0009);
    ctx.strokeStyle = rgba(color, 0.36); ctx.stroke();
  }
}
function drawHaze(t: number, bpm: number, a: Rgb, b: Rgb, seed: number): void {
  if (!ctx) return;
  const tempo = Math.max(0.5, Math.min(1.35, bpm / 108));
  const count = SMALL_SCREEN ? 8 : 11;
  for (let i = 0; i < count; i++) {
    const nx = noise(i * 37, seed), ny = noise(i * 53, seed);
    const x = w * (nx * 1.14 - 0.07 + 0.07 * Math.sin(t * 0.065 * tempo + i));
    const y = h * (0.62 + ny * 0.34 + 0.018 * Math.cos(t * 0.09 + i));
    const r = w * (0.10 + 0.12 * noise(i * 61, seed));
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.36);
    const cloud = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    const color = i % 2 ? a : b;
    cloud.addColorStop(0, rgba(color, 0.10));
    cloud.addColorStop(0.54, rgba(color, 0.045));
    cloud.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = cloud;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function render(frame: PartyFrame): void {
  if (!canvas || !ctx || !resizeIfNeeded()) return;
  ctx.clearRect(0, 0, w, h);
  painted = false;
  if (opacity < 0.003) return;

  const seed = hash(frame.trackKey);
  const seconds = frame.now / 1000;
  ctx.save();
  ctx.globalAlpha = Math.min(0.88, opacity * settings.intensity);
  if (currentEffect === "concert") drawConcert(seconds, frame.bpm, frame.primary, frame.secondary);
  else if (currentEffect === "disco") drawDisco(seconds, frame.bpm, frame.primary, frame.secondary, seed);
  else if (currentEffect === "lasers") drawLasers(seconds, frame.bpm, frame.primary, frame.secondary);
  else drawHaze(seconds, frame.bpm, frame.primary, frame.secondary, seed);
  ctx.restore();
  painted = true;
}

/** Called from PocketDJ's existing RAF. This function never schedules RAF. */
export function updatePartyMode(frame: PartyFrame): void {
  lastFrame = frame;
  if (!canvas || !ctx) return;
  if (REDUCED_MOTION.matches) {
    opacity = 0;
    painted = false;
    if (canvas.style.display !== "none") canvas.style.display = "none";
    syncStatus();
    return;
  }

  const changingSong = Boolean(lastTrackKey && frame.trackKey !== lastTrackKey);
  if (lastTrackKey !== frame.trackKey) {
    lastTrackKey = frame.trackKey;
    if (changingSong) restUntil = frame.now + REST_AFTER_TRACK_CHANGE_MS;
    if (settings.mode !== "off") desiredEffect = resolveEffect(frame);
  }
  if (settings.mode !== "off" && settings.mode !== "auto") desiredEffect = settings.mode;
  if (settings.mode === "auto" && !lastTrackKey) desiredEffect = inferEffect(frame);

  const timeDelta = lastUpdate ? Math.min(120, frame.now - lastUpdate) : 16;
  lastUpdate = frame.now;
  const active = settings.mode !== "off" && frame.playing && !frame.speaking &&
    !document.hidden && frame.now >= restUntil;
  const switching = currentEffect !== desiredEffect;
  if (switching && opacity <= 0.025) currentEffect = desiredEffect;
  const target = active && currentEffect === desiredEffect ? 1 : 0;
  const duration = target ? FADE_IN_MS : FADE_OUT_MS;
  opacity += (target - opacity) * Math.min(1, Math.max(0, timeDelta) / duration);
  if (opacity < 0.003) opacity = 0;

  // Stop all drawing and release the canvas display layer once an effect has
  // fully faded, including while paused, when DJ speaks, and when switched Off.
  // The main RAF keeps providing state, so playback can resume immediately.
  if (opacity === 0 && !active && currentEffect === desiredEffect) {
    if (painted) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      painted = false;
    }
    if (canvas.style.display !== "none") canvas.style.display = "none";
    syncStatus();
    return;
  }
  if (canvas.style.display !== "block") canvas.style.display = "block";
  if (frame.now - lastPaint >= DRAW_INTERVAL_MS || (painted && opacity === 0)) {
    lastPaint = frame.now;
    render(frame);
  }
  syncStatus();
}
