# Audio landmark themes

This folder holds the landmark sound mapping used by rendering/navigation layers. The goal is to keep asset selection data-driven and dependency-free until audio playback is wired up.

## How to consume
- Import the registry helpers from `src/audio/index.ts`.
- When a tile or route is classified (e.g., `shore`, `ocean`, `mountain`, `forest`, `desert`), call `getLandmarkSound(landmarkType)` to retrieve the placeholder sound ID.
- If you need the full reference (with future volume/pitch defaults), use `getLandmarkSoundRef(landmarkType)` to receive the `SoundAssetRef` object instead of just the ID.
- Unknown categories currently return `null` so callers can provide their own fallback or stay silent without throwing.

## Integration points
- Map tile rendering can request an ID during hover/selection and pass it to a future audio playback hook.
- Navigation logic (e.g., path previews or travel events) can resolve the sound for each encountered landmark and enqueue playback with the eventual audio engine.
- When real assets arrive, update `src/audio/landmark_themes.ts` with filenames or soundbank IDs. Keep volume/pitch metadata co-located to avoid per-call overrides scattered across the codebase.

## What is out of scope right now
- No audio engine is initialized here (no Three.js Audio, Web Audio, or loaders). These helpers only return data so they stay safe to import in non-audio contexts.
- Streaming/loading lifecycle is deliberately absent; wire those concerns into the rendering bootstrap once real assets and an engine are chosen.
