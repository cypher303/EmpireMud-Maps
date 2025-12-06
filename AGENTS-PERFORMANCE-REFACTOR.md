## Performance Findings (Dec 05 traces + heap)
- CPU: Main-thread work is light; `animate` in `src/globe.ts` is the only user function showing in profiles (~0.06 ms/call). Occasional 33–53 ms frames are dominated by rAF/render + DevTools overhead, not app logic.
- Memory: ~475 MB JS heap; ~468 MB is `JSArrayBufferData` backing typed arrays for textures (color/height/normal/mask). Two 128 MB buffers plus multiple 32–24 MB buffers dominate. These stay alive because `DataTexture` → `Material` → scene/context still references their `{data,width,height}` sources.

## Texture Strategy: Server-Side Generation
- Move the current client generation (color/height/normal/mountain mask) to the server, produce ready-to-use GPU-friendly assets (e.g., KTX2 with UASTC/ETC/BC, or plain PNG/WebP fallback), and cache by map/preset hash. Client just downloads and uploads; no large intermediate typed arrays on the main thread.
- Quality impact: If we generate with the same resolution and filters, visual parity should hold. GPU compression trades some quality for size; UASTC (at moderate quality) or BC7/ASTC can be visually lossless for this content, while ETC1S is smaller but may band in smooth gradients (oceans/atmosphere). We can keep height/mask as R8 to preserve displacement fidelity, normals as RG (reconstruct B in shader) or BC5 two-channel, color in BC7/ASTC/UASTC. Net effect: similar or better quality if we pick high-quality compressors; only lower-tier formats risk minor banding.
- Default formats: color → KTX2 + UASTC (ETC1S only for low presets); normals → KTX2 + UASTC/BC5 using RG with Z reconstructed in shader; height → R8; mountain mask → R8. Height/mask can still be stored as uncompressed R8 payloads inside KTX2.

## Concrete Changes (ordered, with status)
1) **Stop excess allocations client-side (quick win)**
   - [x] Skip `nextPowerOfTwo` + padding when using clamp/nearest; build/upload at native dimensions to avoid full-size copies.
   - [x] Ensure dispose on rebuild: dispose textures/materials and clear context arrays that retain `Source` objects.
   - [x] Gate the 256×256 preview generation in production.
2) **Reduce texture footprint (client & server compatible)**
   - [x] Lower `TEXTURE_TILE_SCALE` for non-ultra presets to cap width/height.
   - [x] Pack normals into RG and reconstruct in shader; keep height/mask in R8 (already). Color: consider 3-channel (RGB8) if alpha unused.
3) **Server-side precompute & cache**
   - [x] Implement a deterministic pipeline that takes map + preset → outputs color/height/normal/mask assets, stored by hash.
   - [x] Export as KTX2 (primary) with raw-bin fallback; serve via CDN. Provide manifest with URLs + metadata (dimensions, wrap mode).
   - [x] (Previously optional - now a hard requirement to ease the frontend load): generate mip chains offline in `tools/generate-textures.ts`—build full mip pyramids (at least for color/normal), write all levels into KTX2 and raw-bin fallbacks, and on the client disable runtime mip generation (`generateMipmaps = false`) while relying on uploaded mips.
4) **Client consumption**
   - [x] Bypass generation: load manifests, fetch textures, and create `DataTexture` (or `KTX2Loader` → `CompressedTexture`) directly.
   - [x] Progressive load: support low/high manifests per map; load low-res textures first to render immediately, then fetch high-res manifest/textures asynchronously and swap via the dispose/rebuild path.
5) **Longer-term**
   - [ ] Move any remaining CPU-heavy texture work (fallback client generation, debug tools) into a Worker: generate typed arrays there, transfer `ArrayBuffer`s back, and upload to WebGL in small batches (<~16 ms per frame).

## Server Offload Plan (milestones)
1) **Server-side generation (unchanged formats)**
   - [x] Define manifest schema: per map+p reset hash, include URLs/paths for color RGBA8, normal RG8, height R8, mountain mask R8, dimensions, wrap, filters, hashes.
   - [x] Add Node script/endpoint to run `buildGlobeTextures` server-side, emit textures + manifest keyed by hash, skip if cached.
   - [x] Provide CLI for batch regenerate/purge; decide storage location and caching headers (serving headers still to set in hosting layer).
2) **Client consumption (unchanged formats)**
   - [x] Add codepath/flag to load manifest, fetch textures, and create `DataTexture`s instead of building locally; keep client generator as dev fallback.
   - [x] Validate dimensions/formats from manifest; dispose prior globe/textures before swapping.
   - [x] Log asset sizes/load timings to compare vs local generation.
