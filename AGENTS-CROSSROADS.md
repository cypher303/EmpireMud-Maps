Where Things Stand
- Single globe only: src/main.ts builds color + height textures; src/globe.ts applies them to one MeshStandardMaterial sphere.
- Displacement is live: DISPLACEMENT_SCALE 0.3 on radius 2.4, 128×128 segments.
- Height data is flat: water=0, mountains=1, everything else=0.02 → most land lifts only ~0.006 with current scale.
- Map is water-heavy: public/map.txt 1800×1000 with sparse land/mountain pixels.
- Texture vs geometry: wide texture on 128 segments blurs the few mountains; wrapS clamps because dimensions aren’t power-of-two.

Why Elevation Isn’t Visible
- Signal is tiny, data is mostly water, and downsampling blurs the few highs. Only one globe exists; opacity won’t reveal another layer.

Path to Showing Elevation
- Exaggerate heights or displacement temporarily, raise geometry resolution, add a debug height view, and swap in the canonical map.txt for better land/water balance.
