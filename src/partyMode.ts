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
  wallBarsSwapped: boolean;
};

type PartySettings = { mode: PartyMode; intensity: number };

const STORAGE_KEY = "pocketdj-party-mode-v1";
const MODES: readonly PartyMode[] = ["off", "auto", "concert", "disco", "lasers", "haze"];
const DEFAULT: PartySettings = { mode: "off", intensity: 0.72 };
const SMALL_SCREEN = window.matchMedia("(pointer: coarse)").matches;
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");
// Limit the dirty Canvas texture on Android WebView: lower pixel resolution
// and fewer uploads reduce the risk of other scene textures flashing.
const DRAW_INTERVAL_MS = SMALL_SCREEN ? 55 : 35; // ~18 FPS mobile, ~29 desktop; keep the persistent low-DPR canvas
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
  // Keep one stable transparent compositor surface for the app lifetime.
  // Toggling display:none during pauses/track changes destroyed/recreated a
  // full-room texture and could make WebView drop nearby speaker/DJ assets.
  // A transparent canvas stays mounted; we clear only when content changes.
  if (canvas) canvas.style.display = "block";
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
  const limit = SMALL_SCREEN ? 0.90 : 1.4;
  const scale = Math.min(window.devicePixelRatio || 1, limit,
    (SMALL_SCREEN ? 920 : 1350) / width, (SMALL_SCREEN ? 700 : 1050) / height);
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


