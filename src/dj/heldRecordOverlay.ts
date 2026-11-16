import {
  getHeldRecordPlacement,
  HELD_RECORD_SPRITE,
  projectQuad,
  type HeldRecordPlacement,
  type HeldRecordSide,
  type QuadCorners,
} from "./heldRecordCalibration";
import { getHeldRecordFingerMask } from "./heldRecordFingerMasks";

const TEXTURE_SIZE = 256;
const WARP_SUBDIVISIONS = 12;
const POSE_ASSET_PATH = "./assets/poses/final/";
type FingerLayer = { canvas: HTMLCanvasElement; x: number; y: number };
const FINGER_POSES = [
  "a41.png", "a11.png", "a12.png", "a11m.png", "a12m.png",
  "a11-2.png", "a11-2m.png",
] as const;

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
  private readonly fingerLayers = new Map<string, FingerLayer>();
  private readonly loadingFingerLayers = new Set<string>();
  private readonly failedFingerLayers = new Set<string>();

  constructor() {
    this.canvas = document.querySelector<HTMLCanvasElement>("#songChangeHeldCanvas");
    this.context = this.canvas?.getContext("2d", { alpha: true }) ?? null;
    if (this.canvas && this.context) {
      this.canvas.width = HELD_RECORD_SPRITE.width;
      this.canvas.height = HELD_RECORD_SPRITE.height;
      this.canvas.closest(".dj-wrap")?.classList.add("held-record-canvas-ready");
      // DJ Controller already preloads the exact same seven cinematic PNGs.
      // Build compact, pose-specific fingertip layers from those cached images
      // so no source color is inferred from the incoming Spotify cover.
      for (const pose of FINGER_POSES) this.prepareFingerLayer(pose);
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
      // This is the crucial occlusion pass. The new cover goes on the disc
      // FIRST; then the DJ's ORIGINAL hand pixels come back over its edges.
      // The mask excludes the source's black vinyl, preserving new artwork.
      const fingers = pose ? this.fingerLayers.get(pose) : null;
      if (fingers) ctx.drawImage(fingers.canvas, fingers.x, fingers.y);
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

  /** Build a compact pixel-exact cutout for each held-record pose. A
   * finger layer is painted once over a cover, never reclassified per frame.
   * Cropping to the mask bounds avoids seven full-size retained canvases.
   */
  private prepareFingerLayer(pose: string): void {
    if (this.fingerLayers.has(pose) || this.loadingFingerLayers.has(pose) ||
        this.failedFingerLayers.has(pose)) return;
    const mask = getHeldRecordFingerMask(pose);
    if (!mask) return;
    this.loadingFingerLayers.add(pose);
    const source = new Image();
    source.onload = () => {
      try {
        if (source.naturalWidth !== HELD_RECORD_SPRITE.width ||
            source.naturalHeight !== HELD_RECORD_SPRITE.height) {
          throw new Error("Unexpected cinematic sprite dimensions for " + pose);
        }
        const w = HELD_RECORD_SPRITE.width;
        let minX: number = w, minY: number = HELD_RECORD_SPRITE.height;
        let maxX = -1, maxY = -1;
        for (let index = 0; index < mask.length; index++) {
          if (!mask[index]) continue;
          const x = index % w, y = (index - x) / w;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
        if (maxX < minX || maxY < minY) throw new Error("Empty hand mask: " + pose);
        const canvas = document.createElement("canvas");
        canvas.width = maxX - minX + 1;
        canvas.height = maxY - minY + 1;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("No 2D context for hand mask");
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(source, -minX, -minY);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            if (!mask[(y + minY) * w + (x + minX)]) {
              pixels.data[(y * canvas.width + x) * 4 + 3] = 0;
            }
          }
        }
        ctx.putImageData(pixels, 0, 0);
        this.fingerLayers.set(pose, { canvas, x: minX, y: minY });
        // If the current frame was shown while this PNG was decoding,
        // repaint it with the fingertips on the next animation tick.
        this.lastPoseKey = "";
      } catch (error) {
        this.failedFingerLayers.add(pose);
        console.warn("Could not extract held-record fingertips", pose, error);
      } finally {
        this.loadingFingerLayers.delete(pose);
      }
    };
    source.onerror = () => {
      this.loadingFingerLayers.delete(pose);
      this.failedFingerLayers.add(pose);
      console.warn("Could not load held-record finger sprite", pose);
    };
    source.src = POSE_ASSET_PATH + pose;
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
