import type { NormalizedTrack } from "../state/types";
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
  return `
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
    case "backdrop": return element("#roomBg");
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
  element("#roomBg")?.classList.toggle("festival-object-selected", studioObject === "backdrop");
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
  const selector = element<HTMLSelectElement>("#festivalSceneSelect");
  if (selector) selector.value = id;
  element<HTMLButtonElement>("#festivalEditButton")?.toggleAttribute("disabled", id !== "festival");
  if (id !== "festival") toggleStudio(false);
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
  base.insertAdjacentHTML("beforeend", sceneMarkup());
  room.insertAdjacentHTML("beforeend", toolbarMarkup());
  for (const [id, selector] of [
    ["performer", ".dj-wrap"], ["speakerLeft", "#leftSpeaker"], ["speakerRight", "#rightSpeaker"],
  ] as const) {
    element(selector)?.setAttribute("data-festival-object", id);
  }
  bindStudio();
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
      cover.src = track.albumArtUrl;
      cover.hidden = false;
    } else {
      cover.removeAttribute("src");
      cover.hidden = true;
    }
  }
  if (placeholder) placeholder.hidden = Boolean(track.albumArtUrl && hasTrack);
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
