import assert from "node:assert/strict";
import { test } from "node:test";
import { speakerBeatPhase, speakerPulseEnvelope, speakerPulseScale } from "../src/dj/speakerPulse.ts";

const timing = (progress, extras = {}) => ({
  trackKey: "spotify:track",
  trackProgressMs: progress,
  bpm: 120,
  beatOffsetMs: 0,
  beatTimesMs: null,
  phaseSource: "tempo-grid",
  tempoSource: "getsongbpm",
  discontinuity: 1,
  ...extras,
});

test("BPM grid yields exactly one complete driver pulse per beat", () => {
  assert.equal(speakerBeatPhase(timing(0)), 0);
  assert.equal(speakerBeatPhase(timing(250)), 0.5);
  assert.equal(speakerBeatPhase(timing(500)), 0);
  assert.equal(speakerBeatPhase(timing(1_000)), 0);
  assert.equal(speakerBeatPhase(timing(1_250)), 0.5);
  assert.ok(Math.abs(speakerBeatPhase(timing(100, { bpm: 60 })) - 0.1) < 1e-10);
  assert.equal(speakerBeatPhase(timing(1_000, { bpm: 60 })), 0);
});

test("Spotify beat maps follow actual beat timestamps, not an average BPM", () => {
  const opts = {
    phaseSource: "beat-map",
    beatOffsetMs: 100,
    beatTimesMs: [100, 615, 1_115, 1_625],
  };
  assert.equal(speakerBeatPhase(timing(100, opts)), 0);
  assert.equal(speakerBeatPhase(timing(615, opts)), 0);
  assert.equal(speakerBeatPhase(timing(865, opts)), 0.5);
  assert.ok(Math.abs(speakerBeatPhase(timing(1_370, opts)) - 0.5) < 1e-9);
  assert.equal(speakerBeatPhase(timing(1_625, opts)), 0);
  assert.equal(speakerBeatPhase(timing(2_125, opts)), 0);
  assert.equal(speakerBeatPhase(timing(0, opts)), 0.8);
});

test("speaker pulse peaks on each beat and rests between them", () => {
  const value = (ms, intensity = 1) => speakerPulseScale(timing(ms), intensity);
  assert.ok(Math.abs(value(0) - 1.12) < 1e-9);
  assert.ok(Math.abs(value(500) - 1.12) < 1e-9);
  assert.ok(Math.abs(value(250) - 0.965) < 1e-9);
  assert.ok(Math.abs(value(425) - 0.965) < 1e-9);
  assert.ok(value(475) > value(425), "driver starts moving in anticipation of a beat");
  assert.ok(value(50) < value(0), "driver recoils after the beat");
  assert.ok(value(0, 0.5) < value(0, 1), "existing pulse amount still controls strength");
});

test("no midway second driver bump, including half/double-time DJ phrases", () => {
  assert.equal(speakerPulseEnvelope(0.5), 0);
  assert.equal(speakerPulseEnvelope(0.7), 0);
  assert.equal(speakerPulseEnvelope(0.8), 0);
  assert.equal(speakerBeatPhase(timing(750)), 0.5);
  assert.equal(speakerBeatPhase(timing(1_000)), 0);
});
