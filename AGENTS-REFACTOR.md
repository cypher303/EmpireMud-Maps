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
   - [x] Bump segments using texture width: stats.width/SEGMENT_TO_TEXTURE_RATIO with MIN=256, MAX=1024 (padded 4096→~1638 clamped to 1024); keeps DISPLACEMENT_SCALE modest; logged via stats.
   - [x] Pole padding unchanged (POLE_PADDING_FACTOR) and textures remain padded identically, so seams stay consistent.
5) Verification passes
    # We are not adding a debug toggle yet. Skip for now.
   <!-- - [ ] Add a debug toggle (UI or hotkey) to switch between color, height, and normal views for quick inspection. -->
   - [ ] Snapshot checks: look for clear building elevation, visible ridges, no wrap seams, and repeat mode intact.
