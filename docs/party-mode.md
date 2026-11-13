# PocketDJ Party Mode (Canvas 2D Easter egg)

## Usage

Triple-tap **either physical wall light** to enable Auto instantly, without opening a selector. Triple-tap again to turn Party Mode off. The invisible enlarged tap targets follow the bars' existing X/Y and size settings and do not prevent native Spotify swipe gestures. The Room menu also offers **Off / Auto / Concert Lights / Disco Fever / Laser Show / Atmospheric Haze**, plus a saved intensity slider and Off control.

## Architecture

- A single transparent `roomPartyCanvas` lives inside the room coordinate system, above speakers/DJ at local z75 and below the existing dimmer, controls, marquee and ceiling lyrics.
- `src/partyMode.ts` renders only when Party Mode is on or fading to rest, at a maximum of ~18 frames per second on touch devices (~29 desktop). It is called from the **existing** main rendering tick: no new RAF or timers.
- Performance controls cap canvas DPR and dimensions, use local Canvas 2D primitives only, and never apply large-area CSS blur, CSS masks, CSS mix-blend or GPU filters.
- Album colors come directly from the *already interpolated* primary/secondary colors used by physical wall lights, so the same five-second track crossfade applies.
- BPM uses the existing speaker tempo lookup/estimate. The current normalized Spotify playback model has no genre field: Auto prefers genre hints in the track/artist/album text, then BPM bands and a stable track hash. It does **not** make a new API call or claim genre classification certainty.
- Only **one** effect type renders at a time. On track change, the old effect fades down and rests briefly before the chosen new effect fades in. Pausing and inferred DJ speech make the effect fade quietly to rest; playback resumes the current selection.
- The two physical wall-light **internal highlights** breathe slightly faster while Party Mode is active. Their baseline brightness, color gradients, glow strength, asynchronous flicker, and placement do not change.
- Saved settings live at `pocketdj-party-mode-v1`, starting Off at intensity .72. Triple-tapping from Off always starts Auto; manual selections are in the Room menu.

## Visual presets

- **Concert Lights**: several feathered translucent color beams sweeping from beyond scene corners
- **Disco Fever**: drifting rotating color reflections and occasional soft halos
- **Laser Show**: thin slow fan lasers from beyond the scene sides, with a soft outer trace
- **Atmospheric Haze**: translucent low-floor colored cloud gradients

No harsh strobes or rapid screen-wide flashes. Native prefers-reduced-motion disables the visible overlay.

## Test plan

1. Triple-tap both left and right fixtures on Android. Confirm a single triple-tap enables Auto and a second turns Off without blocking Spotify carousel swipes; keyboard Enter activates the accessible button.
2. Set each manual effect in Room; confirm that exactly one preset renders and menu state survives a reload. Off draws nothing and uses no effect layer.
3. Auto: test different songs and BPMs, including missing genre data. Confirm stable deterministic selection within a track.
4. Play/pause and Spotify AI DJ speech: effects fade to a quiet resting state, without harsh flashes. Song changes fade out before swapping effects; colors follow the established five-second interpolation.
5. Verify portrait phone, portrait tablet, landscape tablet, normal desktop, enlarged ceiling reveal, window contrast and saved wall light geometry.
6. Verify reduced motion, speaker assets, room shaders, album artwork, zero console errors, and **no reintroduction of Android WebView flashing**.
