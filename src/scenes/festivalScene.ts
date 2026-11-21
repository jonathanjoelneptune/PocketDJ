import type { NormalizedTrack } from "../state/types";
import { getFestivalLighting } from "./festivalLighting";
import {
  FESTIVAL_DEFAULT_LAYOUT, FESTIVAL_LAYOUT_KEY, FESTIVAL_OBJECT_LABELS,
  loadFestivalLayout, normalizeFestivalLayout, resolveSceneId,
  saveFestivalLayout, saveSceneSelection,
  type FestivalSceneLayout, type SceneId, type SceneObjectId,
} from "./scenePresets";

let selectedScene: SceneId = "record-room";
let layout: FestivalSceneLayout = normalizeFestivalLayout(FESTIVAL_DEFAULT_LAYOUT);
let studioObject: SceneObjectId = "performer";
let editing = false;
let previousTrackKey = "";
let previousLyric = "";
let initialized = false;

// Festival-only appearance state. Kept separate from DJ playback and layout calibration.
const FESTIVAL_ATMOSPHERE_KEY = "pocketdj-festival-atmosphere-v1";
type FestivalAtmosphereSettings = {
  hour: number;
  saturation: number;
  clouds: number;
  stars: boolean;
};
const DEFAULT_ATMOSPHERE: FestivalAtmosphereSettings = {
  hour: 18, saturation: 85, clouds: 35, stars: true,
};
let atmosphere: FestivalAtmosphereSettings = { ...DEFAULT_ATMOSPHERE };
let atmospherePanelOpen = false;

