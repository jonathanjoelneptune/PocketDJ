import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../public/assets/DJ NES Pose Library/Head Bob lab/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('vibe_rigs.json', root), 'utf8'));
const expected = ['i10', 'i11', 'i12', 'a36', 'a37', 'a38'];
const source = readFileSync(new URL('../src/dj/djController.ts', import.meta.url), 'utf8');
const headSource = readFileSync(new URL('../src/dj/headBobController.ts', import.meta.url), 'utf8');

test('all six calibrated vibe poses regenerate standard aligned rig assets', () => {
  assert.deepEqual(Object.keys(manifest.poses), expected);
  for (const family of expected) {
    const rig = JSON.parse(readFileSync(new URL(family + '/head_bob_rig.json', root), 'utf8'));
    assert.equal(rig.family, family);
    assert.deepEqual(rig.variants, [family + '.png']);
    assert.deepEqual(rig.sourceCanvas, { width: 582, height: 652 });
    assert.equal(rig.poseCategory, 'vibe');
    assert.deepEqual(rig.headBobFrames, manifest.headBobFrames);
    assert.deepEqual(rig.rotationPivot, { x: 295, y: 216 });
    assert.equal(rig.headPolygon.length, 21);
    for (const name of [family + '_head_shared.png', family + '_body.png']) {
      const path = new URL(family + '/' + name, root);
      assert.ok(existsSync(path), path.href);
      const header = readFileSync(path).subarray(0, 24);
      assert.equal(header.readUInt32BE(16), 582);
      assert.equal(header.readUInt32BE(20), 652);
    }
  }
});
test('I10 keeps custom mask and all 79 painted neck repair pixels', () => {
  const rig = JSON.parse(readFileSync(new URL('i10/head_bob_rig.json', root), 'utf8'));
  assert.deepEqual(rig.headPolygon, manifest.poses.i10.headPolygon);
  assert.equal(rig.bodyRepairPixels.length, 79);
  assert.deepEqual(rig.bodyRepairPixels[0], [65427, [59,69,59,255]]);
  assert.deepEqual(rig.bodyRepairPixels.at(-1), [75320, [59,69,59,255]]);
});
test('A36 remains reference-only while five vibe poses enter active beat-driven pools', () => {
  assert.equal(manifest.poses.a36.runtimeRole, 'reference');
  assert.equal((source.match(/makeLoop\("vibe-/g) || []).length, 5);
  assert.ok(!source.includes('makeLoop("vibe-a36"'));
  assert.ok(source.includes('return activeLoops;'));
  assert.ok(source.includes('(this.currentLoop.kind === "quick" || this.currentLoop.kind === "vibe")'));
  for (const family of expected.filter(name => name !== 'a36')) {
    assert.ok(headSource.includes(family + ": ['" + family + ".png']"));
  }
});
