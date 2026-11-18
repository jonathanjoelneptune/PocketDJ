import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeTableRegion, removeMatchingTablePixels, VINYL_SPRITE_WIDTH, VINYL_SPRITE_HEIGHT } from "../src/dj/tableRegion.ts";
import { canPlaceIncomingVinyl, shouldHideCinematicPlatter, DECK_CALIBRATION, DeckAssignment, stepVinylAngle, VINYL_RPM, VINYL_DISC_SCALE, VINYL_DISC_THICKNESS_PX } from "../src/dj/vinylMath.ts";

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

test("rendered albums are subtly larger with a thin edge, without changing deck calibration", () => {
  assert.equal(VINYL_DISC_SCALE, 1.07);
  assert.equal(VINYL_DISC_THICKNESS_PX, 2);
  for (const side of ["left", "right"]) {
    const deck = DECK_CALIBRATION[side];
    const scaledRx = deck.rx * VINYL_DISC_SCALE;
    const scaledRy = deck.ry * VINYL_DISC_SCALE;
    assert.ok(scaledRx > deck.rx && scaledRx < deck.rx * 1.1);
    assert.ok(scaledRy > deck.ry && scaledRy < deck.ry * 1.1);
    assert.ok(Math.abs(scaledRy / scaledRx - deck.ry / deck.rx) < 1e-12,
      "vinyl preserves the original elliptical perspective");
    assert.ok(VINYL_DISC_THICKNESS_PX < deck.ry * 0.1,
      "the edge stays a subtle screen-space detail");
  }
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

test("only identical RGBA table pixels inside the approved mask are removed", () => {
  const original = new Uint8ClampedArray([
    12, 34, 56, 255,  // exact table match -> transparent
    12, 34, 57, 255,  // different DJ pixel under table -> visible
    12, 34, 56, 255,  // same color OUTSIDE table mask -> visible
    12, 34, 56, 128,  // differs in alpha -> preserved
  ]);
  const reference = new Uint8ClampedArray([
    12, 34, 56, 255,
    12, 34, 56, 255,
    12, 34, 56, 255,
    12, 34, 56, 255,
  ]);
  removeMatchingTablePixels(original, reference, new Uint8Array([1, 1, 0, 1]));
  assert.deepEqual([...original.filter((_, i) => i % 4 === 3)], [0, 255, 255, 128]);
});


test("the destination is the ONLY empty vinyl deck during an active change", () => {
  for (const side of ["left", "right"]) {
    const opposite = side === "left" ? "right" : "left";
    // The old record remains playing until the first cinematic frame.
    assert.equal(shouldHideCinematicPlatter("pending", side, side), false);
    assert.equal(shouldHideCinematicPlatter("pending", side, opposite), false);
    // The album is held in A41/A11/A12 and warped onto A11-2. The platter
    // must remain bare under ALL of those poses.
    for (const frame of ["a41", "a11", "a12", "a11-2"]) {
      assert.equal(shouldHideCinematicPlatter("active", side, side), true, frame);
      assert.equal(shouldHideCinematicPlatter("active", side, opposite), false, frame);
    }
    // Keep the platter bare until the staged new album has decoded and is
    // committed. Once the stage is cleared, the new record becomes visible.
    assert.equal(shouldHideCinematicPlatter("none", side, side), true, "awaiting placement/decode");
    assert.equal(shouldHideCinematicPlatter("none", side, opposite), false);
    assert.equal(shouldHideCinematicPlatter("none", null, side), false, "new album placed");
  }
  assert.equal(shouldHideCinematicPlatter("active", null, "left"), false);
  assert.equal(shouldHideCinematicPlatter("active", null, "right"), false);
});

test("new album is not placed before the cinematic finishes, even if artwork loads early", () => {
  for (const phase of ["pending", "active"]) {
    assert.equal(canPlaceIncomingVinyl(phase, false), false, phase + ": cover decoded");
    assert.equal(canPlaceIncomingVinyl(phase, true), false, phase + ": still loading");
  }
  assert.equal(canPlaceIncomingVinyl("none", true), false, "wait for late cover decode");
  assert.equal(canPlaceIncomingVinyl("none", false), true, "place album after cinematic + decode");
});

test("a quick cancelled change does not leave the destination permanently hidden", () => {
  assert.equal(shouldHideCinematicPlatter("pending", "left", "left"), false);
  assert.equal(shouldHideCinematicPlatter("active", "left", "left"), true);
  assert.equal(shouldHideCinematicPlatter("none", "left", "left"), true, "wait until the new album is committed");
  assert.equal(canPlaceIncomingVinyl("none", false), true);
  assert.equal(shouldHideCinematicPlatter("none", null, "left"), false, "restore when placed");
});

test("alternating deck assignment occurs before reveal without resetting existing disc on pause", () => {
  const decks = new DeckAssignment();
  const first = decks.accept({ source: "spotify", trackId: "first", albumArtUrl: "first.jpg" });
  assert.equal(first.side, "right");
  const second = decks.accept({ source: "spotify", trackId: "second", albumArtUrl: "second.jpg" });
  assert.equal(second.side, "left");
  assert.equal(decks.accept({ source: "spotify", trackId: "second", albumArtUrl: "second.jpg" }), null);
  assert.equal(decks.current("right"), first.trackKey);
  assert.equal(decks.current("left"), second.trackKey);
});

test("first song has exactly one assigned deck, with independent rotation for placeholder deck", () => {
  const decks = new DeckAssignment();
  const first = decks.accept({ source: "spotify", trackId: "first", albumArtUrl: "first.jpg" });
  assert.equal(first.side, "right");
  assert.equal(decks.current("left"), null, "left deck has no album and should render the placeholder");
  assert.equal(decks.current("right"), "spotify:first");
  const step = stepVinylAngle(0, 1000, true);
  assert.ok(step > 0, "empty deck's placeholder disc can spin at the same RPM");
  assert.equal(stepVinylAngle(step, 1000, false), step, "placeholder freezes while playback is paused");
});