const clamp = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
function loadAtmosphere(): FestivalAtmosphereSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(FESTIVAL_ATMOSPHERE_KEY) || "null");
    if (!saved || typeof saved !== "object") return { ...DEFAULT_ATMOSPHERE };
    return {
      hour: clamp(Number(saved.hour), 0, 24),
      saturation: clamp(Number(saved.saturation), 50, 120),
      clouds: clamp(Number(saved.clouds), 0, 100),
      stars: saved.stars !== false,
    };
  } catch {
    return { ...DEFAULT_ATMOSPHERE };
  }
}
function renderAtmosphere(): void {
  const root = document.documentElement;
  const light = getFestivalLighting(atmosphere.hour);
  const variables: Record<string, string> = {
    "--festival-sky-top": light.top,
    "--festival-sky-middle": light.middle,
    "--festival-sky-horizon": light.horizon,
    "--festival-ambient-color": light.ambient,
    "--festival-ambient-strength": light.ambientStrength.toFixed(3),
    "--festival-material-mountains": light.mountains.toFixed(3),
    "--festival-material-city": light.city.toFixed(3),
    "--festival-material-trees": light.trees.toFixed(3),
    "--festival-material-canopy": light.canopy.toFixed(3),
    "--festival-material-floor": light.floor.toFixed(3),
    "--festival-practical-opacity": light.practicals.toFixed(3),
    "--festival-window-opacity": light.windows.toFixed(3),
    "--festival-backdrop-saturation": (atmosphere.saturation / 100).toFixed(3),
    "--festival-star-opacity": (atmosphere.stars ? light.stars : 0).toFixed(3),
    "--festival-cloud-opacity": (atmosphere.clouds / 100).toFixed(3),
    "--festival-sun-opacity": light.sun.toFixed(3),
    "--festival-sun-x": light.sunX.toFixed(2) + "%",
    "--festival-sun-y": light.sunY.toFixed(2) + "%",
  };
  for (const [name,value] of Object.entries(variables)) root.style.setProperty(name,value);
  const label = document.querySelector<HTMLOutputElement>("#festivalAtmosphereTimeValue");
  if (label) {
    const hour = Math.floor(atmosphere.hour);
    const minute = Math.round((atmosphere.hour % 1) * 60);
    label.textContent = `${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;
  }
  const saturation = document.querySelector<HTMLOutputElement>("#festivalAtmosphereSaturationValue");
  if (saturation) saturation.textContent = `${atmosphere.saturation}%`;
  const clouds = document.querySelector<HTMLOutputElement>("#festivalAtmosphereCloudValue");
  if (clouds) clouds.textContent = `${atmosphere.clouds}%`;
}
function setAtmosphere(update: Partial<FestivalAtmosphereSettings>): void {
  atmosphere = { ...atmosphere, ...update };
  try { localStorage.setItem(FESTIVAL_ATMOSPHERE_KEY, JSON.stringify(atmosphere)); } catch { /* private browsing */ }
  renderAtmosphere();
}
function bindAtmosphere(): void {
  document.querySelector<HTMLInputElement>("#festivalAtmosphereTime")?.addEventListener("input", e =>
    setAtmosphere({ hour: Number((e.currentTarget as HTMLInputElement).value) }));
  document.querySelector<HTMLInputElement>("#festivalAtmosphereSaturation")?.addEventListener("input", e =>
    setAtmosphere({ saturation: Number((e.currentTarget as HTMLInputElement).value) }));
  document.querySelector<HTMLInputElement>("#festivalAtmosphereCloud")?.addEventListener("input", e =>
    setAtmosphere({ clouds: Number((e.currentTarget as HTMLInputElement).value) }));
  document.querySelector<HTMLInputElement>("#festivalAtmosphereStars")?.addEventListener("change", e =>
    setAtmosphere({ stars: (e.currentTarget as HTMLInputElement).checked }));
  document.querySelectorAll<HTMLButtonElement>("[data-festival-hour]").forEach(button =>
    button.addEventListener("click", () => {
      const hour = Number(button.dataset.festivalHour);
      const slider = document.querySelector<HTMLInputElement>("#festivalAtmosphereTime");
      if (slider) slider.value = String(hour);
      setAtmosphere({ hour });
    }));
  document.querySelector("#festivalAtmosphereButton")?.addEventListener("click", () =>
    toggleAtmospherePanel(!atmospherePanelOpen));
  document.querySelector("#festivalAtmosphereClose")?.addEventListener("click", () =>
    toggleAtmospherePanel(false));
  document.querySelector("#festivalAtmosphereReset")?.addEventListener("click", () => {
    atmosphere = { ...DEFAULT_ATMOSPHERE };
    for (const [id, value] of [
      ["festivalAtmosphereTime", atmosphere.hour],
      ["festivalAtmosphereSaturation", atmosphere.saturation],
      ["festivalAtmosphereCloud", atmosphere.clouds],
    ] as const) {
      const input = document.querySelector<HTMLInputElement>(`#${id}`);
      if (input) input.value = String(value);
    }
    const stars = document.querySelector<HTMLInputElement>("#festivalAtmosphereStars");
    if (stars) stars.checked = atmosphere.stars;
    setAtmosphere({});
  });
}
function toggleAtmospherePanel(open: boolean): void {
  atmospherePanelOpen = selectedScene === "festival" && open;
  const panel = document.querySelector<HTMLElement>("#festivalAtmospherePanel");
  if (panel) panel.hidden = !atmospherePanelOpen;
  document.querySelector("#festivalAtmosphereButton")?.setAttribute("aria-expanded", String(atmospherePanelOpen));
}


const element = <T extends HTMLElement = HTMLElement>(selector: string): T | null =>
  document.querySelector<T>(selector);

