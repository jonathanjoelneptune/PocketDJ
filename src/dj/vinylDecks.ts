import type { NormalizedTrack } from "../state/types";
import { decodeTableRegion, VINYL_SPRITE_HEIGHT, VINYL_SPRITE_WIDTH } from "./tableRegion";
import { DECK_CALIBRATION, DeckAssignment, stepVinylAngle, type DeckSide } from "./vinylMath";

const W = VINYL_SPRITE_WIDTH;
const H = VINYL_SPRITE_HEIGHT;
const TABLE_REFERENCE = "./assets/poses/final/a8.png";
type SpriteBitmap = HTMLImageElement | HTMLCanvasElement;

const makeCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  return canvas;
};

/**
 * Shared static table → rotating album-art vinyl → changing DJ pixels.
 *
 * Derives the exact exported table mask from the original a8.png already
 * shipped by PocketDJ, rather than adding 77 duplicate network assets.
 * Sprite stripping is one-time per decoded image and held in a WeakMap.
 * A missing reference, bad dimensions, or readback error leaves the existing
 * original-sprite path usable without a partially painted DJ.
 */
export class VinylDeckStage {
  private table: HTMLCanvasElement | null = null;
  private pixels: Uint8ClampedArray | null = null;
  private readonly region = decodeTableRegion();
  private readonly stripped = new WeakMap<SpriteBitmap, HTMLCanvasElement>();
  private readonly assignments = new DeckAssignment();
  private readonly textures: Record<DeckSide, HTMLCanvasElement | null> = { left: null, right: null };
  private readonly coverUrls: Record<DeckSide, string | null> = { left: null, right: null };
  private readonly deckKeys: Record<DeckSide, string | null> = { left: null, right: null };
  private readonly requestVersions: Record<DeckSide, number> = { left: 0, right: 0 };
  private readonly angles: Record<DeckSide, number> = { left: 0, right: 0 };
  private playing = false;
  private lastFrameTime = 0;
  private generation = 0;
  private disabled = new URLSearchParams(window.location.search).get("vinyl") === "0";

  constructor() {
    if (!this.disabled) void this.loadTable();
  }

  get ready(): boolean { return this.table !== null && this.pixels !== null; }
  get revision(): number { return this.generation; }
  get moving(): boolean { return this.playing && Boolean(this.textures.left || this.textures.right); }
  get status(): string {
    return this.disabled ? "disabled" : !this.ready ? "loading/table fallback" :
      `layered (left:${this.deckKeys.left ? "loaded" : "empty"}, right:${this.deckKeys.right ? "loaded" : "empty"})`;
  }

  setPlayback(playback: NormalizedTrack): void {
    this.playing = playback.isPlaying;
    const change = this.assignments.accept(playback);
    if (change) {
      this.deckKeys[change.side] = change.trackKey;
      this.textures[change.side] = null;
      this.coverUrls[change.side] = null;
      this.requestVersions[change.side]++;
      this.generation++;
      if (change.coverUrl) this.setCover(change.side, change.coverUrl, change.trackKey);
    } else if (playback.trackId && playback.albumArtUrl) {
      // Spicetify/Spotify can deliver artwork after the track ID arrives.
      const key = `${playback.source}:${playback.trackId}`;
      for (const side of ["left", "right"] as const) {
        if (this.deckKeys[side] === key && this.coverUrls[side] !== playback.albumArtUrl) {
          this.setCover(side, playback.albumArtUrl, key);
        }
      }
    }
  }

