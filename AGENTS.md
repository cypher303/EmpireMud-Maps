# Resources

https://github.com/EmpireMUD/EmpireMUD-2.0-Beta/tree/b5.196/php
https://empiremud.net/map.txt

# Reality check (current output)
- Source map is ~1800×1000 ASCII tiles; we upscale but there is no photographic albedo, no high-frequency normals, and no real bathymetry/shoreline shading. The globe will look chunky/palette-driven until higher-res art/height data is introduced.

Baseline (single-globe displacement; php/ + map.txt only). See other AGENTS files for extended migration/rendering notes.
Plan (php/ + map.txt only)
1) Vendor php/map.php locally.
2) Extract canonical terrain-map.json + water-chars.json from map.php.
3) Identify water chars from terrain map for the JS pipeline.
4) Load map.txt as raw rows; infer width/height.
5) Pad poles with water rows (polePadding ≈ mapHeight/6).
6) Generate textures from extended map using terrain-map.json colors.
7) Render one SphereGeometry with that texture; wrapS = RepeatWrapping.
8) Keep all mappings data-driven; don’t hand-code ASCII mappings elsewhere.

Discipline: token/water handling lives only in the extracted terrain-map.json and water-chars.json. Feed shaders/JS via lookup textures/uniforms from those tables; avoid hard-coded ASCII branches or per-style rebuild churn. Keep the single renderer + sphere reused across tweaks.

# Delicate areas (tread carefully)
- Solar audio occlusion: `applyAudioLevels` lerps gain/lowpass for the moon track via `moonOcclusionFactor`; keep updates flowing through that function so spatial cues and lowpass stay in sync.
- Layering without depth writes: atmosphere and cloud shells rely on `depthWrite: false` and renderOrder offsets to avoid punching holes in the globe. Preserve those flags/order when tweaking materials.
- GPU relief passes: offscreen height/normal generation runs with depth disabled in `gpuRelief.ts` to keep blits cheap and avoid stale depth buffers. Don’t flip depthWrite/depthTest without re-auditing the pipeline.
- Map token discipline: keep ASCII→terrain/water mappings centralized in the extracted JSON; avoid shadow copies in shaders or UI paths that would drift from the source tables.
