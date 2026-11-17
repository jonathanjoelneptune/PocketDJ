import assert from "node:assert/strict";
import { test } from "node:test";
import {
  choosePerformancePose,
  performancePoseHoldMs,
  VIBE_PROBABILITY,
} from "../src/dj/performanceLoopPolicy.ts";

const scratches = Array.from({length: 6}, (_, i) => ({kind: "quick", id: "scratch-" + i}));
const vibes = Array.from({length: 5}, (_, i) => ({kind: "vibe", id: "vibe-" + i}));
const random = (value) => () => value;

test("standing pose is always followed by scratching, regardless of random roll", () => {
  for (const vibe of vibes) {
    for (const sample of [0, .01, .1, .5, .99999]) {
      assert.equal(choosePerformancePose(scratches, vibes, vibe, random(sample)).kind, "quick");
    }
  }
});

test("standing pose selection is deliberately rarer and preserves random variety", () => {
  assert.ok(VIBE_PROBABILITY > 0 && VIBE_PROBABILITY < 0.2);
  let vibesChosen = 0;
  let previous = null;
  let seed = 2891;
  const next = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 10000; i++) {
    const chosen = choosePerformancePose(scratches, vibes, previous, next);
    if (chosen.kind === "vibe") vibesChosen++;
    if (previous?.kind === "vibe") assert.equal(chosen.kind, "quick");
    previous = chosen;
  }
  assert.ok(vibesChosen > 500 && vibesChosen < 1500, "vibe frequency around 10-14%");
});

test("standing poses last approximately thirty seconds", () => {
  for (const p of [0, .2, .5, .75, .999]) {
    const ms = performancePoseHoldMs("vibe", 18_000, random(p));
    assert.ok(ms >= 27_000 && ms <= 33_000);
  }
});

test("normal scratch families never switch poses after only five seconds", () => {
  for (const max of [20_000, 24_000, 34_000]) {
    for (const p of [0, .1, .5, .9999]) {
      const ms = performancePoseHoldMs("quick", max, random(p));
      assert.ok(ms >= 16_000 && ms <= Math.max(28_000, max));
    }
  }
});