const silhouetteSvg = (variant: number): string => {
  const arm = variant % 3 === 0
    ? '<path d="M23 80Q9 65 6 40L2 12" stroke="#0a1023" stroke-width="18" fill="none" stroke-linecap="round"/><ellipse cx="1" cy="10" rx="9" ry="12" fill="#0a1023"/>'
    : variant % 3 === 1
      ? '<path d="M52 85Q69 59 65 33L70 8" stroke="#10172a" stroke-width="16" fill="none" stroke-linecap="round"/><ellipse cx="70" cy="8" rx="9" ry="11" fill="#10172a"/>'
      : '<path d="M23 79Q10 104 15 131M51 81Q65 105 60 127" stroke="#0c1425" stroke-width="15" fill="none" stroke-linecap="round"/>';
  const hair = variant % 4 === 0
    ? '<path d="M21 48Q12 19 28 15Q42 7 53 23Q61 38 53 53Z" fill="#0b0f20"/>'
    : variant % 4 === 1
      ? '<path d="M24 26Q20 4 43 13Q59 20 52 42L44 19Z" fill="#0a1121"/>'
      : '<path d="M22 31Q32 13 51 30L56 43Q36 29 20 46Z" fill="#0a1021"/>';
  return '<svg viewBox="0 0 76 185" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
    '<defs><linearGradient id="crowdShade'+variant+'" x2=".9" y2=".2"><stop stop-color="#070e1b"/><stop offset=".65" stop-color="#14162a"/><stop offset="1" stop-color="#25182e"/></linearGradient></defs>' +
    '<path d="M12 185L16 126Q11 96 22 77Q38 66 53 77Q65 93 59 121L65 185Z" fill="url(#crowdShade'+variant+')" stroke="#4e3655" stroke-opacity=".75" stroke-width="1.6"/>' +
    arm + '<ellipse cx="38" cy="50" rx="19" ry="23" fill="#131729"/>' + hair +
    '<path d="M22 87Q39 79 53 88" stroke="#9a5675" stroke-opacity=".25" fill="none" stroke-width="3"/>' +
    '</svg>';
};

const crowdModels = [
  { x: 3, h: 27, v: 0, delay: -0.3 },
  { x: 13, h: 23, v: 1, delay: -1.1 },
  { x: 23, h: 16, v: 2, delay: -0.8 },
  { x: 30, h: 12, v: 3, delay: -1.8 },
  { x: 72, h: 13, v: 4, delay: -2.6 },
  { x: 80, h: 19, v: 5, delay: -0.5 },
  { x: 90, h: 24, v: 6, delay: -1.6 },
  { x: 98, h: 29, v: 7, delay: -1.3 },
  { x: 41, h: 10, v: 8, delay: -2.2 },
  { x: 62, h: 11, v: 9, delay: -2.9 },
];

