# Resources

https://github.com/EmpireMUD/EmpireMUD-2.0-Beta/tree/b5.196/php
https://empiremud.net/map.txt

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
