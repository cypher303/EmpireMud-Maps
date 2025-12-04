Goal: restore the natural, shaded globe look while keeping per‑tile control for elevation (e.g., buildings) and colors. Focus changes on the planet (sun/moon stay as-is for now; splitting them later is optional cleanup).

Tasks (one run at a time)
1) High-detail albedo source
   - [x] Generate a richer albedo from existing color mappings (multi-px-per-tile patterns/noise); no external textures, stay data-driven.
   - [ ] Ensure albedo generation aligns with map.txt rows (no hardcoded ASCII elsewhere); remember map.php flips rows—ensure orientation matches current map.txt use.
   - [x] Fixed map size 1800×1000 (+ pole padding to 1334): pad to shared power-of-two textures (now 4096×4096 due to 2× tile scale) and apply identical padding to color/height/normal for wrap repeat.
2) Explicit per-tile heights
   - [x] Add numeric height/elevation to each entry in public/terrain-map.json (water=0; buildings > roads > plains, etc.); validate to avoid silent fallbacks.
   - [x] Update resolveHeight in src/textureBuilder.ts to prefer explicit heights over keyword guesses; keep water 0 and apply HEIGHT_GAIN; log missing-height count in stats.
   - [x] Height stats logged (min/max/avg/non-zero/peaks/missing heights) after build for quick verification.
3) Normal map from height data
   - [x] Generate a normal map from the built height buffer (finite diff) alongside the color/height textures; padding kept consistent (2048×2048) with color/height.
   - [x] Wire normalMap + normalScale (config NORMAL_SCALE=0.85, NORMAL_STRENGTH=2.5) into MeshStandardMaterial; downsample/worker path still optional if perf requires it.
   # We are not adding or supporting downsampling yet. Skip for now.
   <!-- - [ ] Add optional downsample or worker path for normal generation if perf becomes an issue. -->
4) Geometry and scale tuning
   - [ ] Bump segments to mapWidth ÷ 2–3 (respect MIN/MAX) for M3 MBP headroom; keep DISPLACEMENT_SCALE modestly elevated; log chosen values.
   - [ ] Ensure pole padding remains (POLE_PADDING_FACTOR) so albedo/height/normal stay seamless at the poles.
5) Verification passes
    # We are not adding a debug toggle yet. Skip for now.
   <!-- - [ ] Add a debug toggle (UI or hotkey) to switch between color, height, and normal views for quick inspection. -->
   - [ ] Snapshot checks: look for clear building elevation, visible ridges, no wrap seams, and repeat mode intact.
