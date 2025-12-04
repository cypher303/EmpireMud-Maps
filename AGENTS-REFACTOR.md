Refactor Plan (aligned with AGENTS-CROSSROADS.md; single-globe displacement only)

Goals
- Make elevation visibly influence lighting/shadows on the single globe.
- Keep the pipeline data-driven from php/map.php + map.txt; no overlay globe path.

Work chunks
1) Baseline assets and inputs
- Regenerate terrain-map.json + water-chars.json from php/map.php (tools/extract-terrain.mjs).
- Fetch or vendor the canonical map.txt (tools/fetch-map.mjs); confirm dimensions and water/land ratios.
- Document current defaults (DEFAULT_WATER_CHAR, DISPLACEMENT_SCALE, POLE_PADDING_FACTOR) for quick iteration notes.

2) Height data shaping
- Define a richer height mapping from terrain descriptions (e.g., water=0, plains=low, hills=mid, mountain=high, peaks=max); keep the mapping driven by terrain-map.json.
- Normalize or clamp heights into a 0–1 range and store clear constants in config.ts.
- Add optional global height gain to quickly validate visibility without rewriting data.

3) Texture generation fidelity
- Ensure wrapS uses RepeatWrapping when possible; if map sizes stay non-power-of-two, decide whether to pad/resample to nearest power-of-two for cleaner wrapping.
- Consider small tile scaling (e.g., 2× pixels) in the generated textures to reduce aliasing, if performance remains acceptable.
- Keep color/height generation in one pass (textureBuilder.ts) but structure for easy tuning.

4) Geometry and material tuning
- Increase sphere segment count (and/or use a higher-res displacement-only mesh) so narrow features survive sampling.
- Tune displacementScale once height values are spread meaningfully; verify against shadowing changes.
- Keep material single-pass MeshStandardMaterial; no secondary/overlay mesh.

5) Debug + QA hooks
- Add a debug toggle to render the height map or exaggerate displacement on demand.
- Log/overlay key stats at runtime (map dimensions, min/max heights, water/land ratios) to validate inputs.
- Define quick manual checks (visible mountain ridges, pole padding continuity, texture seams).

6) Cleanup and documentation
- Remove or quarantine any overlay-globe references (none active now) to avoid split paths.
- Update README/notes with the tuning knobs and how to regenerate assets.
