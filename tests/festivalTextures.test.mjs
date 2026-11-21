import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Generates deterministic assets before the Vite build and verifies the actual
// PNG files rather than just trusting references in the scene markup.
test("festival detail textures generate as aligned transparent 1764x992 RGBA PNGs", () => {
  const run = spawnSync("python", ["scripts/build_festival_textures.py"], { encoding:"utf8", timeout:45000 });
  assert.equal(run.status,0,(run.stderr || run.stdout || "Python texture generator failed").slice(-2000));
  const filenames=["trees-detail.png","mountains-detail.png","stage-floor-detail.png","canopy-detail.png","city-detail.png"];
  for(const name of filenames) {
    const path=join("public","assets","scenes","festival-textures",name);
    assert.ok(existsSync(path),name);
    const file=readFileSync(path);
    assert.deepEqual(file.subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]),name+" PNG header");
    assert.equal(file.readUInt32BE(16),1764,name+" width");
    assert.equal(file.readUInt32BE(20),992,name+" height");
    assert.equal(file[25],6,name+" RGBA color type");
    assert.ok(statSync(path).size>4000,name+" seems empty");
  }
});