function sceneMarkup(): string {
  const assets = "./assets/scenes/festival-environment/";
  const plane = (id: string, name: string): string =>
    `<div class="festival-env-plane festival-env-${id}" style="--festival-material-mask:url('${assets}${name}.svg')"><img alt="" draggable="false" decoding="async" src="${assets}${name}.svg" /></div>`;
  return `
    <div id="festivalBackgroundLayers" class="festival-background-layers festival-scene-object" data-festival-object="backdrop" aria-hidden="true">
      <div class="festival-sky-gradient"></div>
      <div class="festival-stars">
        ${Array.from({length: 60}, (_, i) => {
          const x = ((i * 73 + 11) % 97) + 1;
          const y = ((i * 41 + 17) % 48) + 1;
          const size = i % 5 === 0 ? 2 : 1;
          return `<i style="--star-x:${x}%;--star-y:${y}%;--star-size:${size}px"></i>`;
        }).join("")}
      </div>
      <div class="festival-sun-disc"></div>
      <div class="festival-cloud-field">
        ${Array.from({length: 9}, (_, i) => `<span class="festival-cloud" style="--cloud-y:${(i * 17 + 6) % 43}%;--cloud-width:${8 + i % 4 * 3}%;--cloud-duration:${74 + i * 13}s;--cloud-delay:-${i * 19}s;--cloud-alpha:${.45 + (i % 3) * .18}"></span>`).join("")}
      </div>
      ${plane("mountains","mountains")}
      ${plane("city","city")}
      <img class="festival-env-effect festival-env-windows" src="${assets}city-lights.svg" alt="" draggable="false" decoding="async" />
      ${plane("trees","trees")}
      ${plane("canopy","canopy")}
      ${plane("floor","stage-floor")}
      <img class="festival-env-effect festival-env-practicals" src="${assets}practical-lights.svg" alt="" draggable="false" decoding="async" />
    </div>
    <div id="festivalAtmosphere" class="festival-atmosphere" aria-hidden="true">
      <div class="festival-sky-glow"></div>
      <div class="festival-beam festival-beam-left"></div>
      <div class="festival-beam festival-beam-middle"></div>
      <div class="festival-beam festival-beam-right"></div>
      <div class="festival-footlights"></div>
    </div>
    <div class="festival-lyric-display festival-scene-object" id="festivalLyrics" data-festival-object="lyrics" aria-live="off">
      <div class="festival-lyric-label">POCKET DJ · LIVE LYRICS</div>
      <div id="festivalLyricText" class="festival-lyric-text"></div>
    </div>
    <div class="festival-song-display festival-scene-object" id="festivalMetadata" data-festival-object="metadata" aria-live="polite">
      <div class="festival-display-eyebrow">NOW PERFORMING</div>
      <div class="festival-song-title" id="festivalSongTitle">POCKET DJ</div>
      <div class="festival-song-artist" id="festivalSongArtist">Festival Stage</div>
      <div class="festival-song-album" id="festivalSongAlbum">OPEN AIR SESSIONS</div>
    </div>
    <div class="festival-side-sign" aria-hidden="true"><span>P</span><span>O</span><span>C</span><span>K</span><span>E</span><span>T</span></div>
    <div class="festival-album-display festival-scene-object" id="festivalAlbum" data-festival-object="album">
      <div class="festival-album-label">ON THE DECKS</div>
      <div class="festival-album-glass"><img id="festivalAlbumImage" alt="Current album cover" draggable="false" /><div id="festivalAlbumPlaceholder" class="festival-album-placeholder">POCKET<br/>DJ</div></div>
      <div class="festival-album-foot">LIVE VINYL · NOW PLAYING</div>
    </div>
    <div class="festival-stage-lip festival-scene-object" id="festivalStageLip" data-festival-object="stageLip" aria-hidden="true"></div>
    <div class="festival-audience festival-scene-object" id="festivalAudience" data-festival-object="audience" aria-hidden="true">
      ${crowdModels.map((person) => `<div class="festival-person" data-person-index="${person.v}" style="left:${person.x}%;height:${person.h}%;animation-delay:${person.delay}s">${silhouetteSvg(person.v)}</div>`).join("")}
    </div>
  `;
}