  /** Extract a transparent DJ pose from the identical reference-table pixels.
   * Calling this after a head-rig split keeps the existing independent head.
   */
  foreground(image: SpriteBitmap): SpriteBitmap {
    if (!this.ready || !this.pixels) return image;
    const cached = this.stripped.get(image);
    if (cached) return cached;
    try {
      const canvas = makeCanvas();
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return image;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, W, H);
      const source = data.data;
      const table = this.pixels;
      for (let i = 0; i < this.region.length; i++) {
        if (!this.region[i]) continue;
        const at = i * 4;
        if (table[at + 3] !== source[at + 3]) continue;
        if (source[at] === table[at] && source[at + 1] === table[at + 1] &&
            source[at + 2] === table[at + 2]) source[at + 3] = 0;
      }
      ctx.putImageData(data, 0, 0);
      this.stripped.set(image, canvas);
      return canvas;
    } catch (error) {
      console.warn("Vinyl DJ foreground extraction unavailable", error);
      return image;
    }
  }

  paintBackground(ctx: CanvasRenderingContext2D, now: number): void {
    if (!this.table) return;
    this.advanceRotation(now);
    ctx.drawImage(this.table, 0, 0);
    this.paintDisc(ctx, "left");
    this.paintDisc(ctx, "right");
  }

  private advanceRotation(now: number): void {
    const elapsed = this.lastFrameTime === 0 ? 0 : Math.min(250, Math.max(0, now - this.lastFrameTime));
    this.lastFrameTime = now;
    for (const side of ["left", "right"] as const) {
      this.angles[side] = stepVinylAngle(this.angles[side], elapsed, this.playing);
    }
  }

  private paintDisc(ctx: CanvasRenderingContext2D, side: DeckSide): void {
    const texture = this.textures[side];
    if (!texture) return;
    const deck = DECK_CALIBRATION[side];
    ctx.save();
    ctx.translate(deck.x, deck.y);
    ctx.scale(1, deck.ry / deck.rx);
    ctx.rotate(this.angles[side]);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(texture, -deck.rx, -deck.rx, deck.rx * 2, deck.rx * 2);
    ctx.restore();
    ctx.imageSmoothingEnabled = false;
  }

  private async loadTable(): Promise<void> {
    try {
      const image = await this.loadImage(TABLE_REFERENCE);
      if (image.naturalWidth !== W || image.naturalHeight !== H) {
        throw new Error("Canonical a8 table is not 582×652");
      }
      const canvas = makeCanvas();
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Cannot create table canvas");
      ctx.drawImage(image, 0, 0);
      const source = ctx.getImageData(0, 0, W, H);
      const out = new Uint8ClampedArray(source.data);
      for (let i = 0; i < this.region.length; i++) {
        if (!this.region[i]) out[i * 4 + 3] = 0;
      }
      const stable = makeCanvas();
      const target = stable.getContext("2d");
      if (!target) throw new Error("Cannot render table layer");
      target.putImageData(new ImageData(out, W, H), 0, 0);
      this.pixels = out;
      this.table = stable;
      this.generation++;
    } catch (error) {
      console.warn("Vinyl reference table failed; preserving original full DJ sprites", error);
    }
  }

  private setCover(side: DeckSide, url: string, trackKey: string): void {
    this.coverUrls[side] = url;
    const version = ++this.requestVersions[side];
    void this.loadImage(url)
      .then(img => {
        if (this.requestVersions[side] !== version || this.deckKeys[side] !== trackKey) return;
        this.textures[side] = this.makeDiscTexture(img);
        this.generation++;
      })
      .catch(() => {
        // Keep the failed URL recorded so the 60fps render loop does not
        // repeatedly retry an unavailable Spotify cover.
        // The original black platter stays visible underneath.
      });
  }

  private makeDiscTexture(img: HTMLImageElement): HTMLCanvasElement {
    const size = 280;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d")!;
    const center = size / 2;
    ctx.fillStyle = "#090b0e";
    ctx.beginPath(); ctx.arc(center, center, 139, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1b1f22";
    ctx.beginPath(); ctx.arc(center, center, 129, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#626e74"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(center, center, 135, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 8; i++) {
      ctx.strokeStyle = `rgba(150,170,185,${0.065 + (i % 3) * 0.04})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(center, center, 132 - i * 4, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.save();
    ctx.beginPath(); ctx.arc(center, center, 114, 0, Math.PI * 2); ctx.clip();
    const square = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - square) / 2;
    const sy = (img.naturalHeight - square) / 2;
    ctx.drawImage(img, sx, sy, square, square, 26, 26, 228, 228);
    ctx.restore();
    ctx.strokeStyle = "#22292d"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(center, center, 114, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#121921";
    ctx.beginPath(); ctx.arc(center, center, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#afbabd";
    ctx.beginPath(); ctx.arc(center, center, 3, 0, Math.PI * 2); ctx.fill();
    return c;
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        // A successful decode avoids flashing on slower Android WebViews.
        if (image.decode) void image.decode().then(() => resolve(image), () => resolve(image));
        else resolve(image);
      };
      image.onerror = () => reject(new Error("Failed to load vinyl asset: " + url));
      image.src = url;
    });
  }
}
