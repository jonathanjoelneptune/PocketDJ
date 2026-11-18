import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  headNodIntensityDuringTrack, shouldNodDuringTrack, scaleHeadNodMotion,
  NOD_QUIET_START_MS, NOD_QUIET_END_MS, NOD_PHRASE_MS,
  NOD_DUTY, NOD_MIN_INTENSITY, NOD_INTENSITY_RAMP_MS,
} from '../src/dj/headNodPolicy.ts';

const intensity = (track, progress, duration = 600_000) =>
  headNodIntensityDuringTrack(track, progress, duration);

test('first and last 15 seconds remain completely head-nod free', () => {
  assert.equal(NOD_QUIET_START_MS, 15_000);
  assert.equal(NOD_QUIET_END_MS, 15_000);
  for (const progress of [0, 300, 14_000, 14_999, 165_000, 170_000, 179_999, 180_000]) {
    assert.equal(intensity('spotify:track1', progress, 180_000), 0, String(progress));
    assert.equal(shouldNodDuringTrack('spotify:track1', progress, 180_000), false);
  }
  assert.equal(intensity('spotify:track1', 15_000, 180_000), 1,
    'head nodding starts at the first eligible instant');
  assert.equal(intensity('spotify:track1', 15_000, 30_000), 0);
  assert.equal(intensity('spotify:track1', 16_000, 30_000), 0);
  assert.equal(intensity('spotify:track1', 16_000, 31_000), 0,
    'still within the final fifteen seconds');
});

test('all eligible middle phrases nod, including previously quiet phrases', () => {
  let reduced = 0, total = 0;
  for (let t = 0; t < 40; t++) for (let p = 0; p < 25; p++) {
    total++;
    const at = NOD_QUIET_START_MS + p * NOD_PHRASE_MS + NOD_PHRASE_MS / 2;
    const gain = intensity('song-' + t, at);
    assert.ok(gain >= NOD_MIN_INTENSITY && gain <= 1, `gain=${gain}`);
    assert.equal(shouldNodDuringTrack('song-' + t, at, 600_000), true);
    if (gain < 1) reduced++;
  }
  assert.equal(NOD_DUTY, 0.65);
  assert.equal(NOD_MIN_INTENSITY, 0.25);
  const fullProportion = 1 - reduced / total;
  assert.ok(fullProportion > 0.61 && fullProportion < 0.69,
    'full-intensity phrase share=' + fullProportion);
});

test('reduced phrases have smooth, varying amplitude rather than an on/off switch', () => {
  assert.equal(NOD_PHRASE_MS, 12_000);
  assert.equal(NOD_INTENSITY_RAMP_MS, 2_000);
  let reducedStart = -1;
  for (let p = 0; p < 200; p++) {
    const start = NOD_QUIET_START_MS + p * NOD_PHRASE_MS;
    if (intensity('song-x', start + 6_000, 3_000_000) < 0.99) {
      reducedStart = start;
      break;
    }
  }
  assert.ok(reducedStart > 0, 'find a reduced-intensity phrase');
  const at = d => intensity('song-x', reducedStart + d, 3_000_000);
  const trough = at(6_000);
  assert.equal(at(0), 1, 'entry uses the previous phrase’s full amplitude');
  assert.ok(at(1_000) < 1 && at(1_000) > trough, 'eases down from full travel');
  assert.ok(trough >= 0.25 && trough < 0.99, 'minimum retains visible motion');
  assert.equal(at(3_000), trough, 'holds a softer but nonzero amplitude');
  assert.equal(at(9_000), trough, 'does not flicker every frame');
  assert.ok(at(11_000) < 1 && at(11_000) > trough, 'eases back upward');
  assert.ok(Math.abs(at(11_999.9) - 1) < 0.000001, 'finishes close to full amplitude');
  assert.equal(at(NOD_PHRASE_MS), 1, 'adjacent phrase boundary is continuous');
});

test('head motion scales existing x, y and tilt without altering the pose', () => {
  const motion = { x: 8, y: -12, tilt: 6 };
  assert.deepEqual(scaleHeadNodMotion(motion, 1), motion);
  assert.deepEqual(scaleHeadNodMotion(motion, 0.25), { x: 2, y: -3, tilt: 1.5 });
  assert.deepEqual(scaleHeadNodMotion(motion, 0.5), { x: 4, y: -6, tilt: 3 });
  assert.deepEqual(scaleHeadNodMotion(motion, 0), { x: 0, y: -0, tilt: 0 });
  assert.deepEqual(scaleHeadNodMotion(motion, Number.NaN), { x: 0, y: -0, tilt: 0 });
  assert.deepEqual(motion, { x: 8, y: -12, tilt: 6 }, 'source rig must not mutate');
});

test('unknown duration honors the start zone; invalid progress cannot enable nodding', () => {
  assert.equal(intensity('', 40_000, 180_000), 0);
  assert.equal(intensity('song', NaN, 180_000), 0);
  assert.equal(intensity('song', -1, 180_000), 0);
  assert.equal(intensity('song', 12_000, 0), 0);
  assert.ok(intensity('song', 16_000, 0) > 0, 'unknown outro does not disable valid head motion');
  const samples = Array.from({ length: 35 },
    (_, i) => intensity('song', 15_000 + (i + 0.5) * NOD_PHRASE_MS, 0));
  assert.ok(samples.every(x => x >= NOD_MIN_INTENSITY && x <= 1));
  assert.ok(samples.some(x => x === 1) && samples.some(x => x < 1));
});