function toolbarMarkup(): string {
  return `<div id="festivalSceneToolbar" class="festival-scene-toolbar">
    <label for="festivalSceneSelect">LOCATION</label>
    <select id="festivalSceneSelect" aria-label="Pocket DJ location">
      <option value="record-room">Record Room</option><option value="festival">Festival Stage</option>
    </select>
    <button id="festivalEditButton" type="button" title="Configure festival scene positions">LAYOUT</button>
    <button id="festivalAtmosphereButton" type="button" aria-expanded="false" aria-controls="festivalAtmospherePanel" title="Adjust sky and festival atmosphere">SKY</button>
  </div>
  <div id="festivalAtmospherePanel" class="festival-atmosphere-panel" hidden role="region" aria-label="Festival Atmosphere Lab">
    <header><strong>FESTIVAL ATMOSPHERE</strong><button type="button" id="festivalAtmosphereClose" aria-label="Close atmosphere controls">×</button></header>
    <p>Manual sky and lighting controls. Live clock and weather will be added separately.</p>
    <label for="festivalAtmosphereTime">TIME OF DAY <output id="festivalAtmosphereTimeValue">18:00</output></label>
    <input id="festivalAtmosphereTime" type="range" min="0" max="24" step=".25" value="${atmosphere.hour}"/>
    <div class="festival-atmosphere-presets">
      <button type="button" data-festival-hour="7">SUNRISE</button>
      <button type="button" data-festival-hour="12">DAY</button>
      <button type="button" data-festival-hour="18">SUNSET</button>
      <button type="button" data-festival-hour="23">NIGHT</button>
    </div>
    <label for="festivalAtmosphereSaturation">SATURATION <output id="festivalAtmosphereSaturationValue">85%</output></label>
    <input id="festivalAtmosphereSaturation" type="range" min="50" max="120" step="1" value="${atmosphere.saturation}"/>
    <label for="festivalAtmosphereCloud">CLOUD COVERAGE <output id="festivalAtmosphereCloudValue">35%</output></label>
    <input id="festivalAtmosphereCloud" type="range" min="0" max="100" step="1" value="${atmosphere.clouds}"/>
    <label class="festival-atmosphere-check"><input id="festivalAtmosphereStars" type="checkbox" ${atmosphere.stars ? "checked" : ""}/> SHOW STARS AT NIGHT</label>
    <button type="button" id="festivalAtmosphereReset">RESET ATMOSPHERE</button>
  </div>
  <div id="festivalStudio" class="festival-studio" hidden role="region" aria-label="Festival Scene Layout Studio">
    <div class="festival-studio-title"><strong>SCENE LAYOUT STUDIO</strong><button id="festivalCloseStudio" type="button" aria-label="Close studio">×</button></div>
    <label>ELEMENT<select id="festivalObjectSelect">${Object.entries(FESTIVAL_OBJECT_LABELS).map(([id,label])=>`<option value="${id}">${label}</option>`).join("")}</select></label>
    <div class="festival-studio-sub">Drag highlighted objects directly on stage, or tune the controls below.</div>
    <label>X POSITION <output id="festivalXValue"></output><input id="festivalX" type="range" min="-30" max="130" step=".1"/></label>
    <label>Y POSITION <output id="festivalYValue"></output><input id="festivalY" type="range" min="-30" max="130" step=".1"/></label>
    <label>SCALE <output id="festivalScaleValue"></output><input id="festivalScale" type="range" min=".25" max="3" step=".01"/></label>
    <label>OPACITY <output id="festivalOpacityValue"></output><input id="festivalOpacity" type="range" min="0" max="1" step=".01"/></label>
    <hr/>
    <label>CROWD DENSITY <output id="festivalDensityValue"></output><input id="festivalDensity" type="range" min="0" max="1" step=".05"/></label>
    <label>LIGHTING STRENGTH <output id="festivalLightingValue"></output><input id="festivalLighting" type="range" min="0" max="1.5" step=".05"/></label>
    <div class="festival-studio-buttons"><button id="festivalExport" type="button">EXPORT JSON</button><button id="festivalImport" type="button">IMPORT JSON</button><button id="festivalReset" type="button">RESET</button></div>
    <textarea id="festivalLayoutJson" spellcheck="false" placeholder="Export and copy JSON, or paste a saved layout here to import"></textarea>
    <div id="festivalStudioStatus" class="festival-studio-status" aria-live="polite"></div>
  </div>`;
}

function getObjectElement(id: SceneObjectId): HTMLElement | null {
  switch (id) {
    case "backdrop": return element("#festivalBackgroundLayers");
    case "performer": return element(".dj-wrap");
    case "speakerLeft": return element("#leftSpeaker");
    case "speakerRight": return element("#rightSpeaker");
    case "lyrics": return element("#festivalLyrics");
    case "metadata": return element("#festivalMetadata");
    case "album": return element("#festivalAlbum");
    case "audience": return element("#festivalAudience");
    case "stageLip": return element("#festivalStageLip");
  }
}