/** Fractional beam visibility avoids lines popping on/off as a song evolves. */
function beamVisibility(index: number, movingCount: number): number {
  return Math.max(0, Math.min(1, movingCount - index));
}
function paintBeam(fromX: number, fromY: number, toX: number, toY: number,
                   spread: number, color: Rgb, alpha: number): void {
  if (!ctx || alpha < 0.002) return;
  // Two transparent cones instead of four large blended passes. Broad edge
  // plus a narrow core keep depth while reducing full-canvas raster work.
  for (let layer = 0; layer < 2; layer++) {
    const fraction = layer === 0 ? 1 : 0.33;
    const gradient = ctx.createLinearGradient(fromX, fromY, toX, toY);
    gradient.addColorStop(0, rgba(color, alpha * (layer === 0 ? 0.20 : 0.45)));
    gradient.addColorStop(0.44, rgba(color, alpha * (layer === 0 ? 0.15 : 0.28)));
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

function drawConcert(t: number, bpm: number, left: Rgb, right: Rgb, seed: number): void {
  if (!ctx) return;
  const tempo = clamp(bpm / 112, 1, 0.50, 1.65);
  const phase = noise(11, seed) * Math.PI * 2;
  // 5-11 beams with fractional visibility, changing continuously rather
  // than jumping the count every measure.
  const density = 5.6 + 4.2 * (0.5 + 0.5 * Math.sin(t * 0.22 * tempo + phase));
  for (let i = 0; i < 11; i++) {
    const visibility = beamVisibility(i, density);
    if (visibility < 0.02) continue;
    const side = i % 2;
    const sx = side ? w * 1.08 : -w * 0.08;
    const sy = -h * (0.07 + (i % 3) * 0.028);
    const sweep = Math.sin(t * (0.27 + i * 0.026) * tempo + i * 1.83 + phase * 0.2);
    const dx = w * (0.50 + 0.48 * sweep);
    const dy = h * (0.55 + 0.24 * Math.sin(t * 0.13 * tempo + i));
    const widthPulse = 0.64 + 0.65 * (0.5 + 0.5 *
      Math.sin(t * 0.36 * tempo + i * 1.09 + phase));
    const spread = w * (0.045 + 0.027 * noise(i + 41, seed)) * widthPulse;
    // The left-side party beams use the right wall-bar color, and vice versa.
    paintBeam(sx, sy, dx, dy, spread, side ? right : left,
      0.60 * visibility);
  }
}

function drawDisco(t: number, bpm: number, left: Rgb, right: Rgb, seed: number): void {
  if (!ctx) return;
  const tempo = clamp(bpm / 115, 1, 0.55, 1.55);
  const ringCount = SMALL_SCREEN ? 5 : 6;
  const facetsPerRing = 14;
  const tau = Math.PI * 2;
  // Every mirror facet is fixed relative to ONE rotating disco ball.
  // Unlike the old independently wandering dots, they all share this
  // angular velocity, and trace coordinated light bands across the walls,
  // ceiling, DJ platform and floor.
  const rotation = t * 0.25 * tempo + noise(17, seed) * tau;
  const virtualBallX = w * 0.5;
  const virtualBallY = h * 0.15;
  for (let ring = 0; ring < ringCount; ring++) {
    const depth = ring / Math.max(1, ringCount - 1);
    const radiusX = w * (0.24 + depth * 0.245);
    const radiusY = h * (0.17 + depth * 0.27);
    const mirrorOffset = ring % 2 ? Math.PI / facetsPerRing : 0;
    for (let facet = 0; facet < facetsPerRing; facet++) {
      const angle = rotation + facet * tau / facetsPerRing + mirrorOffset;
      const x = virtualBallX + Math.cos(angle) * radiusX;
      const y = h * 0.50 + Math.sin(angle) * radiusY;
      const ordinal = ring * facetsPerRing + facet;
      const color = ordinal % 2 ? left : right;
      const shimmer = 0.77 + 0.23 * Math.max(0, Math.cos(angle));
      const size = Math.max(2.6, w * (0.0034 + 0.003 * noise(ordinal * 41, seed)));

      // A few faint shared-origin rays make the projection read as a real
      // mirrored-ball light pattern, not independent moving particles.
      if (ordinal % 14 === 0) {
        ctx.beginPath();
        ctx.moveTo(virtualBallX, virtualBallY);
        ctx.lineTo(x, y);
        ctx.lineWidth = Math.max(0.65, w * 0.0008);
        ctx.strokeStyle = rgba(color, 0.065 * shimmer);
        ctx.stroke();
      }

      if (ordinal % 5 === 0) {
        const halo = ctx.createRadialGradient(x, y, 0, x, y, size * 3);
        halo.addColorStop(0, rgba(color, 0.34 * shimmer));
        halo.addColorStop(0.65, rgba(color, 0.10 * shimmer));
        halo.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(x, y, size * 3, 0, tau);
        ctx.fill();
      }

      // Discrete mirrored tiles suit PocketDJ's pixel-art room.
      ctx.fillStyle = rgba(color, (0.34 + 0.17 * noise(ordinal * 23, seed)) * shimmer);
      ctx.fillRect(x - size * 0.65, y - size * 0.55, size * 1.3, size * 1.1);
    }
  }
}
function drawLasers(t: number, bpm: number, left: Rgb, right: Rgb, seed: number): void {
  if (!ctx) return;
  const tempo = clamp(bpm / 118, 1, 0.65, 1.70);
  const phase = noise(7, seed) * Math.PI * 2;
  const density = 7.4 + 7.4 * (0.5 + 0.5 * Math.sin(t * 0.26 * tempo + phase));
  ctx.lineCap = "round";
  for (let i = 0; i < 16; i++) {
    const visibility = beamVisibility(i, density);
    if (visibility < 0.02) continue;
    const source = i % 4;
    const fromCeiling = source >= 2;
    const leftSource = source === 0 || source === 2;
    // The upper pair is mechanically pinned to the LOWER CORNERS of the
    // ceiling (above the sign), not floating halfway down the wall.
    // This is the existing z75 Canvas, above the marquee (z3), so the
    // thin beams naturally sweep OVER its face and song text. No second
    // GPU Canvas layer is necessary.
    const sx = fromCeiling
      ? w * (leftSource ? 0.255 : 0.745)
      : w * (leftSource ? -0.045 : 1.045);
    const sy = fromCeiling ? h * 0.19 : h * 1.07;
    const aim = Math.sin(t * (0.16 + 0.015 * (i % 5)) * tempo + i * 0.69 + phase);
    const dx = w * (0.50 + (fromCeiling ? 0.43 : 0.53) * aim);
    // The ceiling fans cut directly through the marquee region (y 21-30%)
    // before reaching the room, with enough length to see the movement.
    const dy = fromCeiling
      ? h * (0.43 + 0.24 * noise(i * 13, seed))
      : h * (0.03 + 0.42 * noise(i * 19, seed));
    const color = leftSource ? left : right;
    const thickness = 0.70 + 0.95 * (0.5 + 0.5 *
      Math.sin(t * 0.43 * tempo + i * 0.72 + phase));
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(dx, dy);
    ctx.lineWidth = Math.max(1.8, w * 0.0033) * thickness;
    ctx.strokeStyle = rgba(color, (fromCeiling ? 0.12 : 0.16) * visibility);
    ctx.stroke();
    ctx.lineWidth = Math.max(0.85, w * 0.0011) * thickness;
    ctx.strokeStyle = rgba(color, (fromCeiling ? 0.49 : 0.62) * visibility);
    ctx.stroke();
  }
}
function drawHaze(t: number, bpm: number, left: Rgb, right: Rgb, seed: number): void {
  if (!ctx) return;
  const tempo = clamp(bpm / 108, 1, 0.48, 1.35);
  const count = SMALL_SCREEN ? 9 : 12;
  for (let i = 0; i < count; i++) {
    const nx = noise(i * 37, seed), ny = noise(i * 53, seed);
    const x = w * (nx * 1.10 - 0.05 + 0.085 * Math.sin(t * 0.073 * tempo + i));
    const y = h * (0.59 + ny * 0.30 + 0.023 * Math.cos(t * 0.055 + i));
    const radius = w * (0.14 + 0.12 * noise(i * 61, seed));
    const scaleY = 0.30 + 0.19 * noise(i * 79, seed);
    const color = i % 2 ? right : left;
    // Pale edges remain visible against a colored plume. Lighten the hue,
    // not the entire room: strokes are translucent and confined to fog.
    const edge: Rgb = [
      Math.round(120 + color[0] * 0.53),
      Math.round(120 + color[1] * 0.53),
      Math.round(120 + color[2] * 0.53),
    ];
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, scaleY);
    const cloud = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    cloud.addColorStop(0, rgba(color, 0.28));
    cloud.addColorStop(0.48, rgba(color, 0.13));
    cloud.addColorStop(0.82, rgba(color, 0.042));
    cloud.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = cloud;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    // Two deliberately angular / stepped broken contours suggest the
    // illuminated edge of pixel-art smoke. All contour movement follows
    // the same cloud position, rather than floating independently.
    ctx.lineJoin = "bevel";
    ctx.lineCap = "butt";
    for (let band = 0; band < 2; band++) {
      const ringRadius = radius * (band === 0 ? 0.82 : 0.55);
      ctx.beginPath();
      const segments = 20;
      for (let k = 0; k <= segments; k++) {
        const angle = k * 2 * Math.PI / segments;
        const wobble = 1 + 0.085 * Math.sin(angle * 5 + i * 0.9 + t * 0.14 * tempo)
                         + 0.045 * Math.cos(angle * 9 - i * 0.7 - t * 0.10 * tempo);
        const px = Math.round((ringRadius * wobble * Math.cos(angle)) / 4) * 4;
        const py = Math.round((ringRadius * wobble * Math.sin(angle)) / 4) * 4;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.setLineDash([radius * (band === 0 ? 0.19 : 0.24), radius * 0.10]);
      ctx.lineWidth = Math.max(1.4, w * (band === 0 ? 0.002 : 0.0014));
      ctx.strokeStyle = rgba(edge, band === 0 ? 0.22 : 0.13);
      ctx.stroke();
    }
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
  // Deliberately cross the color sides: red left wall bar => red party rays
  // emerge from the RIGHT, creating stronger color contrast in the room.
  // Honor the separate 'swap wall bar colors' utility.
  const left = frame.wallBarsSwapped ? frame.primary : frame.secondary;
  const right = frame.wallBarsSwapped ? frame.secondary : frame.primary;
  if (currentEffect === "concert") drawConcert(seconds, frame.bpm, left, right, seed);
  else if (currentEffect === "disco") drawDisco(seconds, frame.bpm, left, right, seed);
  else if (currentEffect === "lasers") drawLasers(seconds, frame.bpm, left, right, seed);
  else drawHaze(seconds, frame.bpm, left, right, seed);
  ctx.restore();
  painted = true;
}

/** Called from PocketDJ's existing RAF. This function never schedules RAF. */
export function updatePartyMode(frame: PartyFrame): void {
  lastFrame = frame;
  if (!canvas || !ctx) return;
  if (REDUCED_MOTION.matches) {
    opacity = 0;
    if (painted) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      painted = false;
    }
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

  // Maintain one persistent, transparent Canvas compositor texture. The
  // Android WebView used to re-create this entire layer on every song rest,
  // pause and resume. Clear it once while idle rather than changing display.
  if (opacity === 0 && !active && currentEffect === desiredEffect) {
    if (painted) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      painted = false;
    }
    syncStatus();
    return;
  }
  if (frame.now - lastPaint >= DRAW_INTERVAL_MS || (painted && opacity === 0)) {
    lastPaint = frame.now;
    render(frame);
  }
  syncStatus();
}
