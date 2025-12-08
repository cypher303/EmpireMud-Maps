import { LANDMARK_SOUND_THEMES } from './landmark_themes.js';
import type { LandmarkCategory, SoundAssetRef } from './landmark_themes.js';

/**
 * Registry facade for audio lookups. This remains dependency-free so rendering
 * and navigation layers can query themes without pulling in an audio engine.
 */
export class LandmarkSoundRegistry {
  constructor(private themes = LANDMARK_SOUND_THEMES) {}

  /**
   * Resolve the sound asset reference for a landmark category. Unknown values
   * return null to avoid throwing during early integration tests.
   */
  get(landmarkType: LandmarkCategory | string): SoundAssetRef | null {
    const entry = this.themes[landmarkType as LandmarkCategory];
    return entry ?? null;
  }
}

const defaultRegistry = new LandmarkSoundRegistry();

/**
 * Lightweight accessor used by map/tile rendering to fetch the placeholder
 * sound ID for a given landmark. Returns null for unknown categories so callers
 * can decide whether to fall back or stay silent.
 */
export function getLandmarkSound(landmarkType: LandmarkCategory | string): string | null {
  const entry = defaultRegistry.get(landmarkType);
  return entry?.id ?? null;
}

/**
 * Helper to retrieve the entire theme reference (including future metadata)
 * without exposing the registry internals. Useful for tooling that wants
 * volume/pitch defaults alongside the ID.
 */
export function getLandmarkSoundRef(landmarkType: LandmarkCategory | string): SoundAssetRef | null {
  return defaultRegistry.get(landmarkType);
}
