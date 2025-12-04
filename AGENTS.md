# Resources

https://github.com/EmpireMUD/EmpireMUD-2.0-Beta/tree/b5.196/php
https://empiremud.net/map.txt

Current working plan: see AGENTS-CROSSROADS.md. Single-globe displacement only.

Plan (php/ + map.txt only)
1) Vendor php/map.php locally.
2) Extract canonical terrain-map.json + water-chars.json from map.php.
3) Identify water chars from terrain map for the JS pipeline.
4) Load map.txt as raw rows; infer width/height.
5) Pad poles with water rows (polePadding ≈ mapHeight/6).
6) Generate textures from extended map using terrain-map.json colors.
7) Render one SphereGeometry with that texture; wrapS = RepeatWrapping.
8) Keep all mappings data-driven; don’t hand-code ASCII mappings elsewhere.
