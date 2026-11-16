import {
  getHeldRecordPlacement,
  HELD_RECORD_SPRITE,
  projectQuad,
  type HeldRecordPlacement,
  type HeldRecordSide,
  type QuadCorners,
} from "./heldRecordCalibration";

const TEXTURE_SIZE = 256;
const WARP_SUBDIVISIONS = 12;

/**
 * Draw the incoming cover on a single transparent sprite-aligned canvas.
 * Every pose uses the exact 582×652 coordinates saved in the Alignment Lab.
 * No CSS percentages or rescaling of individual record shapes.
 */
export class HeldRecordOverlay {
  private readonly canvas: HTMLCanvasElement | null;
  private readonly context: CanvasRenderingContext2D | null;
  private lastPoseKey = "";
  private lastCover: HTMLImageElement | null = null;
  private cachedWarpTexture: HTMLCanvasElement | null = null;
  private cachedTextureCover: HTMLImageElement | null = null;

  constructor() {
    this.canvas = document.querySelector<HTMLCanvasElement>("#songChangeHeldCanvas");
    this.context = this.canvas?.getContext("2d", { alpha: true }) ?? null;
    if (this.canvas && this.context) {
      this.canvas.width = HELD_RECORD_SPRITE.width;
      this.canvas.height = HELD_RECORD_SPRITE.height;
      this.canvas.closest(".dj-wrap")?.classList.add("held-record-canvas-ready");
    }
  }

  update(side: HeldRecordSide | null, pose: string | null, cover: HTMLImageElement | null): void {
    if (!this.canvas || !this.context) return;
    const placement = side && pose ? getHeldRecordPlacement(side, pose) : null;
    const valid = Boolean(placement?.visible && cover?.complete && cover.naturalWidth && cover.naturalHeight);
    if (!valid || !placement || !cover) {
      if (this.lastPoseKey) this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.lastPoseKey = "";
      this.lastCover = null;
      this.canvas.classList.remove("held-record-visible");
      return;
    }

    const poseKey = `${side}:${pose}`;
    if (this.lastPoseKey === poseKey && this.lastCover === cover) return;
    const ctx = this.context;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    try {
      if (placement.warp?.mode === "quad") {
        const texture = this.getWarpTexture(cover);
        this.paintWarp(ctx, texture, placement.warp.corners);
      } else {
        this.paintRound(ctx, cover, placement);
      }
      this.lastPoseKey = poseKey;
      this.lastCover = cover;
      this.canvas.classList.add("held-record-visible");
    } catch (error) {
      this.lastPoseKey = "";
      this.lastCover = null;
      this.canvas.classList.remove("held-record-visible");
      console.warn("DJ held-record overlay unavailable; keeping original pose", error);
    }
  }

  private paintRound(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    placement: HeldRecordPlacement,
  ): void {
    const { x, y, size } = placement;
    const radius = size / 2;
    const square = Math.min(image.naturalWidth, image.naturalHeight);
    ctx.save();
    ctx.globalAlpha = 0.85; // Matches the calibration preview.
    ctx.imageSmoothingEnabled = true;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(
      image,
      (image.naturalWidth - square) / 2,
      (image.naturalHeight - square) / 2,
      square, square,
      x - radius, y - radius, size, size,
    );
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(7,10,14,.87)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private getWarpTexture(image: HTMLImageElement): HTMLCanvasElement {
    if (this.cachedTextureCover === image && this.cachedWarpTexture) return this.cachedWarpTexture;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = TEXTURE_SIZE;
    const ctx = canvas.getContext("2d")!;
    const w = image.naturalWidth, h = image.naturalHeight;
    const crop = Math.min(w, h);
    ctx.save();
    ctx.beginPath();
    ctx.arc(128, 128, 127, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(image, (w - crop) / 2, (h - crop) / 2, crop, crop, 0, 0, 256, 256);
    ctx.restore();
    ctx.strokeStyle = "rgba(4,8,14,.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(128, 128, 126.5, 0, Math.PI * 2);
    ctx.stroke();
    this.cachedWarpTexture = canvas;
    this.cachedTextureCover = image;
    return canvas;
  }

  /** Affine transform of one source triangle to its projected destination.
   * Each triangle is clipped; the surrounding mesh approximates true
   * projective perspective exactly as in Alignment Lab v2.
   */
  private paintTriangle(
    ctx: CanvasRenderingContext2D,
    texture: HTMLCanvasElement,
    a: readonly [number, number, number, number],
    b: readonly [number, number, number, number],
    c: readonly [number, number, number, number],
  ): void {
    const [x0,y0,X0,Y0] = a, [x1,y1,X1,Y1] = b, [x2,y2,X2,Y2] = c;
    const determinant = (x1-x0)*(y2-y0) - (x2-x0)*(y1-y0);
    if (Math.abs(determinant) < 0.00001) return;
    const ta = ((X1-X0)*(y2-y0) - (X2-X0)*(y1-y0)) / determinant;
    const tb = ((Y1-Y0)*(y2-y0) - (Y2-Y0)*(y1-y0)) / determinant;
    const tc = ((x1-x0)*(X2-X0) - (x2-x0)*(X1-X0)) / determinant;
    const td = ((x1-x0)*(Y2-Y0) - (x2-x0)*(Y1-Y0)) / determinant;
    const te = X0 - ta*x0 - tc*y0, tf = Y0 - tb*x0 - td*y0;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(X0, Y0);
    ctx.lineTo(X1, Y1);
    ctx.lineTo(X2, Y2);
    ctx.closePath();
    ctx.clip();
    ctx.setTransform(ta, tb, tc, td, te, tf);
    ctx.drawImage(texture, 0, 0);
    ctx.restore();
  }

  private paintWarp(ctx: CanvasRenderingContext2D, texture: HTMLCanvasElement, corners: QuadCorners): void {
    const n = WARP_SUBDIVISIONS;
    const step = TEXTURE_SIZE / n;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.imageSmoothingEnabled = true;
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        const u = col / n, v = row / n, u1 = (col + 1) / n, v1 = (row + 1) / n;
        const a = projectQuad(corners, u, v), b = projectQuad(corners, u1, v);
        const c = projectQuad(corners, u1, v1), d = projectQuad(corners, u, v1);
        const src = (x: number, y: number, p: {x: number; y: number}) =>
          [x, y, p.x, p.y] as const;
        this.paintTriangle(ctx, texture,
          src(col*step, row*step, a), src((col+1)*step, row*step, b), src((col+1)*step,(row+1)*step,c));
        this.paintTriangle(ctx, texture,
          src(col*step, row*step, a), src((col+1)*step,(row+1)*step,c), src(col*step,(row+1)*step,d));
      }
    }
    ctx.restore();
  }
}
