# EmpireMud-Maps

Three.js starter that follows the mapping pipeline in `AGENTS.md` so we can hang richer terrain and water work on top. It is tuned for a MacBook Pro-class viewport but keeps everything responsive to other sizes.

## Project layout
- `php/map.php`: vendor copy of the upstream generator that remains the single source of truth for terrain colors.
- `tools/extract-terrain.mjs`: parses `map.php` and outputs canonical `public/terrain-map.json` and `public/water-chars.json`.
- `tools/fetch-map.mjs`: downloads `map.txt` into `public/map.txt` when the upstream host is reachable.
- `public/`: serves the raw assets (`map.txt`, generated terrain JSON files) directly to the client.
- `src/`: Vite + TypeScript client that loads the assets, pads the poles, and maps everything onto a Three.js globe.

## Getting started
1. Install dependencies (Node 18+ works well on an M3 MacBook Pro):
   ```sh
   npm install
   ```
2. Regenerate terrain + water metadata from the vendored PHP (run again whenever `php/map.php` changes):
   ```sh
   npm run extract:terrain
   ```
3. Pull down the canonical map text (required for real globe output). If the upstream host blocks the current network, manually download the file and drop it in `public/map.txt`:
   ```sh
   npm run fetch:map
   # or manually curl https://empiremud.net/map.txt > public/map.txt when allowed
   ```
4. Start the dev server:
   ```sh
   npm run dev -- --host
   ```
   Then open the printed URL (on macOS Safari/Chrome, the default 1200×760 viewport matches a laptop-friendly working size).

## Notes on the template
- The globe uses an equirectangular texture built directly from `map.txt`; pole padding defaults to one-sixth of the map height and wraps horizontally.
- Water handling is data-driven via `public/water-chars.json`; the default falls back to the first detected water character or `k`.
- The current `public/map.txt` is a placeholder because the upstream host was unreachable from this environment. Replace it with the canonical file before shipping visuals.
- No shading or custom water effects are applied yet—this is an extensible baseline to bolt on richer materials, shaders, or geometry as other assets arrive.
