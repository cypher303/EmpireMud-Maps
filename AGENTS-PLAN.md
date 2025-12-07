# AGENTS Plan (concise)

## Completed
1) Canonical map extraction; camera horizon sweep; lighting safety; map orientation parity.
2) GPU relief pipeline with water-flatness validation; single renderer reuse; normal rebuild from GPU heights.
3) Biome jitter + coastal fade; polar water padding; water/atmosphere polish and palette toggles.
4) Quality presets (low/high) for texture scale, relief, normals, displacement; legacy palette import.
5) Client/server texture generation: native dims (no padding), dispose safety, manifest loader with telemetry (latest pointer), and detail tile metadata flowing end-to-end.
6) Texture format tightening: globe normals now RGB8 (and KTX2 RGB) instead of RG; shader uses stock normal decode; manifest regenerated with RGB normals and detail tiles present. Client prefers KTX2 with fallback.
7) Detail tiles: mountain albedo/normal tiles bundled in manifest; generator produces optional KTX2 for detail assets; globe samples tiles when manifest is loaded (procedural fallback otherwise).
8) Mountain realism: slope/height/snow blend gated by mountain mask; detail tint/normal strength scales with altitude and rock/snow weight to keep flats clean and peaks crisp.

## Pending
1) Worker/offload for any remaining client-side generation/debug paths.
2) Manifest/documentation polish: cache/format notes, long-lived hosting guidance, and CDN path for baked assets; bake high/plus presets.
