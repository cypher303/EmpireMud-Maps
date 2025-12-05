# Empire-Maps Migration Plan (from EmpireMud-2.0-Beta to Empire-Maps)

Goal: carry over the proven pieces (camera, textures, biome/polar polish, config patterns) from the old project into the current codebase in small, testable steps.

Tasks (one run at a time)
0) Canonical map + water extraction (blocker for palette/shader/polar work)
   - [x] Vendor php/map.php locally and extract terrain-map.json + water-chars.json as the sole source of truth.
   - [x] Gate palette/jitter/polar/palette-sync steps (5, 6, 7, 10, 11, 12) on those extracted mappings; no hand-coded token/water masks elsewhere.
1) Camera horizon sweep
   - [x] Recreate applyCameraHorizonSwing: horizon rig (surface normal/right/forward), look-ahead/lift target, blend based on camera distance to globe. Integrated into current camera/controls update.
   - [x] Mirror initial orbit framing (equatorial bias, azimuth π/4), min/max distance tied to radius.
2) Lighting/shadow safety net
   - [x] Disable globe self-shadowing by default; sun shadows off until tuned. Camera rig unchanged.
3) Map orientation parity
   - [x] Match old map parsing orientation (rows reversed like php/map.php). Verify north/south padding symmetry and wrap modes.
4) Procedural relief (GPU-first)
   - Port/simplify the GPU heightmap pipeline (noise field, domain warp, biome influence, water preservation). Stay GPU-only; no CPU fallback/downsampling needed for M3 targets.
   - [x] Add height debug preview (canvas or stats) to validate ranges (added height preview image from padded height buffer).
   - [x] Implement GPU relief pass: WebGL shader adds FBM noise with warp/frequency/amplitude (config-driven) to padded height map; normals now derive from GPU-enhanced heights.
   - [x] Remove the renderer.dispose() call in applyGpuRelief; relief must reuse the same renderer/GL context to honor the single-sphere rule and avoid perf thrash.
   - [x] Keep the single displaced sphere; relief/displacement respects the extracted water mask (zero ocean lift) and reuses the same renderer/geometry for all tweaks.
   - [x] After canonical extraction (step 0), add a relief-pass check that water tiles remain flat/untinted in height/normal outputs (water-flatness validation + stats logging).
5) Biome-aware color/height jitter
   - [x] Reintroduce biome/token groups (ocean/shallows/desert/forest/peaks) with per-biome jitter for albedo variation (token/group-driven jitter strength).
   - [x] Coastal fade: soften land/water edges (distance-field blend toward water color/zero height near shores).
6) Polar padding (water-only)
   - [x] Replace stylized caps (cap/melt/trench/rim) with simple water padding rows (≈ mapHeight/6), matching the main ocean palette.
   - [x] Keep north/south symmetry and wrap integrity; no extra tint/lift beyond ocean defaults.
7) Water/atmosphere polish
   - [x] Restore per-water-token palette and optional atmosphere/cloud shells; keep toggles for perf.
   - Palette pulls from water-colors.json (falls back to terrain/defaults), with Atmosphere/Clouds toggles in the UI to disable shells when budget is tight.
8) Config + seeds (cross-cutting baseline)
   - Adopt runtime config merging (defaults + overrides) for map source, style, GPU toggle, seeds/presets. Ensure map signature/hash for cache-awareness and keep quality/palette flags co-located for easy A/B flips.
   - Keep terrain rendering single-geometry: one displaced sphere reused across presets/tweaks; no per-style geometry rebuilds.
   - Keep token/water handling data-driven: shaders/JS read uploaded lookup textures/uniforms derived from terrain-map.json + water-chars.json; no hard-coded ASCII branches or extra rebuild churn when styles change.
9) Validation checkpoints (repeat per milestone)
   - For each step/preset swap: log key stats (map dims, terrain entries, heights), visual spot checks (horizon sweep, polar seams, coastal fade), and perf sanity (FPS/VRAM). Re-run after quality/palette/mountain tweaks.
10) Quality presets (config-only, GPU-first)
   - [x] Add low/high config blocks in config.ts: adjusts TEXTURE_TILE_SCALE, SEGMENT_TO_TEXTURE_RATIO, GPU_RELIEF_* (amp/freq/warp/octaves), NORMAL_STRENGTH, DISPLACEMENT_SCALE. Toggle via ?preset=low/high (stored in localStorage); rebuild happens only on preset change/page load with single renderer preserved.
11) Palette sync to legacy look (config-only)
   - [x] Import the “default/natural” palette from 32defdc6 into config; select via ?palette=legacy-natural (stored in localStorage). Default remains terrain-map colors; palette swap is data-driven, no UI toggle, and only affects colors (heights stay from terrain-map).
12) Mountain realism pass (GPU-only)
   - Add slope+height-based detail blend (soil/rock/snow) via shader uniforms; no geometry rebuild for tweaks.
   - Ensure mountain influence stays in-lane: precompute a mountain mask (peaks/hills) and clamp slope/height propagation at biome boundaries so non-mountain tiles don’t rise.
   - Tune relief/shading for mountains via the high preset; keep other biomes neutral for now. Honor water mask and single-sphere displacement when pushing detail.
13) Solar system safety
   - Confirm sun/moon systems remain untouched by terrain/palette changes; if coupling is risky, move their setup into a separate module without altering behavior.