function applyLayout(): void {
  for (const id of Object.keys(FESTIVAL_OBJECT_LABELS) as SceneObjectId[]) {
    const node = getObjectElement(id);
    if (!node) continue;
    const p = layout.objects[id];
    node.style.setProperty("--festival-x", `${p.x}%`);
    node.style.setProperty("--festival-y", `${p.y}%`);
    node.style.setProperty("--festival-scale", String(p.scale));
    node.style.setProperty("--festival-opacity", String(p.opacity));
  }
  const root = document.documentElement;
  root.style.setProperty("--festival-light-strength", String(layout.lightingStrength));
  root.style.setProperty("--festival-dj-x", `${layout.objects.performer.x}%`);
  root.style.setProperty("--festival-dj-y", `${layout.objects.performer.y}%`);
  root.style.setProperty("--festival-dj-scale", String(layout.objects.performer.scale));
  const count = Math.round(layout.audienceDensity * crowdModels.length);
  document.querySelectorAll<HTMLElement>(".festival-person").forEach((person, i) => {
    person.hidden = i >= count;
  });
  if (editing) updateStudioControls();
}

function setStatus(message: string): void {
  const status = element("#festivalStudioStatus");
  if (status) status.textContent = message;
}

function updateStudioControls(): void {
  const select = element<HTMLSelectElement>("#festivalObjectSelect");
  if (select) select.value = studioObject;
  const position = layout.objects[studioObject];
  const values: Record<string, number> = {
    festivalX: position.x, festivalY: position.y,
    festivalScale: position.scale, festivalOpacity: position.opacity,
    festivalDensity: layout.audienceDensity, festivalLighting: layout.lightingStrength,
  };
  for (const [id, value] of Object.entries(values)) {
    const input = element<HTMLInputElement>(`#${id}`);
    const output = element<HTMLOutputElement>(`#${id}Value`);
    if (input) input.value = String(value);
    if (output) output.textContent = value.toFixed(id === "festivalScale" || id === "festivalOpacity" ? 2 : 1);
  }
  document.querySelectorAll<HTMLElement>("[data-festival-object]").forEach(node => {
    node.classList.toggle("festival-object-selected", node.dataset.festivalObject === studioObject);
  });
  element("#festivalBackgroundLayers")?.classList.toggle("festival-object-selected", studioObject === "backdrop");
}

function toggleStudio(open: boolean): void {
  editing = open;
  const studio = element("#festivalStudio");
  if (studio) studio.hidden = !open;
  document.documentElement.classList.toggle("festival-editing", open);
  element("#festivalEditButton")?.setAttribute("aria-pressed", String(open));
  if (open) updateStudioControls();
}

function changeScene(id: SceneId): void {
  selectedScene = id;
  saveSceneSelection(id);
  document.documentElement.dataset.pocketScene = id;
  // Keep an explicit ?scene= preview URL consistent with the scene picker.
  const currentUrl = new URL(window.location.href);
  if (currentUrl.searchParams.has("scene") && currentUrl.searchParams.get("scene") !== id) {
    currentUrl.searchParams.set("scene", id);
    window.history.replaceState(window.history.state, "", currentUrl.toString());
  }
  const backdrop = element<HTMLElement>("#roomBg");
  if (backdrop) backdrop.style.backgroundImage = id === "festival"
    ? 'url("./assets/scenes/festival-stage-illustrated-v1.png")'
    : 'url("./assets/room/pocket-dj-room-offline-v1.png")';
  const selector = element<HTMLSelectElement>("#festivalSceneSelect");
  if (selector) selector.value = id;
  element<HTMLButtonElement>("#festivalEditButton")?.toggleAttribute("disabled", id !== "festival");
  if (id !== "festival") {
    toggleStudio(false);
    toggleAtmospherePanel(false);
  }
  element<HTMLButtonElement>("#festivalAtmosphereButton")?.toggleAttribute("disabled", id !== "festival");
  applyLayout();
}

function changeObjectValue(key: keyof FestivalSceneLayout["objects"]["performer"], value: number): void {
  const normalized = normalizeFestivalLayout({ ...layout, objects: {
    ...layout.objects, [studioObject]: { ...layout.objects[studioObject], [key]: value },
  } });
  layout = normalized;
  saveFestivalLayout(layout);
  applyLayout();
}

