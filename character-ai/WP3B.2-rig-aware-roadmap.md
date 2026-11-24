# WP3B.2 — Rig-aware character generation

## Objective
Preserve the original equipment, native 582 × 652 coordinate system, timing and calibrated motion transforms while allowing character-specific alpha geometry. Strict reskin remains the supported baseline. Adaptive output is experimental and must not enter a production character pack until qualified.

## WP3B.2A — Character-audited registration (implemented in v0.8)
Compare identity and 50%, 75%, 100% equipment corrections. Reject regressions in overall coverage and excessive degradation in IoU, contact and individual regions. Retain raw placement when no correction improves the weighted score. Regression fixture: Goldie v0.7.2, where equipment alignment reduced character coverage from 74.9% to 73.3%.

## WP3B.2D/E — Adaptive polygon editor and extraction (prototype in v0.8)
Use separate locally stored per-family, per-candidate polygons. Seed from original rig geometry; allow vertex dragging, edge insertion and multiple disconnected polygons. Assign each accepted foreground pixel to at most one layer. Do not expand to the old alpha silhouette or fill missing pixels with original character art. Render with original equipment, original pivots and calibrated motion. Export diagnostic PNG layers and manifest; export comparison GIF inside ZIP.
Acceptance for next iteration: Goldie can be assembled without hoodie-shaped skin artifacts; layer ownership is visually correct; original equipment remains unchanged; placement and polygon changes survive reload. Acknowledge limitations: current scene extraction still restricts overlap with equipment to the original selected contact area; it may leave residue or remove valid new hand pixels. Polygons do not yet create hidden underlap art. Original pivots are fixed; movable anatomical landmarks are pending.

## WP3B.2B — Configurable image models and input fidelity (planned)
Expose only server-validated model/fidelity choices supported by the configured provider. Maintain existing PNG contract, authentication and art standard. Benchmark the same source, prompt and mask against available models; record model, cost, generation dimensions and geometry metrics. No automatic paid retries.

## WP3B.2C — Context-aware regional generation (planned)
Crop original assembled artwork around a target region with overlap context. Record reversible native-to-crop mapping. Send pose authority plus separate identity reference and edit mask; map generated pixels back into native coordinates. Preserve surrounding layers and equipment. Begin with one A44 arm; no multi-pose batch until the regional workflow is validated.

## WP3B.2D follow-on — Anatomical anchors (planned)
Add source/target shoulder, elbow, wrist, head and contact landmarks with editable handles; keep canonical equipment and motion transforms immutable. Qualify character-specific rest placement and any anchor mapping across motion states; do not assume shared pivots alone guarantee contact.

## WP3B.2F — Adaptive hidden artwork and qualification (planned)
Create explicit shoulder and neck underlap repairs, rear-hair ownership and optional additional hair layer only if needed. Verify contact, seams, ownership, equipment preservation and absence of original-character leakage through all 64 calibrated combinations. Separate diagnostic and qualified exports. Production integration remains gated behind demonstrated A44 motion and a second family.

## Test order
1. Existing Goldie candidate, no paid generation.
2. Compare raw, audited and equipment-anchor placement; adjust polygons and inspect synchronized motion.
3. Export comparison ZIP and diagnostic layer ZIP for review.
4. Fix extraction/ownership and hidden seams, then test regional generation and model options as needed.
5. Qualify A44 and a second family before WP3C multi-pose scale-up.

## Scope guard
No runtime asset changes, provider credential changes, paid generation, or new character pack format in v0.8. Strict reskin remains unchanged except for the safer scene-registration selection.
