/** Pure deck-selection and transport math, shared by desktop, web, Android. */
export type DeckSide = "left" | "right";
export const DECK_CALIBRATION = Object.freeze({
  left: Object.freeze({ x: 170, y: 399, rx: 55, ry: 28 }),
  right: Object.freeze({ x: 425, y: 397, rx: 55, ry: 28 }),
});
/** Visual-only adjustment. Deck centers, elliptical perspective and RPM stay calibrated. */
export const VINYL_DISC_SCALE = 1.07;
/** Artwork used to occupy just 114/139 of the rotating disc's radius.
 * Fill most of the vinyl top while keeping an ~11px source-texture rim.
 * This changes the actual spinning album, not its fixed black platter.
 */
export const VINYL_ALBUM_ART_RADIUS = 128;
export const VINYL_DISC_THICKNESS_PX = 3;
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

  /** Destination side for the next genuine track; does not advance the deck. */
  peekNextSide(): DeckSide { return this.next; }

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


/** The DJ's record-change sequence controls when a deck's album can appear.
 * pending: keep the outgoing album spinning while cover art preloads
 * active:  show the bare platter while DJ holds/places the incoming album
 * none:    restore a real spinning record after the cinematic ends
 */
export type VinylCinematicPhase = "none" | "pending" | "active";

export function shouldHideCinematicPlatter(
  phase: VinylCinematicPhase,
  incomingSide: DeckSide | null,
  deck: DeckSide,
): boolean {
  // An unfinished artwork decode can outlive the last cinematic frame.
  // Keep the platter bare until the stage is actually committed. Callers
  // provide null once placement finishes.
  return phase !== "pending" && incomingSide === deck;
}

export function canPlaceIncomingVinyl(
  phase: VinylCinematicPhase,
  artworkStillLoading: boolean,
): boolean {
  return phase === "none" && !artworkStillLoading;
}

/** A queue-predicted album can be placed while the previous song is still
 * reported as playing. Unpredicted albums require a matching playback key.
 * Either way, the record cannot appear while the DJ is still holding it.
 */
export function canReleaseStagedVinyl(
  phase: VinylCinematicPhase,
  artworkStillLoading: boolean,
  stagedTrackKey: string,
  actualTrackKey: string | null,
  preRoll: boolean,
): boolean {
  return (preRoll || stagedTrackKey === actualTrackKey) &&
    canPlaceIncomingVinyl(phase, artworkStillLoading);
}