function bindStudio(): void {
  element<HTMLSelectElement>("#festivalSceneSelect")?.addEventListener("change", event => {
    changeScene((event.currentTarget as HTMLSelectElement).value === "festival" ? "festival" : "record-room");
  });
  element("#festivalEditButton")?.addEventListener("click", () => {
    if (selectedScene === "festival") toggleStudio(!editing);
  });
  element("#festivalCloseStudio")?.addEventListener("click", () => toggleStudio(false));
  element<HTMLSelectElement>("#festivalObjectSelect")?.addEventListener("change", event => {
    studioObject = (event.currentTarget as HTMLSelectElement).value as SceneObjectId;
    updateStudioControls();
  });

  for (const [id, key] of [
    ["festivalX", "x"], ["festivalY", "y"],
    ["festivalScale", "scale"], ["festivalOpacity", "opacity"],
  ] as const) {
    element<HTMLInputElement>(`#${id}`)?.addEventListener("input", event => {
      changeObjectValue(key, Number((event.currentTarget as HTMLInputElement).value));
    });
  }

  element<HTMLInputElement>("#festivalDensity")?.addEventListener("input", event => {
    layout = normalizeFestivalLayout({ ...layout, audienceDensity: Number((event.currentTarget as HTMLInputElement).value) });
    saveFestivalLayout(layout);
    applyLayout();
  });
  element<HTMLInputElement>("#festivalLighting")?.addEventListener("input", event => {
    layout = normalizeFestivalLayout({ ...layout, lightingStrength: Number((event.currentTarget as HTMLInputElement).value) });
    saveFestivalLayout(layout);
    applyLayout();
  });

  element("#festivalExport")?.addEventListener("click", () => {
    const field = element<HTMLTextAreaElement>("#festivalLayoutJson");
    if (!field) return;
    field.value = JSON.stringify(layout, null, 2);
    field.focus();
    field.select();
    setStatus("Layout JSON selected. Copy to save it.");
  });
  element("#festivalImport")?.addEventListener("click", () => {
    try {
      const raw = JSON.parse(element<HTMLTextAreaElement>("#festivalLayoutJson")?.value || "");
      if (raw?.version !== 1 || !raw.objects?.performer || !raw.objects?.backdrop) {
        throw new Error("Expected a v1 festival scene layout.");
      }
      layout = normalizeFestivalLayout(raw);
      saveFestivalLayout(layout);
      applyLayout();
      setStatus("Layout imported.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Invalid layout JSON.");
    }
  });
  element("#festivalReset")?.addEventListener("click", () => {
    layout = normalizeFestivalLayout(FESTIVAL_DEFAULT_LAYOUT);
    saveFestivalLayout(layout);
    applyLayout();
    setStatus("Festival layout reset to defaults.");
  });

  const room = element<HTMLElement>(".room-base-layer");
  let activeDrag: { pointerId: number; object: SceneObjectId; startX: number; startY: number; x: number; y: number } | null = null;
  room?.addEventListener("pointerdown", event => {
    if (!editing || selectedScene !== "festival" || !(event.target instanceof Element)) return;
    const handle = event.target.closest<HTMLElement>("[data-festival-object]");
    const id = handle?.dataset.festivalObject as SceneObjectId | undefined;
    if (!id || !Object.prototype.hasOwnProperty.call(FESTIVAL_OBJECT_LABELS, id)) return;
    if (event.button !== 0) return;
    studioObject = id;
    updateStudioControls();
    const item = layout.objects[id];
    activeDrag = { pointerId: event.pointerId, object: id, startX: event.clientX, startY: event.clientY, x: item.x, y: item.y };
    event.preventDefault();
  });
  window.addEventListener("pointermove", event => {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
    const bounds = room?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
    const dx = ((event.clientX - activeDrag.startX) / bounds.width) * 100;
    const dy = ((event.clientY - activeDrag.startY) / bounds.height) * 100;
    const current = layout.objects[activeDrag.object];
    layout = normalizeFestivalLayout({
      ...layout,
      objects: { ...layout.objects, [activeDrag.object]: { ...current, x: activeDrag.x + dx, y: activeDrag.y + dy } },
    });
    applyLayout();
  });
  const finish = (event: PointerEvent) => {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
    saveFestivalLayout(layout);
    activeDrag = null;
  };
  window.addEventListener("pointerup", finish);
  window.addEventListener("pointercancel", finish);
  window.addEventListener("keydown", event => {
    if (event.key === "Escape" && editing) toggleStudio(false);
  });
}

