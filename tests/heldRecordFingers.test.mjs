import assert from "node:assert/strict";
import { test } from "node:test";
import { EXPECTED_FINGER_PIXELS, getHeldRecordFingerMask } from "../src/dj/heldRecordFingerMasks.ts";
import { HELD_RECORD_SPRITE, getHeldRecordPlacement } from "../src/dj/heldRecordCalibration.ts";

const { width, height } = HELD_RECORD_SPRITE;
const expected = [
  ["a41.png", 2142],
  ["a11.png", 1987],
  ["a12.png", 2224],
  ["a11m.png", 1319],
  ["a12m.png", 2110],
  ["a11-2.png", 433],
  ["a11-2m.png", 378],
];

test("every held-record sprite has a bounded, exact original-pixel hand mask", () => {
  for (const [pose, pixelCount] of expected) {
    const mask = getHeldRecordFingerMask(pose);
    assert.ok(mask, pose + " must have an approved mask");
    assert.equal(mask.length, width * height);
    assert.equal(mask.reduce((n, value) => n + value, 0), pixelCount, pose + " count");
    assert.equal(EXPECTED_FINGER_PIXELS[pose], pixelCount);
    assert.equal(getHeldRecordFingerMask(pose), mask, "mask decoded only once");
    assert.equal(mask[0], 0);
    assert.equal(mask[mask.length - 1], 0);
  }
});

test("masks cover finger positions on BOTH sides without painting the black record center", () => {
  const pixel = (pose, x, y) => getHeldRecordFingerMask(pose)[y * width + x];
  assert.equal(pixel("a41.png", 242, 280), 1, "A41 left finger");
  assert.equal(pixel("a41.png", 332, 285), 1, "A41 right finger");
  assert.equal(pixel("a41.png", 288, 296), 0, "A41 middle of vinyl stays artwork");
  assert.equal(pixel("a11.png", 343, 235), 1, "right approach left fingers");
  assert.equal(pixel("a11.png", 444, 241), 1, "right approach right fingers");
  assert.equal(pixel("a12.png", 366, 192), 1, "right lift left fingers");
  assert.equal(pixel("a12.png", 463, 204), 1, "right lift right fingers");
  assert.equal(pixel("a11m.png", 153, 239), 1, "left approach left fingers");
  assert.equal(pixel("a11m.png", 229, 244), 1, "left approach right fingers");
  assert.equal(pixel("a12m.png", 125, 204), 1, "left lift left fingers");
  assert.equal(pixel("a12m.png", 207, 199), 1, "left lift right fingers");
  assert.equal(pixel("a11-2.png", 438, 377), 1, "right placement fingertips on tilted disc");
  assert.equal(pixel("a11-2m.png", 144, 373), 1, "left placement fingertips on tilted disc");
});

test("only calibrated visible held-album frames have foreground masks", () => {
  assert.equal(getHeldRecordFingerMask("a10.png"), null);
  assert.equal(getHeldRecordFingerMask("a13.png"), null);
  assert.equal(getHeldRecordFingerMask("a13-2.png"), null);
  assert.equal(getHeldRecordFingerMask("i6.png"), null);
  const right = ["a41.png","a11.png","a12.png","a11-2.png"];
  const left = ["a41.png","a11m.png","a12m.png","a11-2m.png"];
  for (const pose of right) {
    assert.equal(getHeldRecordPlacement("right", pose)?.visible, true);
    assert.ok(getHeldRecordFingerMask(pose));
  }
  for (const pose of left) {
    assert.equal(getHeldRecordPlacement("left", pose)?.visible, true);
    assert.ok(getHeldRecordFingerMask(pose));
  }
});
