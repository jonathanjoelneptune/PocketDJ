import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeTableRegion, VINYL_SPRITE_WIDTH, VINYL_SPRITE_HEIGHT } from "../src/dj/tableRegion.ts";
import { DECK_CALIBRATION, DeckAssignment, stepVinylAngle, VINYL_RPM } from "../src/dj/vinylMath.ts";

test("exported a8 table region retains the exact approved pixels", () => {
  const mask = decodeTableRegion();
  assert.equal(mask.length, VINYL_SPRITE_WIDTH * VINYL_SPRITE_HEIGHT);
  assert.equal(mask.reduce((count, pixel) => count + pixel, 0), 93_758);
  const at = (x, y) => mask[y * VINYL_SPRITE_WIDTH + x];
  assert.equal(at(170, 399), 1);
  assert.equal(at(425, 397), 1);
  assert.equal(at(280, 500), 1);
  assert.equal(at(280, 350), 0);
  assert.equal(at(350, 650), 0);
});

test("calibration uses the user's independent left/right platter centers", () => {
  assert.deepEqual(DECK_CALIBRATION.left, { x: 170, y: 399, rx: 55, ry: 28 });
  assert.deepEqual(DECK_CALIBRATION.right, { x: 425, y: 397, rx: 55, ry: 28 });
  assert.equal(VINYL_RPM, 16.2);
});

test("decks alternate on new song IDs but never on pause, resume, seek or speech", () => {
  const a = new DeckAssignment();
  const track = (id, art = "cover") => ({ source: "spotify", trackId: id, albumArtUrl: art });
  assert.deepEqual(a.accept(track("one")), {
    side: "right", trackKey: "spotify:one", coverUrl: "cover",
  });
  assert.equal(a.accept(track("one")), null);
  assert.equal(a.accept({ source: "none", trackId: null, albumArtUrl: null }), null);
  assert.equal(a.accept(track("one")), null);
  assert.deepEqual(a.accept(track("two")), {
    side: "left", trackKey: "spotify:two", coverUrl: "cover",
  });
  assert.equal(a.current("right"), "spotify:one");
  assert.equal(a.current("left"), "spotify:two");
  assert.equal(a.accept(track("two", "new-art")), null);
  assert.equal(a.accept(track("three")).side, "right");
});

test("vinyl rotates at 16.2 RPM and freezes exactly while paused", () => {
  const quarter = 60_000 / VINYL_RPM / 4;
  const moved = stepVinylAngle(0, quarter, true);
  assert.ok(Math.abs(moved - Math.PI / 2) < 1e-9);
  assert.equal(stepVinylAngle(moved, 1000, false), moved);
  const full = stepVinylAngle(0, 60_000 / VINYL_RPM, true);
  assert.ok(Math.abs(full) < 1e-9 || Math.abs(full - Math.PI * 2) < 1e-9);
  assert.equal(stepVinylAngle(moved, Number.NaN, true), moved);
});