export function initializeFestivalScenes(): void {
  if (initialized) return;
  const base = element(".room-base-layer");
  const room = element(".room");
  if (!base || !room) return;
  initialized = true;
  layout = loadFestivalLayout();
  atmosphere = loadAtmosphere();
  base.insertAdjacentHTML("beforeend", sceneMarkup());
  room.insertAdjacentHTML("beforeend", toolbarMarkup());
  for (const [id, selector] of [
    ["performer", ".dj-wrap"], ["speakerLeft", "#leftSpeaker"], ["speakerRight", "#rightSpeaker"],
  ] as const) {
    element(selector)?.setAttribute("data-festival-object", id);
  }
  bindStudio();
  bindAtmosphere();
  renderAtmosphere();
  changeScene(resolveSceneId());
}

export function syncFestivalPlayback(track: NormalizedTrack): void {
  if (!initialized) return;
  const root = document.documentElement;
  root.classList.toggle("festival-is-playing", Boolean(track.isPlaying));
  const key = [track.source, track.trackId, track.title, track.artist, track.album, track.albumArtUrl].join("|");
  if (key === previousTrackKey) return;
  previousTrackKey = key;

  const hasTrack = track.source !== "none" && Boolean(track.title);
  const title = element("#festivalSongTitle");
  const artist = element("#festivalSongArtist");
  const album = element("#festivalSongAlbum");
  if (title) title.textContent = hasTrack ? track.title : "POCKET DJ";
  if (artist) artist.textContent = hasTrack ? track.artist : "Festival Stage";
  if (album) album.textContent = hasTrack && track.album ? track.album : "OPEN AIR SESSIONS";
  const cover = element<HTMLImageElement>("#festivalAlbumImage");
  const placeholder = element("#festivalAlbumPlaceholder");
  if (cover) {
    if (track.albumArtUrl && hasTrack) {
      // Keep a stage placeholder until the new artwork actually decodes.
      if (placeholder) placeholder.hidden = false;
      cover.hidden = true;
      cover.onload = () => {
        if (placeholder) placeholder.hidden = true;
        cover.hidden = false;
        cover.classList.remove("festival-album-appearing");
        void cover.offsetWidth;
        cover.classList.add("festival-album-appearing");
      };
      cover.onerror = () => {
        cover.hidden = true;
        if (placeholder) placeholder.hidden = false;
      };
      cover.src = track.albumArtUrl;
    } else {
      cover.removeAttribute("src");
      cover.hidden = true;
      if (placeholder) placeholder.hidden = false;
    }
  }
  // Long titles remain readable within the stage's fixed metadata display.
  if (title) title.style.setProperty("--festival-title-fit", String(
    track.title.length > 65 ? 0.59 : track.title.length > 45 ? 0.74 : track.title.length > 30 ? 0.88 : 1,
  ));
}

export function syncFestivalLyrics(text: string): void {
  if (!initialized || text === previousLyric) return;
  previousLyric = text;
  const node = element("#festivalLyricText");
  if (!node) return;
  node.textContent = text;
  node.classList.remove("festival-lyric-entry");
  if (text) {
    // Called only on an actual lyric change, not on playback animation frames.
    void node.offsetWidth;
    node.classList.add("festival-lyric-entry");
  }
}
