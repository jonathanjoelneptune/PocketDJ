import assert from "node:assert/strict";
import { test } from "node:test";
import {
  blendSpritePixels, changedPixelBounds, scratchEase, scratchTransitionDuration,
} from "../src/dj/scratchBlend.ts";

test("scratch easing has exact endpoints and no overshoot", () => {
  assert.equal(scratchEase(-2), 0);
  assert.equal(scratchEase(0), 0);
  assert.equal(scratchEase(0.5), 0.5);
  assert.equal(scratchEase(1), 1);
  assert.equal(scratchEase(5), 1);
  assert.ok(scratchEase(0.25) < 0.25, "starts gently");
  assert.ok(scratchEase(0.75) > 0.75, "settles gently");
});

test("scratch durations leave a stable hold for fast and slow frame timing", () => {
  assert.equal(scratchTransitionDuration(0), 0);
  assert.equal(scratchTransitionDuration(120), 74.4);
  assert.equal(scratchTransitionDuration(240), 148.8);
  assert.equal(scratchTransitionDuration(620), 190);
  assert.ok(scratchTransitionDuration(240) < 240, "leave time to hold the destination pose");
});

test("different pixel region excludes static pixels", () => {
  const before = new Uint8ClampedArray(4 * 3 * 4);
  const after = before.slice();
  const set = (pixels, x, y, rgba) => pixels.set(rgba, (y * 4 + x) * 4);
  set(before, 1, 1, [255, 0, 0, 255]);
  set(after, 1, 1, [0, 0, 255, 255]);
  set(before, 2, 2, [255, 0, 0, 255]);
  set(after, 2, 2, [255, 0, 0, 0]);
  assert.deepEqual(changedPixelBounds(before, after, 4, 3), { x: 1, y: 1, width: 2, height: 2 });
  assert.equal(changedPixelBounds(before, before, 4, 3), null);
});

test("opaque image color blends smoothly with identical alpha", () => {
  const a = new Uint8ClampedArray([255, 0, 0, 255]);
  const b = new Uint8ClampedArray([0, 0, 255, 255]);
  const o = new Uint8ClampedArray(4);
  blendSpritePixels(a, b, o, 0.5);
  assert.deepEqual(Array.from(o), [128, 0, 128, 255]);
});

test("transparent hand pixels fade without black halos", () => {
  const opaque = new Uint8ClampedArray([240, 80, 40, 255]);
  const transparent = new Uint8ClampedArray([0, 0, 0, 0]);
  const o = new Uint8ClampedArray(4);
  blendSpritePixels(opaque, transparent, o, 0.5);
  assert.deepEqual(Array.from(o), [240, 80, 40, 128]);
  blendSpritePixels(transparent, opaque, o, 0.5);
  assert.deepEqual(Array.from(o), [240, 80, 40, 128]);
  blendSpritePixels(transparent, opaque, o, 1);
  assert.deepEqual(Array.from(o), Array.from(opaque));
  blendSpritePixels(opaque, transparent, o, 0);
  assert.deepEqual(Array.from(o), Array.from(opaque));
});

test("bad scratch interpolation inputs fail before altering pixels", () => {
  assert.throws(() => blendSpritePixels(new Uint8ClampedArray(4), new Uint8ClampedArray(8), new Uint8ClampedArray(4), 0.5));
  assert.equal(changedPixelBounds(new Uint8ClampedArray(5), new Uint8ClampedArray(5), 1, 1), null);
});
