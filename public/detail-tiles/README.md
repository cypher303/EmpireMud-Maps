# Detail Tiles (per-biome/per-tile-type)

Drop high-quality, seamless patches here to enrich the ASCII map. These are references only; we will wire the pipeline to sample them once assets exist.

## What to provide
- For each tile type/biome (e.g., mountains, hills, forest, grass, sand, rock, snow, water variants), supply:
  - 2–4 albedo variants: `albedo_<tile>_v1.png`, `albedo_<tile>_v2.png`, etc.
  - Matching normal variants: `normal_<tile>_v1.png`, `normal_<tile>_v2.png`, etc. (OpenGL-style, positive Z, tangent-space).
  - (Optional) height/roughness maps if available: `height_<tile>_v1.png`, `roughness_<tile>_v1.png`.
- Use lossless PNG (or high-quality TIFF/EXR if needed; we can transcode later).

## Resolution guidance
- Preferred: 1024×1024 per variant (good fidelity on a planet-scale view). 512×512 is acceptable for “filler” biomes; 2048×2048 only if the content truly needs it.
- Keep a consistent texel density: 1 patch ≈ a few map tiles in world space. We’ll tile/triplanar in world space to avoid seams, so seamless edges matter more than exact pixel density.
- Textures **must be seamless/tiling**.

## Variation without patchwork seams
- Provide multiple variants per tile type; we’ll pick deterministically per tile/seed.
- Ensure variants share scale/lighting so cross-fades look natural.
- Keep normal/height amplitude consistent across variants to avoid visible steps.

## Format notes
- Color space: sRGB for albedo; linear for normal/height/roughness.
- Bit depth: 8-bit per channel is fine; 16-bit only if the asset needs the range (especially for height).

## Integration plan (up next)
- Extend the server generator to ingest these assets, build atlases or tiles, and bake them into the KTX2/bin outputs (mipmapped).
- Sample detail in the shader via triplanar/world-space UVs, with deterministic variant selection per tile and edge blending to prevent “quilt” seams.
- Continue precomputing textures server-side, so the frontend still just downloads baked assets (no extra runtime load).
