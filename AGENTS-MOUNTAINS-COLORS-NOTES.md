In the original project, I've checked out an earlier commit:
32defdc6 Scott <scott@scotts-macbook-pro.local> on 11/25/25 at 1:28 AM (mountain realism)

There are a few things I'd like to take hints from it. We aren't trying to take the actual structure of this code (the performance is relatively terrible compared to the new codebase), we just want to take hints, and make a plan to apply them in a more disciplined way to the new codebase. 

Major items for our consideration:
* the mountains - specifically how they're sloping and have pretty realistic textures.
* the colors - let's record these colors mappings into a safe place so we can try them out at some point.

We also want to take note as we're looking at the mountains and colors - what causes it to run so poorly. We don't have to compare it to our new codebase directly, but just some basic insights would be appreciated. 

## 32defdc6 review — mountains, colors, performance

### Mountain shaping/heightfield takeaways
- Peaks come from the `q` token, with foothill lift: hills touching a peak are raised to hill height so ranges taper smoothly.
- Apply a landmass slope before peaks: distance-from-water field adds a gentle 0.02 * heightScale rise toward interiors.
- Peak brush: radius 5 * resolution (scaled to ~1.35x in high-res translation), exponent 1.8, plateau ratio 0.28, noise jitter 0.32 * peak height; peak height 0.2. Subpeaks (~3–4 per peak) spread ~2.1 tiles with 0.85 height, adding ridgeline variation.
- Height smoothing: 2 passes at strength 0.18 after slopes. Per-biome jitter adds micro undulation (desert amp 0.03, forest 0.022, hills/default ~0.02 with low-frequency noise).
- Snow/detail transitions happen in the shader: soil→rock by slope (start 0.18, end 0.62) and rock→snow by relative height (~55% start, ~80% full). Micro-bump noise keeps lighting lively on flat ground.

### Texture/material hints
- Detail textures: soil `#4b553b/#5a6546`, rock `#5c5c62/#7a7a80`, snow `#e7ebf0/#cfd4dd`; tiled at roughly max(map dimension / 8).
- Emissive mask per token with warm/cool tints for roads/buildings/fortifications; emissive only blooms on the night side in the planet shader.

### Color palettes from 32defdc6 (kept for reuse)
Default (natural):
```json
{
  "*": "#d74b4b",
  "?": "#e5dfd6",
  "0": "#f7f7f5",
  "1": "#d63a3a",
  "2": "#4fa34f",
  "3": "#c7b23a",
  "4": "#4a7cc9",
  "5": "#cf4fb6",
  "6": "#3cb7c0",
  "a": "#9a2b2b",
  "b": "#8ac27a",
  "c": "#7fb24d",
  "d": "#3c9f7c",
  "e": "#2c7a5a",
  "f": "#1f4f29",
  "g": "#70811f",
  "h": "#bcdde5",
  "i": "#1b92d4",
  "j": "#2ba5df",
  "k": "#0a6fb5",
  "l": "#d6c9a0",
  "m": "#e9d08f",
  "n": "#e39b67",
  "o": "#d88730",
  "p": "#7a7045",
  "q": "#8a7a5a",
  "r": "#c5c5c5",
  "s": "#5b5b5b",
  "t": "#12315f",
  "u": "#165384",
  "v": "#8a3a6e",
  "w": "#1f6f6f",
  "x": "#6ac86a",
  "y": "#3c9f3c",
  "z": "#c4732f",
  "A": "#dba0c8",
  "B": "#c05c9e",
  "C": "#c9ad85",
  "D": "#8d5ad3",
  "E": "#60348f",
  "F": "#1a3a1a",
  "G": "#b6a27a",
  "H": "#e2c75a"
}
```

Retrowave:
```json
{
  "*": "#ff4fb5",
  "?": "#f8e2ff",
  "0": "#f5f5ff",
  "1": "#ff4f6d",
  "2": "#6dfcc1",
  "3": "#ffdd66",
  "4": "#62c0ff",
  "5": "#ff6bd6",
  "6": "#54e3ff",
  "a": "#f94892",
  "b": "#b6ffd4",
  "c": "#aaff6f",
  "d": "#74ffd5",
  "e": "#4df0b7",
  "f": "#00c278",
  "g": "#9dd45c",
  "h": "#c6f7ff",
  "i": "#75d0ff",
  "j": "#8ed7ff",
  "k": "#c0d6ff",
  "l": "#fff3c2",
  "m": "#ffd19a",
  "n": "#ff9b6b",
  "o": "#ff7b1d",
  "p": "#a4a5ff",
  "q": "#eab140",
  "r": "#d8def7",
  "s": "#707cb3",
  "t": "#171862",
  "u": "#1236a3",
  "v": "#b00077",
  "w": "#07c7c7",
  "x": "#99ffb8",
  "y": "#00da7f",
  "z": "#ff9a52",
  "A": "#ffb0f2",
  "B": "#ff70d5",
  "C": "#e4c6a6",
  "D": "#c489ff",
  "E": "#7c45f3",
  "F": "#118b58",
  "G": "#a47a3f",
  "H": "#ffe5a6"
}
```