3) **Format tightening (post-offload)**
   - [ ] Evaluate RGB8 for color: confirm alpha is unused in rendering/picking/UI, then drop alpha in generator/manifest; treat raw fallbacks as RGB8 while encoding color as UASTC/BC7 in KTX2.
   - [x] Add KTX2 compression pipeline on server (e.g., UASTC/BC7 for color; BC5/RG8 for normals; R8 for height/mask), update manifest.
   - [x] Update client to prefer KTX2 via `KTX2Loader` with fallback to `DataTexture`; keep shader changes minimal (normals already RG).
   - [ ] Document the final texture-format matrix (color UASTC with ETC1S only for low presets; normals UASTC/BC5 in RG; height R8; mask R8) in the manifest schema and developer docs.

## Feasibility & Expected Gains
- Memory: Removing padding + lowering tile scale can drop per-map buffers by 2–4× immediately. Server-side compressed textures can cut GPU upload size and client heap by an order of magnitude (e.g., BC5/BC7 ~4–8× smaller than RGBA8, and no giant JS buffers).
- CPU: Offloading generation to the server removes the client-side build entirely; remaining main-thread work is just texture upload + render.
- Quality: Neutral if we keep resolution; slight risk of banding only if we choose aggressive compression. Using UASTC/BC5/BC7 or ASTC at reasonable quality should keep visuals effectively identical. Height in R8 preserves displacement; normals in RG/BC5 retain shading fidelity.

## Quick Sanity Check (directives)
1) Stopping excess allocations
   - Removing power-of-two padding and gating previews is the right first move.
   - Disposing textures/materials and clearing arrays that retain `Source` objects directly addresses heap dominance of `JSArrayBufferData`.
2) Reducing footprint (tile scale + RG normals)
   - Lowering `TEXTURE_TILE_SCALE` for non-ultra presets is a clean, controllable knob.
   - RG normals with Z reconstruction halve normal bytes and pair well with BC5/UASTC.
3) Server-side precompute + KTX2
   - Deterministic map+preset → manifest+assets keyed by hash is the right caching model.
   - KTX2 primary + raw-bin fallback + manifest (dimensions, wrap, filters) is solid.
   - Telemetry on asset sizes/timings is necessary to validate real gains.
4) Client consumption
   - Prefer `KTX2Loader` + compressed textures with fallback to `DataTexture` to tackle the “475 MB JS heap from typed arrays” issue.
   - Reuse a single renderer and dispose the globe before swaps to avoid lingering references to big buffers.
5) Longer-term
   - With server-side generation, web workers are a contingency for any remaining CPU-heavy client transforms; keep as “maybe later.”
   - Verify no extra references to original typed arrays beyond the KTX2 decode/transcode window to achieve the target order-of-magnitude heap reduction while keeping visuals unchanged under chosen formats.

## Progress Log
- 2025-12-05: Implemented “stop excess allocations” step: texture generation now stays at native dimensions (no power-of-two padding) and clamps wrap to edge; removed padding copies for all texture channels; gated 256×256 height preview to dev builds only.
- 2025-12-05: Added rebuild safety: dispose globe before regenerating textures, clear previews, and reuse a single renderer to avoid retaining prior `DataTexture` sources.
- 2025-12-05: Reduced texture footprint by lowering `TEXTURE_TILE_SCALE` for high presets (3→2, 4→3) to cap generated texture dimensions.
- 2025-12-05: Packed normal maps into two channels (RG) and reconstruct Z in shader; normal textures now use `RG8` instead of `RGBA8`, halving their byte size.
- 2025-12-05: Added server-side texture generator (`tools/generate-textures.ts`) that writes RGBA8/RG8/R8 raw bins plus a manifest keyed by map/preset/palette hash; added npm script `generate:textures`.
- 2025-12-05: Enhanced generator CLI with `--force`, `--purge`, `--out`, `--map-url`, `--preset`, `--palette` env overrides; storage defaults to `dist/generated`.
- 2025-12-05: Added manifest loader + client codepath to fetch manifest-provided textures (flag via `?manifest=...`), fall back to client generation, and reuse disposal flow; status/logs note manifest usage.
- 2025-12-05: Added load telemetry: measure texture load/generation time and byte sizes (manifest vs local) and log to console.
- 2025-12-05: Added cache metadata to generated manifests (sha256 + size + cache-control hint) to support long-lived immutable caching in hosting.
- 2025-12-06: Added server KTX2 outputs (raw by default, optional `ktx encode` compression) alongside bin fallbacks in manifests; client loader now prefers KTX2 via `KTX2Loader` with auto-fallback to bins; basis transcoder assets published under `/basis/`.
- 2025-12-06: Built offline mip chains (color/normal/height/mask) into the server generator; manifests now reference per-level `.bin` files and multi-level KTX2 containers, and the CLI now runs via `tsx` (no ts-node loader flags).
- 2025-12-06: Client manifest loader consumes precomputed mipmaps (no runtime generation) and supports progressive `manifestLow` → `manifestHigh` swaps, reusing the dispose/rebuild flow for the upgrade.
