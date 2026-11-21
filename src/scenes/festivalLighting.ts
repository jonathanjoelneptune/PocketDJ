/**
 * Festival-specific shared environmental light model.
 * Art assets are neutral RGBA/SVG materials; no source artwork embeds a sky,
 * sunset, or active artificial illumination.
 * All presets interpolate through this ONE state so geometry, sky and bulbs agree.
 */
type Color = readonly [number, number, number];
type LightingKeyframe = {
  hour: number;
  top: Color;
  middle: Color;
  horizon: Color;
  ambient: Color;
  ambientStrength: number;
  mountains: number;
  city: number;
  trees: number;
  canopy: number;
  floor: number;
  practicals: number;
  windows: number;
  sun: number;
  stars: number;
};

const KEYFRAMES: readonly LightingKeyframe[] = [
  {hour: 0, top:[8,20,44], middle:[18,35,65], horizon:[54,67,94], ambient:[40,60,105], ambientStrength:.74, mountains:.46,city:.38,trees:.34,canopy:.40,floor:.43,practicals:1,windows:.97,sun:0,stars:1},
  {hour: 5, top:[18,36,70], middle:[71,68,105], horizon:[164,112,123], ambient:[73,80,119], ambientStrength:.57, mountains:.53,city:.46,trees:.43,canopy:.49,floor:.54,practicals:.94,windows:.75,sun:.04,stars:.55},
  {hour: 7, top:[82,116,156], middle:[164,169,188], horizon:[241,187,144], ambient:[183,162,146], ambientStrength:.20, mountains:.82,city:.78,trees:.83,canopy:.86,floor:.90,practicals:.30,windows:.13,sun:.68,stars:0},
  {hour: 10, top:[77,146,203], middle:[143,194,222], horizon:[202,221,223], ambient:[255,255,255], ambientStrength:0, mountains:.99,city:1,trees:.99,canopy:1,floor:1,practicals:.08,windows:0,sun:.90,stars:0},
  {hour: 12, top:[66,142,207], middle:[132,197,231], horizon:[207,225,222], ambient:[255,255,255], ambientStrength:0, mountains:1,city:1,trees:1,canopy:1,floor:1,practicals:.05,windows:0,sun:1,stars:0},
  {hour: 15, top:[89,157,201], middle:[157,199,221], horizon:[221,222,205], ambient:[255,242,223], ambientStrength:.08, mountains:.97,city:.98,trees:.96,canopy:.96,floor:.95,practicals:.12,windows:0,sun:.94,stars:0},
  {hour: 18, top:[75,79,132], middle:[155,118,151], horizon:[242,151,111], ambient:[211,142,128], ambientStrength:.29, mountains:.74,city:.72,trees:.69,canopy:.78,floor:.78,practicals:.67,windows:.45,sun:.68,stars:0},
  {hour: 20, top:[20,34,70], middle:[60,67,105], horizon:[131,91,122], ambient:[68,77,121], ambientStrength:.61, mountains:.50,city:.46,trees:.42,canopy:.51,floor:.54,practicals:.97,windows:.88,sun:0,stars:.36},
  {hour: 22, top:[8,20,44], middle:[18,35,65], horizon:[54,67,94], ambient:[40,60,105], ambientStrength:.74, mountains:.46,city:.38,trees:.34,canopy:.40,floor:.43,practicals:1,windows:.97,sun:0,stars:1},
  {hour: 24, top:[8,20,44], middle:[18,35,65], horizon:[54,67,94], ambient:[40,60,105], ambientStrength:.74, mountains:.46,city:.38,trees:.34,canopy:.40,floor:.43,practicals:1,windows:.97,sun:0,stars:1},
];

const scalarKeys = [
  "ambientStrength","mountains","city","trees","canopy","floor",
  "practicals","windows","sun","stars",
] as const;

function safeHour(hour: number): number {
  return Number.isFinite(hour) ? Math.min(24, Math.max(0, hour)) : 12;
}
function interpolate(a: number, b: number, fraction: number): number {
  return a + (b - a) * fraction;
}
function interpolateColor(a: Color, b: Color, t: number): string {
  return "rgb(" + a.map((channel, index) => Math.round(interpolate(channel,b[index],t))).join(",") + ")";
}
export type FestivalLightingState = {
  top: string; middle: string; horizon: string; ambient: string;
  ambientStrength: number; mountains: number; city: number; trees: number;
  canopy: number; floor: number; practicals: number; windows: number;
  sun: number; stars: number; sunX: number; sunY: number;
};
export function getFestivalLighting(hour: number): FestivalLightingState {
  const h = safeHour(hour);
  let index = 1;
  while (index < KEYFRAMES.length - 1 && KEYFRAMES[index].hour < h) index++;
  const start=KEYFRAMES[index-1], end=KEYFRAMES[index];
  const t=(h-start.hour)/(end.hour-start.hour);
  const values={} as Pick<FestivalLightingState,(typeof scalarKeys)[number]>;
  for (const key of scalarKeys) values[key]=interpolate(start[key],end[key],t);
  const arc=Math.min(1,Math.max(0,(h-5.5)/13.5));
  return {
    ...values,
    top:interpolateColor(start.top,end.top,t),
    middle:interpolateColor(start.middle,end.middle,t),
    horizon:interpolateColor(start.horizon,end.horizon,t),
    ambient:interpolateColor(start.ambient,end.ambient,t),
    // Sun travels behind geometry (no longer a screen-space foreground effect).
    sunX:12+arc*76,
    sunY:48-27*Math.sin(Math.PI*arc),
  };
}
