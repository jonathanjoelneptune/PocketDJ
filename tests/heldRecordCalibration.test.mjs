import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HELD_RECORD_FRAMES,
  HELD_RECORD_SPRITE,
  getHeldRecordPlacement,
  projectQuad,
} from "../src/dj/heldRecordCalibration.ts";

test("the approved v2 source dimensions and all 12 frame calibrations are preserved", () => {
  assert.deepEqual(HELD_RECORD_SPRITE, { width: 582, height: 652 });
  assert.equal(Object.keys(HELD_RECORD_FRAMES).length, 12);
  const expected = [
    ["right:a41.png", 288, 296, 108, true],
    ["right:a11.png", 397, 233, 114, true],
    ["right:a12.png", 418, 193, 114, true],
    ["right:a11-2.png", 427.9, 391.9, 84, true],
    ["right:a13-2.png", 461, 374, 76, false],
    ["right:a10.png", 170, 399, 75, false],
    ["left:a41.png", 286, 294, 112, true],
    ["left:a11m.png", 194, 229, 104, true],
    ["left:a12m.png", 169, 190, 118, true],
    ["left:a11-2m.png", 163, 393.9, 74, true],
    ["left:a13.png", 171, 399, 76, false],
    ["left:a10.png", 170, 399, 75, false],
  ];
  for (const [key, x, y, size, visible] of expected) {
    const p = HELD_RECORD_FRAMES[key];
    assert.ok(p, `missing approved ${key}`);
    assert.deepEqual([p.x,p.y,p.size,p.visible], [x,y,size,visible]);
  }
});

test("only the calibrated poses display held artwork, with separate A41 positions", () => {
  assert.equal(getHeldRecordPlacement("right", "a41.png")?.x, 288);
  assert.equal(getHeldRecordPlacement("left", "a41.png")?.x, 286);
  assert.equal(getHeldRecordPlacement("right", "a11m.png"), null);
  assert.equal(getHeldRecordPlacement("left", "a11.png"), null);
  assert.equal(getHeldRecordPlacement("right", "a10.png")?.visible, false);
  assert.equal(getHeldRecordPlacement("left", "a13.png")?.visible, false);
  assert.equal(getHeldRecordPlacement("right", "i1.png"), null);
});

test("both placing-frame warps retain independently calibrated TL/TR/BR/BL corners", () => {
  assert.deepEqual(getHeldRecordPlacement("right","a11-2.png")?.warp?.corners, [
    [369.7,374.7], [464.7,371.2], [497.5,410.2], [379.7,411.6],
  ]);
  assert.deepEqual(getHeldRecordPlacement("left","a11-2m.png")?.warp?.corners, [
    [112.6,372.7], [229.2,373.7], [213.3,418.5], [96.7,410.6],
  ]);
});

test("projective mapping exactly reaches the approved quadrilateral vertices", () => {
  for (const key of ["right:a11-2.png", "left:a11-2m.png"]) {
    const quad = HELD_RECORD_FRAMES[key].warp.corners;
    const inputs = [[0,0],[1,0],[1,1],[0,1]];
    for(let i=0;i<4;i++) {
      const [u,v] = inputs[i];
      const p = projectQuad(quad, u, v);
      assert.ok(Math.abs(p.x - quad[i][0]) < 1e-6, `${key} corner ${i} x`);
      assert.ok(Math.abs(p.y - quad[i][1]) < 1e-6, `${key} corner ${i} y`);
    }
    const center = projectQuad(quad, 0.5, 0.5);
    assert.ok(center.x >= Math.min(...quad.map(p=>p[0])) && center.x <= Math.max(...quad.map(p=>p[0])));
    assert.ok(center.y >= Math.min(...quad.map(p=>p[1])) && center.y <= Math.max(...quad.map(p=>p[1])));
  }
});
