/** Scene presets are layout data, never DJ pose or vinyl calibration data.
 * All x/y positions are percentages in the existing 1764 x 992 room coordinate system.
 * Scene transforms wrap the entire performer; 582 x 652 sprite-local hand/deck math is unchanged.
 */
export type SceneId = "record-room" | "festival";
export type SceneObjectId =
  | "backdrop" | "performer" | "speakerLeft" | "speakerRight"
  | "lyrics" | "metadata" | "album" | "audience" | "stageLip";

export type ScenePlacement = {
  x: number;
  y: number;
  scale: number;
  opacity: number;
};

export type FestivalSceneLayout = {
  version: 1;
  objects: Record<SceneObjectId, ScenePlacement>;
  audienceDensity: number;
  lightingStrength: number;
};

export const FESTIVAL_LAYOUT_KEY = "pocketdj-festival-scene-layout-v1";
export const SCENE_SELECTION_KEY = "pocketdj-selected-scene-v1";

export const FESTIVAL_OBJECT_LABELS: Record<SceneObjectId, string> = {
  backdrop: "Background / 2.5D stage",
  performer: "DJ + table + vinyl (group)",
  speakerLeft: "Left speaker",
  speakerRight: "Right speaker",
  lyrics: "Lyrics ribbon",
  metadata: "Song / artist / album",
  album: "Featured album artwork",
  audience: "Audience group",
  stageLip: "Front edge of stage",
};

export const FESTIVAL_DEFAULT_LAYOUT: FestivalSceneLayout = {
  version: 1,
  objects: {
    backdrop: { x: 50, y: 50, scale: 1, opacity: 1 },
    performer: { x: 50.6, y: 89, scale: 1.10, opacity: 1 },
    speakerLeft: { x: 28.4, y: 73, scale: 1.28, opacity: 1 },
    speakerRight: { x: 71.6, y: 73, scale: 1.28, opacity: 1 },
    lyrics: { x: 50, y: 21.5, scale: 1, opacity: 1 },
    metadata: { x: 50, y: 33.5, scale: 1, opacity: 1 },
    album: { x: 83, y: 58, scale: 1, opacity: 1 },
    audience: { x: 50, y: 100, scale: 1, opacity: 1 },
    stageLip: { x: 50, y: 90.5, scale: 1, opacity: 1 },
  },
  audienceDensity: 0.75,
  lightingStrength: 0.72,
};

const objectIds = Object.keys(FESTIVAL_OBJECT_LABELS) as SceneObjectId[];

const finite = (value: unknown, fallback: number, min: number, max: number): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
};

export function normalizeFestivalLayout(input: unknown): FestivalSceneLayout {
  const source = input && typeof input === "object" ? input as Partial<FestivalSceneLayout> : {};
  const objects = {} as Record<SceneObjectId, ScenePlacement>;
  for (const id of objectIds) {
    const original = FESTIVAL_DEFAULT_LAYOUT.objects[id];
    const overrides = source.objects?.[id] ?? original;
    objects[id] = {
      x: finite(overrides.x, original.x, -30, 130),
      y: finite(overrides.y, original.y, -30, 130),
      scale: finite(overrides.scale, original.scale, 0.25, 3),
      opacity: finite(overrides.opacity, original.opacity, 0, 1),
    };
  }
  return {
    version: 1,
    objects,
    audienceDensity: finite(source.audienceDensity, FESTIVAL_DEFAULT_LAYOUT.audienceDensity, 0, 1),
    lightingStrength: finite(source.lightingStrength, FESTIVAL_DEFAULT_LAYOUT.lightingStrength, 0, 1.5),
  };
}

export function loadFestivalLayout(): FestivalSceneLayout {
  try {
    const raw = localStorage.getItem(FESTIVAL_LAYOUT_KEY);
    return raw ? normalizeFestivalLayout(JSON.parse(raw)) : normalizeFestivalLayout(FESTIVAL_DEFAULT_LAYOUT);
  } catch {
    return normalizeFestivalLayout(FESTIVAL_DEFAULT_LAYOUT);
  }
}

export function saveFestivalLayout(layout: FestivalSceneLayout): void {
  try {
    localStorage.setItem(FESTIVAL_LAYOUT_KEY, JSON.stringify(normalizeFestivalLayout(layout)));
  } catch {
    // Scene stays usable when localStorage is disabled.
  }
}

export function resolveSceneId(): SceneId {
  const requested = new URLSearchParams(location.search).get("scene");
  if (requested === "festival" || requested === "record-room") return requested;
  try {
    return localStorage.getItem(SCENE_SELECTION_KEY) === "record-room" ? "record-room" : "festival";
  } catch {
    return "festival";
  }
}

export function saveSceneSelection(id: SceneId): void {
  try { localStorage.setItem(SCENE_SELECTION_KEY, id); } catch { /* optional persistence */ }
}
