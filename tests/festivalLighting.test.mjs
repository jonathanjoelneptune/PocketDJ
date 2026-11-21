import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getFestivalLighting } from "../src/scenes/festivalLighting.ts";

test("the noon environment contains natural daylight without artificial lighting", () => {
  const noon = getFestivalLighting(12);
  assert.equal(noon.ambientStrength,0);
  assert.equal(noon.stars,0);
  assert.equal(noon.windows,0);
  assert.equal(noon.mountains,1);
  assert.equal(noon.canopy,1);
  assert.equal(noon.floor,1);
  assert.ok(noon.sun > .95);
});
test("nighttime is dark but stage lights and city windows are illuminated", () => {
  const night = getFestivalLighting(23);
  assert.ok(night.stars > .95);
  assert.equal(night.sun,0);
  assert.ok(night.practicals >= .95);
  assert.ok(night.windows >= .9);
  assert.ok(night.floor < .5);
  assert.ok(night.canopy < .5);
});
test("sunrise and sunset each produce distinct warm lighting states", () => {
  const rise = getFestivalLighting(7);
  const set = getFestivalLighting(18);
  assert.ok(rise.sun > 0 && set.sun > 0);
  assert.equal(rise.stars,0);
  assert.ok(set.practicals > rise.practicals);
  assert.ok(set.windows > rise.windows);
  assert.ok(rise.floor > set.floor);
  assert.notEqual(rise.horizon,set.horizon);
});
test("environment is continuous, clamped, and safe for bad clock values", () => {
  for (let hour=0;hour<24;hour+=.25) {
    const a=getFestivalLighting(hour),b=getFestivalLighting(hour+.01);
    assert.ok(Math.abs(a.floor-b.floor)<.03,hour+" material jump");
    assert.ok(Math.abs(a.practicals-b.practicals)<.03,hour+" lamp jump");
    assert.ok(Math.abs(a.sunX-b.sunX)<.15,hour+" sun teleport");
    assert.ok(a.stars>=0 && a.stars<=1);
  }
  assert.equal(getFestivalLighting(-10).top,getFestivalLighting(0).top);
  assert.equal(getFestivalLighting(50).top,getFestivalLighting(24).top);
  assert.equal(getFestivalLighting(NaN).top,getFestivalLighting(12).top);
  assert.equal(getFestivalLighting(0).top,getFestivalLighting(24).top);
});
test("environment assets are separate SVG objects with genuine transparent backgrounds", () => {
  const assets=["mountains.svg","city.svg","trees.svg","canopy.svg","stage-floor.svg","city-lights.svg","practical-lights.svg"];
  for(const name of assets){
    const svg=readFileSync(new URL("../public/assets/scenes/festival-environment/"+name,import.meta.url),"utf8");
    assert.match(svg,/^<svg /,name);
    assert.match(svg,/viewBox="0 0 1764 992"/,name);
    assert.doesNotMatch(svg,/data:image|<image\b|<rect[^>]+width="1764"[^>]+height="992"[^>]+fill="#[0-9a-f]{6}"/i,name);
  }
});
