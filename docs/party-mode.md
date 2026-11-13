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


## Party Mode V2: music-driven variation and compositor stability

- Party lighting intentionally **crosses** the physical light-bar colors. When the left wall bar is red and the right wall bar is blue, party beams originating on the left are blue and beams from the right are red. The separate Wall Bars > Swap Colors control remains respected.
- Concert beam count and width now vary continuously with tempo, phase, and the stable track seed. Fractional beam alpha prevents pop-in/out. Laser fan count and thickness vary in the same way.
- Laser sources move to the **lower floor corners** and **just beneath the marquee**, while endpoints sweep around the upper room and stage rather than originating halfway up random wall locations.
- Disco reflections are larger, brighter, and faceted, with dispersed local halos. Ambient Haze uses substantially wider and denser elliptical clouds so the fog is actually visible without a full-room lightening filter.
- While Party Mode is on and music is playing, the two physical wall-bar emitters, adjacent wall casts, and bar-local halos operate at **50% of their configured visible intensity**. All existing settings and normal paused behavior are preserved.

### Android compositor protection

The same single Canvas now remains displayed for the full lifetime of the room, including Off/paused/track-change states. It is cleared **once** after an effect fades to rest, rather than cycling display:none/block and forcing Android's GPU compositor to create/release a full-scene texture. Redraw rate is capped at ~11 FPS on coarse-pointer devices (~22 desktop), and the mobile texture is limited to roughly 920 × 700 maximum pixels with a 0.9 DPR cap. Concert beams use two translucent passes instead of four. All rendering remains inside the original Canvas, with no new DOM layers, CSS filters, animation loops, or network calls.

**Regression checklist:** Triple-tap Auto; manual Concert, Disco, Laser, Haze; color side swapping including Wall Bars > Swap; repeated song changes and Auto selection; play/pause; DJ speech; left/right lamp 50% fade; desktop/portrait Android/tablet layouts; skyline clarity, ceiling lyrics, DJ sprites, speaker cabinet rendering; no flicker/flashes of non-party scene elements after 10–15 minutes of testing on Android. Reduced motion should display no Party Mode animation.

## V3: coherent disco ball, ceiling-corner laser fans, pixel haze and smoother motion

- **Disco Fever:** all reflections share a single, slowly rotating master phase, as if cast by one invisible mirrored disco ball centered overhead. Mirror facets are laid out in stable concentric bands; their locations and small source rays rotate together. No individual wandering-dot velocities.
- **Laser Show:** top pairs are anchored to the two **bottom corners of the ceiling**, at approximately 25.5%/74.5% horizontal and 19% vertical room coordinates. Those beams travel across the **marquee and its song title** because the existing Party Canvas (z75) is already above the sign (z3). A second Canvas is unnecessary and would increase Android compositing risk. The lower laser sources remain offscreen by the floor.
- **Motion:** restore the draw cadence to ~18 FPS on touch devices (55 ms), ~29 FPS on desktop (35 ms). Keep the persistent, low-DPR texture, no canvas display toggling, stable lighting layers and no additional RAF loops.
- **Atmospheric Haze:** each colored fog plume has two subtle, moving, irregular polygon contours with short dashed/pixel-stepped edges. Outline hues are lightened versions of the same current album colors. The contours move as part of the smoke plume, not as disconnected particles.
- **Scope:** other presets, wall-light dimming, scene lighting, skyline protection, menu controls, Auto selection, song-change rest period and Spotify playback stabilization are unchanged.

### Android acceptance checklist
1. Confirm disco reflections rotate in coordinated bands from a single optical source, instead of dozens of independently moving squares.
2. Confirm upper lasers stay anchored to ceiling corners and visibly overlay the top marquee/song title. Floor rays still begin outside lower room edges.
3. Confirm haze contours are visible but restrained and do not create bright flat regions over the DJ and skyline.
4. Leave Party Mode on across several tracks for 10-15 minutes, changing modes and pausing/resuming; look for any flashing in the ceiling, speakers or DJ at ~18 FPS.
5. Compare compact Android Spotify, landscape Fold, desktop and reduced-motion preferences. Avoid regressing the stable Canvas lifetime behavior.
