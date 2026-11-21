import test from "node:test";
import assert from "node:assert/strict";
import { FESTIVAL_DEFAULT_LAYOUT, normalizeFestivalLayout, FESTIVAL_OBJECT_LABELS } from "../src/scenes/scenePresets.ts";

test("festival defaults have finite normalized coordinates for every movable object", () => {
  const scene = normalizeFestivalLayout(FESTIVAL_DEFAULT_LAYOUT);
  assert.equal(scene.version, 1);
  assert.deepEqual(Object.keys(scene.objects).sort(), Object.keys(FESTIVAL_OBJECT_LABELS).sort());
  for (const placement of Object.values(scene.objects)) {
    assert.ok(Number.isFinite(placement.x));
    assert.ok(Number.isFinite(placement.y));
    assert.ok(placement.scale >= 0.25 && placement.scale <= 3);
    assert.ok(placement.opacity >= 0 && placement.opacity <= 1);
  }
});

test("layout normalization clamps malformed scene imports without mutating the preset", () => {
  const before = structuredClone(FESTIVAL_DEFAULT_LAYOUT);
  const scene = normalizeFestivalLayout({
    version: 1,
    objects: {
      performer: { x: 999, y: -999, scale: -7, opacity: 9 },
      speakerLeft: { x: "not-a-number", y: 78, scale: 2, opacity: -1 },
    },
    audienceDensity: 12,
    lightingStrength: -22,
  });
  assert.deepEqual(scene.objects.performer, { x: 130, y: -30, scale: 0.25, opacity: 1 });
  assert.equal(scene.objects.speakerLeft.x, FESTIVAL_DEFAULT_LAYOUT.objects.speakerLeft.x);
  assert.equal(scene.objects.speakerLeft.y, 78);
  assert.equal(scene.objects.speakerLeft.opacity, 0);
  assert.equal(scene.audienceDensity, 1);
  assert.equal(scene.lightingStrength, 0);
  assert.deepEqual(FESTIVAL_DEFAULT_LAYOUT, before);
});

test("partial imported layouts retain positions and safe defaults for omitted objects", () => {
  const scene = normalizeFestivalLayout({
    objects: { lyrics: { x: 35, y: 20, scale: 1.4, opacity: 0.7 } },
  });
  assert.equal(scene.objects.lyrics.x, 35);
  assert.deepEqual(scene.objects.performer, FESTIVAL_DEFAULT_LAYOUT.objects.performer);
});
