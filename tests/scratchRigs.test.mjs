import assert from 'node:assert/strict';
import test from 'node:test';
import { scratchMotionAt, SCRATCH_FAMILIES, validateScratchRig } from '../src/dj/scratchRig.ts';

const states = [
  { x: 0, y: 0, tilt: 0 },
  { x: 10, y: 6, tilt: 5 },
  { x: -8, y: 8, tilt: -4 },
  { x: 4, y: -3, tilt: 2 },
];
const rig = { schema: 'pocketdj-scratch-rig.v1', family: 'a44',
  sourceCanvas: { width: 582, height: 652 },
  pivots: { left: { x: 220, y: 200 }, right: { x: 380, y: 200 } },
  scratchFrames: { left: states, right: states },
};

test('all six scratching families have expected legacy variants', () => {
  assert.equal(Object.keys(SCRATCH_FAMILIES).length, 6);
  assert.equal(SCRATCH_FAMILIES.a10.length, 2);
  assert.equal(SCRATCH_FAMILIES.a44.length, 3);
});

test('rig validation rejects malformed and missing arm states', () => {
  assert.ok(validateScratchRig(rig, 'a44'));
  assert.ok(!validateScratchRig(rig, 'a10'));
  assert.ok(!validateScratchRig({ ...rig, scratchFrames: { ...rig.scratchFrames, right: [] } }, 'a44'));
});

test('scratch poses arrive on beats, transition without dissolves', () => {
  const at = t => scratchMotionAt(rig, t, 120);
  assert.equal(at(0).left.x, 0);
  assert.equal(at(200).left.x, 0);
  assert.ok(at(400).left.x > 0 && at(400).left.x < 10);
  assert.equal(at(500).left.x, 10);
  assert.equal(at(1000).left.x, 0);
  assert.equal(at(1500).left.x, -8);
  assert.equal(at(2500).left.x, 4);
  assert.equal(at(3000).left.x, 0);
});

test('repeated samples and seeking remain deterministic', () => {
  assert.deepEqual(scratchMotionAt(rig, 789, 110), scratchMotionAt(rig, 789, 110));
  const withOffset = scratchMotionAt(rig, 600, 120, 100);
  assert.equal(withOffset.left.x, 10);
});

test('real beat-map phase tracks measured beats', () => {
  const beats = [100, 600, 1100, 1600, 2100, 2600, 3100];
  assert.equal(scratchMotionAt(rig, 600, 120, 0, beats).left.x, 10);
  assert.ok(scratchMotionAt(rig, 550, 120, 0, beats).left.x > 0);
});