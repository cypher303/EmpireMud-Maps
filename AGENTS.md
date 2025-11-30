# Resources

https://github.com/EmpireMUD/EmpireMUD-2.0-Beta/tree/b5.196/php
https://empiremud.net/map.txt

Plan (using only php/ and map.txt)
	1.	Clone PHP mapping logic locally
	•	Download php/map.php from the b5.196 tree and store it alongside the new project.  ￼
	2.	Extract canonical terrain mapping from map.php
	•	Inspect map.php for:
	•	The array(s) or logic that map ASCII chars to terrain types and/or colors (e.g. $terrain[...], $colors[...], etc.).
	•	Write a small PHP or script-runner snippet that:
	•	Includes map.php but bypasses any image-output,
	•	Dumps a JSON file like { "<char>": { "name": "...", "color": "#rrggbb", ... } }.
	•	Save this as terrain-map.json (canonical mapping for all future code).
	3.	Identify “water” characters via map.php
	•	From terrain-map.json, find the entry/entries whose terrain name or description clearly indicates water/ocean/sea.
	•	Record the set WATER_CHARS = [ '...', ... ] for the JS pipeline.
	4.	Load and parse map.txt
	•	Download https://empiremud.net/map.txt at build time (or vendor it into the repo).
	•	Read it as plain text:
	•	Split on newlines → array of rows.
	•	Each row is a string of ASCII tiles; infer MAP_WIDTH and MAP_HEIGHT from row length and row count.
	•	Convert into a 2D array map[y][x] of terrain chars using the raw characters from map.txt.
	5.	Pad poles with ocean (water-only world band)
	•	Decide a padding factor, e.g. polePadding = Math.round(mapHeight / 6).
	•	Create new rows of width MAP_WIDTH filled with a chosen water char from WATER_CHARS[0].
	•	Build extendedMap as:
	•	polePadding rows of water on top
	•	original map in the middle
	•	polePadding rows of water on bottom
	•	This gives you a taller extendedMap suitable for equirectangular → globe projection with oceanic poles.
	6.	Generate a texture from extendedMap using the canonical mapping
	•	In JS, load terrain-map.json.
	•	Create an offscreen <canvas> with size (MAP_WIDTH × extendedHeight).
	•	For each (x, y):
	•	Get char c = extendedMap[y][x].
	•	Look up terrain-map[c].
	•	For now, if c ∈ WATER_CHARS → use its water color, otherwise use a neutral land placeholder (e.g. dark gray).
	•	Fill a single pixel per tile (or a small block per tile) to build the texture.
	7.	Hook that texture into Three.js as an equirectangular globe
	•	In JS:
	•	Create SphereGeometry and a basic/standard material using the generated canvas as map.
	•	Set texture.wrapS = THREE.RepeatWrapping (horizontal wrap).
	•	Keep wrapT at default (poles are all water from padding).
	•	Add OrbitControls for drag + zoom and set camera distance appropriate for laptop use.
	8.	Keep the pipeline data-driven for future terrain expansion
	•	All future terrain work (colors, shaders, organic styling) should:
	•	Read from terrain-map.json (derived only from map.php),
	•	Read world layout exclusively from map.txt,
	•	Never hand-code ASCII mappings elsewhere (so map.php remains the single source of truth).