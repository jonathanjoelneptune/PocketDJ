/**
 * Approved Held-Record Alignment Lab v2 export, 2026-11-16.
 * All coordinates are in original 582×652 sprite pixels.
 * Keep left/right A41 separate: those have individually calibrated centers.
 * The invisible reference frames are explicitly retained, never overlaid.
 */
export type HeldRecordSide = "right" | "left";
export type Point = readonly [number, number];
export type QuadCorners = readonly [Point, Point, Point, Point];
export type HeldRecordPlacement = Readonly<{
  x: number;
  y: number;
  size: number;
  visible: boolean;
  warp?: Readonly<{ mode: "quad"; corners: QuadCorners }>;
}>;
export const HELD_RECORD_SPRITE = { width: 582, height: 652 } as const;
export const HELD_RECORD_FRAMES: Readonly<Record<string, HeldRecordPlacement>> = {
  "right:a41.png": { x: 288, y: 296, size: 108, visible: true },
  "right:a11.png": { x: 397, y: 233, size: 114, visible: true },
  "right:a12.png": { x: 418, y: 193, size: 114, visible: true },
  "right:a11-2.png": {
    x: 427.9, y: 391.9, size: 84, visible: true,
    warp: { mode: "quad", corners: [
      [369.7, 374.7], [464.7, 371.2], [497.5, 410.2], [379.7, 411.6],
    ] },
  },
  "right:a13-2.png": { x: 461, y: 374, size: 76, visible: false },
  "right:a10.png": { x: 170, y: 399, size: 75, visible: false },
  "left:a41.png": { x: 286, y: 294, size: 112, visible: true },
  "left:a11m.png": { x: 194, y: 229, size: 104, visible: true },
  "left:a12m.png": { x: 169, y: 190, size: 118, visible: true },
  "left:a11-2m.png": {
    x: 163, y: 393.9, size: 74, visible: true,
    warp: { mode: "quad", corners: [
      [112.6, 372.7], [229.2, 373.7], [213.3, 418.5], [96.7, 410.6],
    ] },
  },
  "left:a13.png": { x: 171, y: 399, size: 76, visible: false },
  "left:a10.png": { x: 170, y: 399, size: 75, visible: false },
};

export function getHeldRecordPlacement(side: HeldRecordSide, pose: string): HeldRecordPlacement | null {
  return HELD_RECORD_FRAMES[`${side}:${pose}`] ?? null;
}

/** Same projective four-corner mapping used in Held-Record Alignment Lab v2.
 * TL, TR, BR, BL order; u/v are in the unit square [0,1]².
 */
export function projectQuad(corners: QuadCorners, u: number, v: number): { x: number; y: number } {
  const [p0, p1, p2, p3] = corners;
  const dx1 = p1[0] - p2[0], dx2 = p3[0] - p2[0];
  const dx3 = p0[0] - p1[0] + p2[0] - p3[0];
  const dy1 = p1[1] - p2[1], dy2 = p3[1] - p2[1];
  const dy3 = p0[1] - p1[1] + p2[1] - p3[1];
  const determinant = dx1 * dy2 - dx2 * dy1;
  let g = 0, h = 0;
  if (Math.abs(determinant) > 0.00001) {
    g = (dx3 * dy2 - dx2 * dy3) / determinant;
    h = (dx1 * dy3 - dx3 * dy1) / determinant;
  }
  const a = p1[0] - p0[0] + g * p1[0];
  const b = p3[0] - p0[0] + h * p3[0];
  const c = p0[0];
  const d = p1[1] - p0[1] + g * p1[1];
  const e = p3[1] - p0[1] + h * p3[1];
  const f = p0[1];
  const denominator = g * u + h * v + 1;
  if (Math.abs(denominator) < 0.0001) return { x: c, y: f };
  return { x: (a*u + b*v + c) / denominator, y: (d*u + e*v + f) / denominator };
}
