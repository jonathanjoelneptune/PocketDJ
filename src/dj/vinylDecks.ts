import type { NormalizedTrack } from "../state/types";
import { decodeTableRegion, removeMatchingTablePixels, VINYL_SPRITE_HEIGHT, VINYL_SPRITE_WIDTH } from "./tableRegion";
import { canPlaceIncomingVinyl, shouldHideCinematicPlatter, DECK_CALIBRATION, DeckAssignment, stepVinylAngle, type DeckSide, type VinylCinematicPhase } from "./vinylMath";

const W = VINYL_SPRITE_WIDTH;
const H = VINYL_SPRITE_HEIGHT;
const TABLE_REFERENCE = "./assets/poses/final/a8.png";
type SpriteBitmap = HTMLImageElement | HTMLCanvasElement;
type StagedRecord = {
  side: DeckSide;
  trackKey: string;
  coverUrl: string | null;
  texture: HTMLCanvasElement | null;
  loading: boolean;
};

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
  // Keep the outgoing record on its platter while a cinematic is queued.
  // During the actual cinematic, render the bare destination platter under
  // the calibrated held-record artwork. Place the incoming disc when done.
  private stagedRecord: StagedRecord | null = null;
  private cinematicPhase: VinylCinematicPhase = "none";
  private activeTrackKey: string | null = null;
  private hiddenDeckDuringCinematic: DeckSide | null = null;
  private readonly placeholderTexture: HTMLCanvasElement;
  private playing = false;
  private lastFrameTime = 0;
  private generation = 0;
  private disabled = new URLSearchParams(window.location.search).get("vinyl") === "0";

  constructor() {
    // Draw the blank-deck album locally: no remote image, extra network request
    // or startup flicker. It spins even when only one song is loaded.
    this.placeholderTexture = this.makePlaceholderDiscTexture();
    if (!this.disabled) void this.loadTable();
  }

  get ready(): boolean { return this.table !== null && this.pixels !== null; }
  get revision(): number { return this.generation; }
  get moving(): boolean { return this.playing && this.ready; }
  get status(): string {
    return this.disabled ? "disabled" : !this.ready ? "loading/table fallback" :
      `layered (left:${this.hiddenDeckDuringCinematic === "left" ? "bare" : this.textures.left ? "album" : "placeholder"}, right:${this.hiddenDeckDuringCinematic === "right" ? "bare" : this.textures.right ? "album" : "placeholder"}${this.stagedRecord ? ", staged:" + this.stagedRecord.side : ""})`;
  }

  /**
   * Preload the next album without touching the outgoing record. Once A41
   * begins, hide only the destination deck's vinyl (not the static table),
   * then restore it with the new artwork AFTER the final placement pose.
   */
  setPlayback(playback: NormalizedTrack, cinematicPhase: VinylCinematicPhase = "none"): void {
    this.playing = playback.isPlaying;
    this.cinematicPhase = cinematicPhase;
    this.activeTrackKey = playback.trackId ? `${playback.source}:${playback.trackId}` : null;
    const change = this.assignments.accept(playback);
    if (change) {
      // A fast skip may interrupt a previous change; stale image promises are
      // ignored through StagedRecord identity checks.
      this.stagedRecord = null;
      if (cinematicPhase !== "none") {
        const staged: StagedRecord = {
          side: change.side,
          trackKey: change.trackKey,
          coverUrl: change.coverUrl,
          texture: null,
          loading: Boolean(change.coverUrl),
        };
        this.stagedRecord = staged;
        if (change.coverUrl) this.loadStagedCover(staged, change.coverUrl);
      } else {
        this.commitDeck(change.side, change.trackKey, change.coverUrl, null);
      }
    }

    const staged = this.stagedRecord;
    if (staged && staged.trackKey === this.activeTrackKey) {
      // Album art may arrive later than track metadata in the desktop embed.
      if (playback.albumArtUrl && staged.coverUrl !== playback.albumArtUrl) {
        staged.coverUrl = playback.albumArtUrl;
        staged.texture = null;
        staged.loading = true;
        this.loadStagedCover(staged, playback.albumArtUrl);
      }
      // Keep the target platter bare for every held/placing frame, even
      // when the incoming album art has already decoded.
      this.syncCinematicDeckVisibility();
      this.tryReleaseStagedRecord();
      return;
    }

    this.syncCinematicDeckVisibility();
    if (this.activeTrackKey && playback.albumArtUrl) {
      for (const side of ["left", "right"] as const) {
        if (this.deckKeys[side] === this.activeTrackKey && this.coverUrls[side] !== playback.albumArtUrl) {
          this.setCover(side, playback.albumArtUrl, this.activeTrackKey);
        }
      }
    }
  }

  /** A phase change itself invalidates the canvas, including when paused. */
  private syncCinematicDeckVisibility(): void {
    const stagedSide = this.stagedRecord?.trackKey === this.activeTrackKey
      ? this.stagedRecord.side : null;
    const next = this.cinematicPhase === "active" ? stagedSide : null;
    if (next !== this.hiddenDeckDuringCinematic) {
      this.hiddenDeckDuringCinematic = next;
      this.generation++;
    }
  }

  private loadStagedCover(staged: StagedRecord, url: string): void {
    void this.loadImage(url)
      .then(img => {
        if (this.stagedRecord !== staged || staged.coverUrl !== url) return;
        staged.texture = this.makeDiscTexture(img);
        staged.loading = false;
        this.tryReleaseStagedRecord();
      })
      .catch(() => {
        if (this.stagedRecord !== staged || staged.coverUrl !== url) return;
        staged.loading = false;
        // A failed image should not trap the song in a permanent pending state.
        this.tryReleaseStagedRecord();
      });
  }

  private tryReleaseStagedRecord(): void {
    const staged = this.stagedRecord;
    if (!staged || staged.trackKey !== this.activeTrackKey ||
        !canPlaceIncomingVinyl(this.cinematicPhase, staged.loading)) return;
    this.stagedRecord = null;
    // Incoming vinyl begins its own rotation at placement, rather than
    // continuing a hidden rotation from when the DJ picked it up.
    this.angles[staged.side] = 0;
    this.commitDeck(staged.side, staged.trackKey, staged.coverUrl, staged.texture);
    this.syncCinematicDeckVisibility();
  }

  private commitDeck(
    side: DeckSide,
    trackKey: string,
    coverUrl: string | null,
    readyTexture: HTMLCanvasElement | null,
  ): void {
    this.deckKeys[side] = trackKey;
    this.requestVersions[side]++;
    this.coverUrls[side] = coverUrl;
    this.textures[side] = readyTexture;
    this.generation++;
    if (coverUrl && !readyTexture) this.setCover(side, coverUrl, trackKey);
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
      removeMatchingTablePixels(data.data, this.pixels, this.region);
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
      if (shouldHideCinematicPlatter(this.cinematicPhase, this.hiddenDeckDuringCinematic, side)) continue;
      this.angles[side] = stepVinylAngle(this.angles[side], elapsed, this.playing);
    }
  }

  private paintDisc(ctx: CanvasRenderingContext2D, side: DeckSide): void {
    // Do NOT draw the old album, incoming artwork or the default placeholder
    // under the DJ's held record. The a8 reference still paints the platter.
    if (shouldHideCinematicPlatter(this.cinematicPhase, this.hiddenDeckDuringCinematic, side)) return;
    const texture = this.textures[side] ?? this.placeholderTexture;
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

  /** Stylized PocketDJ album used on decks with no loaded song.
   * It has a visible label and grooves, so a newly opened session always
   * displays two records instead of an empty platter beside the first song.
   */
  private makePlaceholderDiscTexture(): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = c.height = 280;
    const ctx = c.getContext("2d")!;
    const mid = 140;
    ctx.fillStyle = "#080c13";
    ctx.beginPath(); ctx.arc(mid, mid, 139, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#68797f";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mid, mid, 136, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 22; i++) {
      ctx.strokeStyle = i % 3 === 0 ? "rgba(123,168,181,0.22)" : "rgba(168,188,199,0.10)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(mid, mid, 127 - i * 3.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#1f5054";
    ctx.beginPath(); ctx.arc(mid, mid, 49, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#c4a56e";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(mid, mid, 47, 0, Math.PI * 2); ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#f7dfad";
    ctx.font = "bold 15px monospace";
    ctx.fillText("POCKET", mid, mid - 11);
    ctx.font = "bold 26px monospace";
    ctx.fillText("DJ", mid, mid + 13);
    ctx.fillStyle = "#050b11";
    ctx.beginPath(); ctx.arc(mid, mid, 4, 0, Math.PI * 2); ctx.fill();
    return c;
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
