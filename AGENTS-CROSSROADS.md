Where Things Stand

Single path is active: src/main.ts builds color + height textures and feeds them into a single MeshStandardMaterial globe in src/globe.ts; no overlay sphere exists in the current code.
Displacement is wired: src/globe.ts passes heightMap + DISPLACEMENT_SCALE (0.3 from src/config.ts) into the main globe geometry (radius 2.4, 128×128 segments).
Height data is very flat: src/textureBuilder.ts sets water → 0, “mountain” tiles → 1, everything else → 0.02. With scale 0.3 that yields 0 m vs ~0.006 m lift for most land, so lighting barely changes.
Map content is extremely water-heavy: public/map.txt is 1800×1000; counts show k=1,456,777 (water), q=52,989 (mountain), G=225 (mountain peak). After pole padding the height map is mostly zero with a thin band of modest land and a few mountain spikes.
Texture/geometry mismatch: 1800px-wide map applied to a 128-segment sphere means each vertex samples a big swath of the texture, so the few mountainous pixels are averaged away; wrapS stays Clamp because the map isn’t power-of-two, so there’s no horizontal repeat.
Why Elevation Isn’t Visible

The main globe already uses the height map, but the underlying data is nearly flat (0 vs 0.006 lift) and heavily downsampled by the low segment count; mountains are rare, so you don’t get obvious relief.
The attempted “overlay globe” isn’t present in code, so dialing the base globe opacity won’t reveal anything—there’s nothing second-layer to see.
Path to Showing Elevation (single route)

Stick with the primary globe displacement path (it’s wired end-to-end) and make the height signal visible: temporarily exaggerate land/mountain heights or the displacement scale to validate, then tune back; increase geometry resolution (or use a separate higher-res displacement mesh) so mountains survive sampling; consider a debug view of the height texture to confirm data variance; swap in the canonical map.txt when available so land/water balance is realistic.
