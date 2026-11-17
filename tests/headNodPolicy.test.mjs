import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  shouldNodDuringTrack, NOD_QUIET_START_MS, NOD_QUIET_END_MS,
  NOD_PHRASE_MS, NOD_DUTY,
} from '../src/dj/headNodPolicy.ts';

test('intro and outro are silent for exactly fifteen seconds', () => {
  assert.equal(NOD_QUIET_START_MS, 15_000);
  assert.equal(NOD_QUIET_END_MS, 15_000);
  for (const progress of [0, 300, 14_000, 14_999, 165_000, 170_000, 179_999]) {
    assert.equal(shouldNodDuringTrack('spotify:track1', progress, 180_000), false);
  }
  assert.equal(shouldNodDuringTrack('spotify:track1', 15_000, 30_000), false);
  assert.equal(shouldNodDuringTrack('spotify:track1', 16_000, 30_000), false);
});

test('nod/no-nod choice stays stable throughout each phrase', () => {
  for (let i = 0; i < 60; i++) {
    const start = NOD_QUIET_START_MS + i * NOD_PHRASE_MS;
    const a = shouldNodDuringTrack('song-x', start + 200, 1_000_000);
    const b = shouldNodDuringTrack('song-x', start + 6_000, 1_000_000);
    const c = shouldNodDuringTrack('song-x', start + NOD_PHRASE_MS - 1, 1_000_000);
    assert.equal(a, b);
    assert.equal(b, c);
  }
});

test('head nods occupy approximately sixty-five percent of eligible phrases', () => {
  assert.equal(NOD_DUTY, 0.65);
  let on = 0;
  let total = 0;
  for (let t = 0; t < 40; t++) for (let p = 0; p < 25; p++) {
    total++;
    if (shouldNodDuringTrack('song-' + t, 15_000 + p * NOD_PHRASE_MS, 600_000)) on++;
  }
  const proportion = on / total;
  assert.ok(proportion > 0.61 && proportion < 0.69, 'actual duty=' + proportion);
});

test('unknown duration never guesses end; invalid progress never enables nod', () => {
  assert.equal(shouldNodDuringTrack('', 40_000, 180_000), false);
  assert.equal(shouldNodDuringTrack('song', NaN, 180_000), false);
  assert.equal(shouldNodDuringTrack('song', 12_000, 0), false);
  // Policy remains valid without a known end time.
  const samples = Array.from({length: 35}, (_,i)=>shouldNodDuringTrack('song', 15_000+i*NOD_PHRASE_MS, 0));
  assert.ok(samples.some(Boolean) && samples.some(x=>!x));
});
