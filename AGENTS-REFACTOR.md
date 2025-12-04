Goal: restore the natural, shaded globe look while keeping per‑tile control for elevation (e.g., buildings) and colors. Focus changes on the planet (sun/moon stay as-is for now; splitting them later is optional cleanup).

Tasks (one run at a time)
1) High-detail albedo source
   - [ ] Pick a rich color source: re-export map.php to map.png (or dynmap imagery) or build a multi-px-per-tile atlas with noise/patterns.
   - [ ] Add pipeline hook to load that image as the globe albedo while still aligning to map.txt rows (no hardcoded ASCII elsewhere); remember map.php flips rows—ensure orientation matches current map.txt use.
   - [ ] Fixed map size 1800×1000: pad to a shared power-of-two (e.g., 2048×1024) for repeat wrapping; apply identical padding to all globe textures.
2) Explicit per-tile heights
   - [ ] Add numeric height/elevation to each entry in public/terrain-map.json (water=0; buildings > roads > plains, etc.); validate to avoid silent fallbacks.
   - [ ] Update resolveHeight in src/textureBuilder.ts to prefer explicit heights over keyword guesses; keep water 0 and apply HEIGHT_GAIN.
   - [ ] Add a quick height debug logger/stat so we can see min/max/avg after changes.
3) Normal map from height data
   - [ ] Generate a normal map from the built height buffer (sobel/finite diff) alongside the color/height textures; keep padding consistent with color/height.
   - [ ] Wire normalMap + normalScale into MeshStandardMaterial; expose normal scale in config for tuning and allow downsampled normals if perf needs it (worker later if required).
4) Geometry and scale tuning
   - [ ] Bump segments to mapWidth ÷ 2–3 (respect MIN/MAX) for M3 MBP headroom; keep DISPLACEMENT_SCALE modestly elevated; log chosen values.
   - [ ] Ensure pole padding remains (POLE_PADDING_FACTOR) so albedo/height/normal stay seamless at the poles.
5) Verification passes
   - [ ] Add a debug toggle (UI or hotkey) to switch between color, height, and normal views for quick inspection.
   - [ ] Snapshot checks: look for clear building elevation, visible ridges, no wrap seams, and repeat mode intact.
