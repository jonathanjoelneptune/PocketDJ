import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ScratchGrooveController, scratchPositionForFrame,
  SCRATCH_FAMILIES, validateScratchRig, normalizeScratchRig,
} from '../src/dj/scratchRig.ts';

const states = [
  { x: 0, y: 0, tilt: 0 },
  { x: 10, y: 6, tilt: 5 },
  { x: -8, y: 8, tilt: -4 },
  { x: 4, y: -3, tilt: 2 },
];
const rig = {
  schema: 'pocketdj-scratch-rig.v1', family: 'a44',
  sourceCanvas: { width: 582, height: 652 },
  pivots: { left: { x: 220, y: 200 }, right: { x: 380, y: 200 } },
  scratchFrames: { left: states, right: states },
};
const rng = () => 0.5;

test('all six scratching families retain their legacy frame scheduler', () => {
  assert.equal(Object.keys(SCRATCH_FAMILIES).length, 6);
  assert.equal(SCRATCH_FAMILIES.a10.length, 2);
  assert.equal(SCRATCH_FAMILIES.a44.length, 3);
});

test('rig validation rejects malformed or missing arm states', () => {
  assert.ok(validateScratchRig(rig, 'a44'));
  assert.ok(!validateScratchRig(rig, 'a10'));
  assert.ok(!validateScratchRig({ ...rig, scratchFrames: { ...rig.scratchFrames, right: [] } }, 'a44'));
});

test('arms remain at rest across beats until the organic scheduler changes frames', () => {
  const groove = new ScratchGrooveController(rng);
  assert.equal(groove.update(rig, 'a44.png', 100, 350).left.x, 0);
  assert.equal(groove.update(rig, 'a44.png', 600, 350).left.x, 0);
  assert.equal(groove.update(rig, 'a44.png', 1200, 350).left.x, 0);
  assert.equal(groove.update(rig, 'a44.png', 1700, 350).moving, false);
});

test('frame changes produce smooth gestures at arbitrary offbeat times', () => {
  const groove = new ScratchGrooveController(rng);
  groove.update(rig, 'a44.png', 0, 350);
  assert.equal(groove.update(rig, 'a44-2.png', 873, 360).left.x, 0);
  const mid = groove.update(rig, 'a44-2.png', 973, 260);
  assert.ok(mid.left.x > 0 && mid.left.x < 10);
  assert.ok(mid.moving);
  const settled = groove.update(rig, 'a44-2.png', 1100, 0);
  assert.equal(settled.left.x, 10);
  assert.equal(settled.moving, false);
  assert.equal(groove.update(rig, 'a44-2.png', 1550, 0).left.x, 10);
});

test('organic two- and three-frame patterns select calibrated poses with occasional accents', () => {
  assert.equal(scratchPositionForFrame('a44', 'a44.png', rng), 0);
  assert.equal(scratchPositionForFrame('a44', 'a44-2.png', rng), 1);
  assert.equal(scratchPositionForFrame('a44', 'a44-3.png', rng), 2);
  assert.equal(scratchPositionForFrame('a44', 'a44-2.png', () => 0.01), 3);
  assert.equal(scratchPositionForFrame('a10', 'a10-2.png', () => 0.5), 1);
  assert.equal(scratchPositionForFrame('a10', 'a10-2.png', () => 0.85), 2);
  assert.equal(scratchPositionForFrame('a10', 'a10-2.png', () => 0.98), 3);
});

test('interrupting a scratch starts the next glide from the current arm position', () => {
  const groove = new ScratchGrooveController(rng);
  groove.update(rig, 'a44.png', 0, 350);
  groove.update(rig, 'a44-2.png', 1000, 400);
  const interrupted = groove.update(rig, 'a44-2.png', 1100, 300);
  assert.ok(interrupted.left.x > 0 && interrupted.left.x < 10);
  const startReturn = groove.update(rig, 'a44.png', 1100, 400);
  assert.ok(Math.abs(startReturn.left.x - interrupted.left.x) < 1e-8);
  const returnMotion = groove.update(rig, 'a44.png', 1200, 300);
  assert.ok(returnMotion.left.x > 0 && returnMotion.left.x < interrupted.left.x);
  assert.equal(groove.update(rig, 'a44.png', 1400, 100).left.x, 0);
});

test('controller reset returns to rest and holds without generating beat-driven motion', () => {
  const groove = new ScratchGrooveController(rng);
  groove.update(rig, 'a44.png', 0, 300);
  groove.update(rig, 'a44-3.png', 400, 300);
  assert.equal(groove.update(rig, 'a44-3.png', 900, 0).left.x, -8);
  groove.reset();
  assert.equal(groove.update(rig, 'a44.png', 1000, 400).left.x, 0);
  assert.equal(groove.update(rig, 'a44.png', 1400, 400).left.x, 0);
});

test('accepts the exported Scratch Rig Studio format preserving all four exact arm poses', () => {
 const artist = {
  schema: 'pocketdj-scratch-rig.v1',
  family: 'a44', sourceCanvas: { width: 582, height: 652 },
  arms: {
   left: {pivot:{x:225,y:211},handAnchor:{x:165,y:374},
    states:[{x:0,y:0,tilt:0},{x:0,y:0,tilt:0},{x:-1,y:10,tilt:-3},{x:2,y:4,tilt:2}]},
   right: {pivot:{x:371,y:211},handAnchor:{x:439,y:373},
    states:[{x:0,y:0,tilt:0},{x:9,y:12,tilt:4},{x:0,y:0,tilt:0},{x:5,y:7,tilt:2}]},
  },
 };
 const converted = normalizeScratchRig(artist, 'a44');
 assert.ok(converted);
 assert.deepEqual(converted.scratchFrames.left, artist.arms.left.states);
 assert.deepEqual(converted.scratchFrames.right, artist.arms.right.states);
 assert.deepEqual(converted.handAnchors.right, {x:439,y:373});
 assert.deepEqual(converted.pivots.left, {x:225,y:211});
 assert.equal(normalizeScratchRig(artist, 'a14'),null);
 assert.ok(validateScratchRig(converted,'a44'));
});
