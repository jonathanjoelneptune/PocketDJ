import assert from "node:assert/strict";
import { test } from "node:test";
import { PlaybackBeatClock, createBeatEvents, nextBeatEvent } from "../src/dj/beatClock.ts";

const base = (partial = {}) => ({
  source: "spotify",
  isAuthenticated: true,
  isPlaying: true,
  trackId: "test-track",
  title: "Test",
  artist: "Test",
  album: "",
  albumArtUrl: null,
  progressMs: 30_000,
  durationMs: 180_000,
  updatedAt: 100_000,
  ...partial,
});

test("song-relative progress advances smoothly between Spotify polls", () => {
  const clock = new PlaybackBeatClock();
  const initial = clock.read(base(), 120, "getsongbpm", null, 100_000);
  assert.equal(initial.trackProgressMs, 30_000);
  const inBetween = clock.read(base(), 120, "getsongbpm", null, 100_400);
  assert.equal(inBetween.trackProgressMs, 30_400);
  const newPoll = clock.read(base({ progressMs: 32_520, updatedAt: 102_500 }), 120, "getsongbpm", null, 102_500);
  assert.ok(Math.abs(newPoll.trackProgressMs - 32_500) < 25);
  assert.equal(newPoll.discontinuity, initial.discontinuity, "small polling jitter must not reset the groove");
});

test("large progress jumps, new tracks, and pause/resume reset the beat clock", () => {
  const clock = new PlaybackBeatClock();
  const initial = clock.read(base(), 120, "spotify", null, 100_000);
  const seek = clock.read(base({ progressMs: 60_000, updatedAt: 101_000 }), 120, "spotify", null, 101_000);
  assert.ok(seek.discontinuity > initial.discontinuity);
  assert.equal(seek.trackProgressMs, 60_000);
  const nextTrack = clock.read(base({ trackId: "next", updatedAt: 102_000, progressMs: 500 }), 120, "spotify", null, 102_000);
  assert.ok(nextTrack.discontinuity > seek.discontinuity);
  assert.equal(clock.read(base({ isPlaying: false }), 120, "spotify", null, 102_010), null);
  const resumed = clock.read(base({ trackId: "next", updatedAt: 103_000, progressMs: 1_500 }), 120, "spotify", null, 103_000);
  assert.ok(resumed.discontinuity > nextTrack.discontinuity);
});

test("a Spotify beat map supplies precise onset positions and the preferred tempo", () => {
  const clock = new PlaybackBeatClock();
  const metadata = {
    tempoBpm: 120,
    beatOffsetMs: 100,
    beatTimesMs: [100, 605, 1107, 1609, 2104, 2600],
    source: "spotify-analysis",
  };
  const timing = clock.read(base({ progressMs: 750 }), 91, "estimate", metadata, 100_000);
  assert.equal(timing.bpm, 120);
  assert.equal(timing.phaseSource, "beat-map");
  assert.equal(nextBeatEvent(timing, 1, 850, 42, createBeatEvents(timing.beatTimesMs, 1)), 1107);
  const half = createBeatEvents(timing.beatTimesMs, 0.5);
  assert.deepEqual(half, [100, 1107, 2104]);
  assert.equal(nextBeatEvent(timing, 0.5, 800, 42, half), 1107);
  const double = createBeatEvents(timing.beatTimesMs, 2);
  assert.equal(double.length, 11);
  assert.equal(double[1], 352.5);
  assert.equal(nextBeatEvent(timing, 2, 600, 42, double), 605);
});

test("without a beat map, song-position BPM grid stays deterministic", () => {
  const clock = new PlaybackBeatClock();
  const timing = clock.read(base({ progressMs: 1_200 }), 120, "getsongbpm", null, 100_000);
  assert.equal(timing.phaseSource, "tempo-grid");
  assert.equal(nextBeatEvent(timing, 1, 1_210), 1_500);
  assert.equal(nextBeatEvent(timing, 0.5, 1_210), 2_000);
  assert.equal(nextBeatEvent(timing, 2, 1_210), 1_250);
  assert.equal(nextBeatEvent(timing, 1, 1_510), 1_500, "small late RAF may still land the preceding beat");
});

test("playback progress never exceeds the actual track duration", () => {
  const clock = new PlaybackBeatClock();
  const timing = clock.read(base({ progressMs: 179_900 }), 120, "spotify", null, 100_500);
  assert.equal(timing.trackProgressMs, 180_000);
});
