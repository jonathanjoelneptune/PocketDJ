export type PoseDefinition = {
  id: string;
  label: string;
  mood: "idle" | "active" | "burst" | "paused";
  asset?: string;
  fallbackClass: string;
  durationMs: number;
};

export const poseCatalog: PoseDefinition[] = [
  { id: "idle-center", label: "Idle Center", mood: "idle", fallbackClass: "pose-idle-center", durationMs: 2200 },
  { id: "idle-nod", label: "Idle Nod", mood: "idle", fallbackClass: "pose-idle-nod", durationMs: 1800 },
  { id: "active-left", label: "Deck Left", mood: "active", fallbackClass: "pose-active-left", durationMs: 900 },
  { id: "active-right", label: "Deck Right", mood: "active", fallbackClass: "pose-active-right", durationMs: 900 },
  { id: "burst-hands", label: "Hands Up", mood: "burst", fallbackClass: "pose-burst-hands", durationMs: 650 },
  { id: "paused-lean", label: "Paused Lean", mood: "paused", fallbackClass: "pose-paused-lean", durationMs: 2400 }
];

export const transitionGraph: Record<string, string[]> = {
  "idle-center": ["idle-nod", "active-left", "active-right", "paused-lean"],
  "idle-nod": ["idle-center", "active-left", "active-right"],
  "active-left": ["idle-center", "active-right", "burst-hands"],
  "active-right": ["idle-center", "active-left", "burst-hands"],
  "burst-hands": ["active-left", "active-right", "idle-center"],
  "paused-lean": ["idle-center", "idle-nod"]
};

export function getPose(id: string): PoseDefinition {
  return poseCatalog.find((pose) => pose.id === id) || poseCatalog[0];
}

export function getPosesForMood(mood: PoseDefinition["mood"]): PoseDefinition[] {
  return poseCatalog.filter((pose) => pose.mood === mood);
}