Abyssal:
```json
{
  "*": "#ff9ae0",
  "?": "#dbe8ff",
  "0": "#f5fbff",
  "1": "#ff5fb7",
  "2": "#7cffa7",
  "3": "#ffe07a",
  "4": "#050712",
  "5": "#f287ff",
  "6": "#36e7ff",
  "a": "#ff87b7",
  "b": "#c3ff99",
  "c": "#9bff7b",
  "d": "#6affd4",
  "e": "#4df2a3",
  "f": "#23b07a",
  "g": "#c0f25a",
  "h": "#060916",
  "i": "#080e22",
  "j": "#0b102e",
  "k": "#0d1436",
  "l": "#f5efc4",
  "m": "#ffe89a",
  "n": "#ffc16a",
  "o": "#ff9c2a",
  "p": "#b4aaff",
  "q": "#8a7aff",
  "r": "#d5d5e5",
  "s": "#8a8ab3",
  "t": "#000000",
  "u": "#040a18",
  "v": "#8c0c5f",
  "w": "#0b1b2c",
  "x": "#9dff5f",
  "y": "#6bff7a",
  "z": "#ff9f50",
  "A": "#ffb2e8",
  "B": "#ff77d4",
  "C": "#f0cba8",
  "D": "#d08bff",
  "E": "#7c4ff3",
  "F": "#0c6b3f",
  "G": "#9e7a42",
  "H": "#ffd77a"
}
```

### Performance pain points in the legacy build
- `RENDER_DETAIL_MULTIPLIER = 3` upscales maps to 9x cells, then both `mapRowsToHeightfield` and `translateMapForRendering` allocate/resample huge Float32/Uint8 buffers on the main thread.
- `PlaneGeometry` uses segments equal to map width/height post-upscale (capped at 4M verts/28M indices) plus multiple RGBA DataTextures; heavy CPU allocation and GPU upload per render.
- Normals/textures are rebuilt multiple times (base build, translated build, planet downsample), and geometry/textures are recreated on every render/style change without caching.
- Chunked build only yields every ~12ms via `setTimeout`; no worker offload, so the UI still hitches during generation/resampling.
- Extra load from high-poly cloud (128x96) and atmosphere shells with animated shaders layered over the already heavy terrain.

### Perf comparison vs new codebase (Empire-Maps/src)
- Texture sizing: old upscales to 3x detail and then resamples again; new uses `TEXTURE_TILE_SCALE = 2` and pads to nearest power-of-two once. Color/height/normals are built in a single pass (`buildGlobeTextures`) without double-resampling.
- Geometry load: old builds PlaneGeometry with segments equal to (upscaled) map dimensions, then caps at 4M verts/28M indices; new picks segments ≈ mapWidth / 2.5 with clamps at 256–1024 (`segments` in globe) and uses a single displaced SphereGeometry. That’s far fewer vertices and indices.
- Render pipeline churn: old rebuilds geometry/textures for style changes and even during 2D fallback; new pipeline builds once at startup and reuses the same textures/renderer for the globe (no per-style retranslate). Quality difference doesn’t explain old cost—the churn does.
- CPU vs GPU: old height smoothing, normal generation, resampling, and peak application all run on the main thread over large Float32/Uint8 buffers. New still loops on the CPU for height/color prep but keeps buffers small and offloads the relief/noise to a GPU pass (`applyGpuRelief`). The big cost in the old build is inefficiency, not just fidelity.
- Array shifting issue: not present in this old commit—distance fields use flat typed-array queues with head/tail pointers. The previous “horrendous shift” problem appears already fixed here.
- New inefficiency to watch: `applyGpuRelief` currently calls `renderer.dispose()` after its offscreen pass (src/gpuRelief.ts). Because the same renderer is passed to `bootstrapGlobe`, that forces a fresh GL context right after generating textures—expensive and likely unintended.

### Quality scaling plan (new renderer, safe A/B knobs)
- Texture resolution knob: raise `TEXTURE_TILE_SCALE` (2 → 3–4) for sharper albedo/height; keep power-of-two padding and only rebuild textures when this changes. Store presets instead of ad-hoc edits.
- Geometry density knob: lower `SEGMENT_TO_TEXTURE_RATIO` (2.5 → ~1.6–2.0) with `MIN_SPHERE_SEGMENTS`/`MAX_SPHERE_SEGMENTS` caps. Rebuild the sphere only when this knob changes.
- Relief/detail knob: expose `GPU_RELIEF_*` (amplitude/frequency/warp/octaves) in a debug config. Keep relief on-GPU and remove the `renderer.dispose()` call so tuning doesn’t tear down the GL context.
- Shading strength knob: allow `NORMAL_STRENGTH`, `HEIGHT_GAIN`, and `DISPLACEMENT_SCALE` tweaks (e.g., disp ≤ 0.35, normals ≤ 3) to punch up lighting without aliasing or self-shadow artifacts.
- Snow/rock blend (look-match): add a shader-side blend using slope+height thresholds and tiny tiling detail textures (soil/rock/snow). Drive thresholds via uniforms (no geometry rebuild) for quick A/B.
- Palette/atmosphere toggles: swap color maps without rebuilding height/normals; reuse atmosphere/cloud meshes and only toggle visibility or material uniforms when testing.
- Caching discipline: keep one WebGLRenderer alive; cache generated textures and only rerun `buildGlobeTextures` when a buffer-affecting knob changes. For light tweaks (displacement, normals, materials), just update uniforms.
