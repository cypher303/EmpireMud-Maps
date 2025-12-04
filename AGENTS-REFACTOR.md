Refactor Plan (single-globe displacement only)

Goals
- Make elevation visibly affect lighting/shadows.
- Stay data-driven from php/map.php + map.txt.

Work chunks
1) Assets
- Regenerate terrain-map.json + water-chars.json (tools/extract-terrain.mjs).
- Fetch/vendor canonical map.txt (tools/fetch-map.mjs); note dimensions and water/land ratios.
- Note key defaults: DEFAULT_WATER_CHAR, DISPLACEMENT_SCALE, POLE_PADDING_FACTOR.

2) Heights
- Map terrain descriptions to a richer 0–1 height range (water=0, plains low, hills mid, mountains high, peaks max) driven by terrain-map.json.
- Expose a global height gain for quick visibility checks.

3) Textures
- Prefer RepeatWrapping when dimensions allow; decide on padding/resampling if not power-of-two.
- Consider small tile scaling (e.g., 2×) if aliasing is an issue.
- Keep color/height generation in one pass with easy tuning.

4) Geometry/material
- Raise sphere segment count (or add higher-res displacement mesh).
- Retune displacementScale after height spread improves.
- Keep a single MeshStandardMaterial.

5) Debug/QA
- Add a debug height view or exaggeration toggle.
- Log key stats (map dims, min/max heights, water/land ratios).
- Manual checks: mountain visibility, pole padding continuity, seams.

6) Notes
- Keep the overlay path retired; don’t reintroduce secondary spheres.
- Update README/notes with tuning knobs and regeneration steps.
