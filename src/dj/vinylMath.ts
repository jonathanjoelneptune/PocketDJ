/** Pure deck-selection and transport math, shared by desktop, web, Android. */
export type DeckSide = "left" | "right";
export const DECK_CALIBRATION = Object.freeze({
  left: Object.freeze({ x: 170, y: 399, rx: 55, ry: 28 }),
  right: Object.freeze({ x: 425, y: 397, rx: 55, ry: 28 }),
});
export const VINYL_RPM = 16.2;

export type DeckTrack = {
  source: string;
  trackId: string | null;
  albumArtUrl: string | null;
};
export type DeckChange = { side: DeckSide; trackKey: string; coverUrl: string | null };

/** Alternates only on real track changes, never on pause/seek/polls/speech. */
export class DeckAssignment {
  private previousKey: string | null = null;
  private next: DeckSide = "right";
  private readonly lastByDeck: Record<DeckSide, string | null> = { left: null, right: null };

  accept(track: DeckTrack): DeckChange | null {
    if (!track.trackId || track.source === "none") return null;
    const key = `${track.source}:${track.trackId}`;
    if (key === this.previousKey) return null;
    this.previousKey = key;
    const side = this.next;
    this.next = side === "left" ? "right" : "left";
    this.lastByDeck[side] = key;
    return { side, trackKey: key, coverUrl: track.albumArtUrl };
  }

  current(side: DeckSide): string | null {
    return this.lastByDeck[side];
  }
}

export function stepVinylAngle(currentRadians: number, elapsedMs: number, playing: boolean, rpm = VINYL_RPM): number {
  if (!playing || !Number.isFinite(elapsedMs) || elapsedMs <= 0 || !Number.isFinite(rpm) || rpm <= 0) {
    return currentRadians;
  }
  const delta = (elapsedMs * rpm * Math.PI * 2) / 60_000;
  return ((currentRadians + delta) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
}
