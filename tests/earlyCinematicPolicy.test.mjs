import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldBeginEarlyCinematic, EARLY_CINEMATIC_LEAD_MS } from '../src/dj/earlyCinematicPolicy.ts';
import { DeckAssignment } from '../src/dj/vinylMath.ts';

const current = { trackId: 'old-song', progressMs: 175_000, durationMs: 180_000, isPlaying: true };
const upcoming = { trackId: 'next-song', albumArtUrl: 'https://example.com/album.jpg' };

test('five-second record-change window requires known decoded next artwork', () => {
  assert.equal(EARLY_CINEMATIC_LEAD_MS, 5_000);
  assert.equal(shouldBeginEarlyCinematic(current, upcoming, true), true);
  assert.equal(shouldBeginEarlyCinematic({...current, progressMs: 174_999}, upcoming, true), false);
  assert.equal(shouldBeginEarlyCinematic({...current, progressMs: 179_700}, upcoming, true), false);
  assert.equal(shouldBeginEarlyCinematic(current, upcoming, false), false);
  assert.equal(shouldBeginEarlyCinematic(current, null, true), false);
  assert.equal(shouldBeginEarlyCinematic(current, { ...upcoming, albumArtUrl: null }, true), false);
  assert.equal(shouldBeginEarlyCinematic(current, { ...upcoming, trackId: 'old-song' }, true), false);
  assert.equal(shouldBeginEarlyCinematic({...current, isPlaying:false}, upcoming, true), false);
});

test('early pre-roll never consumes the next record deck assignment', () => {
  const decks = new DeckAssignment();
  assert.equal(decks.peekNextSide(), 'right');
  assert.equal(decks.accept({source:'spotify',trackId:'old-song',albumArtUrl:'old'}).side, 'right');
  assert.equal(decks.peekNextSide(), 'left');
  assert.equal(decks.peekNextSide(), 'left');
  assert.equal(decks.accept({source:'spotify',trackId:'old-song',albumArtUrl:'old'}), null);
  assert.equal(decks.accept({source:'spotify',trackId:'next-song',albumArtUrl:'next'}).side, 'left');
  assert.equal(decks.peekNextSide(), 'right');
});
