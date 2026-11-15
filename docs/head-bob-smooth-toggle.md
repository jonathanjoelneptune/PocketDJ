# Head Nods: smooth motion and default-off utility

## Controls

Open **Room → DJ Animation → Enable head nods**.

- Default is **Off** for both first-time and existing users.
- The user's explicit choice persists in localStorage under `pocketdj-head-nods-enabled-v1`.
- Turning Off restores the original full-frame sprite immediately.
- Enabling nods starts the independent compositor only during regular music-playing scratch loops.
- No head bobbing during a record-change cinematic, pending album-art reveal, Spotify DJ speech, idle, paused, or manual audition.

## Motion

The four approved head poses and all six unbiased two-pose pairings are unchanged. Each new rhythmic step begins a **time-based ease-in/ease-out** transition in the head's X, Y, and tilt parameters, rendered through the existing animation frame loop. The head moves for ~35% of the interval and settles for the remainder. Minimum/maximum transition durations are clamped to 90/280 ms to keep subtle movements legible.

This avoids snapping between the endpoints without creating hundreds of new PNGs. The head image itself remains the exact shared PNG exported by the Head Bob Lab utility. Canvas remains at 582 × 652 pixels; drawing disables image smoothing.

## Manual regression checks

1. With no stored preference, load PocketDJ and verify **Enable head nods** is unchecked. Watch several scratch loops; only the original sprites should appear.
2. Play music and turn it On. Watch all six scratch families, including different `-2/-3` hand frames. The head should glide separately, with occasional longer phrases.
3. Toggle Off while the head is moving. The full original PNG must immediately return, with no blank frame or residual floating head.
4. Toggle On again; movement should restart from a neutral position. Reload; the last explicit choice should persist.
5. Pause, play, change tracks, and trigger Spotify DJ speech. Head nodding must suspend, without interrupting existing hand, speaking, or record-change animations.
6. Try both desktop and Android layouts, varying tempo and switching playlists. Confirm no regression in decoding, room drawing, or carousel behavior.

## Implementation

- `src/dj/headBobController.ts`: eased transform interpolation.
- `src/dj/djController.ts`: default-off runtime gate.
- `src/main.ts`: persistent setting and UI binding.
- `src/ui.ts`: Room-tab utility checkbox.

There are **no changes** to approved head-bob rigs, generated PNGs, or normal scratch frame timing.
