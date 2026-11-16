/**
 * Scratch-pose transition math, deliberately independent of the head rig.
 *
 * Only changed source pixels are blended. Unchanged pixels stay byte-for-byte
 * identical, so the static turntables, torso and pixel edges do not shimmer.
 * Source and destination alpha are interpolated in premultiplied space to
 * avoid black halos and sudden disappearance of transparent hand pixels.
 */
export type PixelBounds = { x: number; y: number; width: number; height: number };

export function scratchEase(progress: number): number {
  const t = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  return t * t * (3 - 2 * t);
}

export function scratchTransitionDuration(holdMs: number): number {
  // Keep more than half a frame steady for faster scratches; slow scratches
  // settle quickly rather than appearing to dissolve for their full hold.
  return Math.max(55, Math.min(115, holdMs * 0.42));
}

export function changedPixelBounds(
  from: Uint8ClampedArray,
  to: Uint8ClampedArray,
  width: number,
  height: number,
): PixelBounds | null {
  if (from.length !== width * height * 4 || to.length !== from.length) return null;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      const i = row + x * 4;
      if (from[i] === to[i] && from[i + 1] === to[i + 1] &&
          from[i + 2] === to[i + 2] && from[i + 3] === to[i + 3]) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return maxX < 0 ? null :
    { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function blendSpritePixels(
  from: Uint8ClampedArray,
  to: Uint8ClampedArray,
  output: Uint8ClampedArray,
  progress: number,
): void {
  if (from.length !== to.length || output.length !== from.length || from.length % 4 !== 0) {
    throw new Error("Mismatched scratch pose image data");
  }
  const t = Math.max(0, Math.min(1, progress));
  if (t === 0) { output.set(from); return; }
  if (t === 1) { output.set(to); return; }
  const remaining = 1 - t;
  for (let i = 0; i < from.length; i += 4) {
    const alphaA = from[i + 3] * remaining;
    const alphaB = to[i + 3] * t;
    const alpha = alphaA + alphaB;
    if (alpha <= 0) {
      output[i] = output[i + 1] = output[i + 2] = output[i + 3] = 0;
      continue;
    }
    output[i] = (from[i] * alphaA + to[i] * alphaB) / alpha;
    output[i + 1] = (from[i + 1] * alphaA + to[i + 1] * alphaB) / alpha;
    output[i + 2] = (from[i + 2] * alphaA + to[i + 2] * alphaB) / alpha;
    output[i + 3] = alpha;
  }
}
