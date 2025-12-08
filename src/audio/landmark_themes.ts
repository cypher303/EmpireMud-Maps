/**
 * Landmark-to-sound placeholder map.
 *
 * The IDs here are intentionally simple strings so we can drop in real asset
 * filenames, hashed bundle IDs, or soundbank keys later without changing the
 * consumer code. Optional metadata (volume/pitch) allows us to pre-bake
 * per-landmark tuning when we wire up the audio engine.
 */
export const LANDMARK_CATEGORIES = [
  'shore',
  'ocean',
  'mountain',
  'forest',
  'desert',
] as const;

export type LandmarkCategory = (typeof LANDMARK_CATEGORIES)[number];

export interface SoundAssetRef {
  /**
   * Placeholder asset identifier. Swap with real filenames or soundbank IDs
   * once the audio pipeline is wired in.
   */
  id: string;
  /**
   * Optional gain scalar for future playback; expressed as a multiplier where
   * 1.0 is the source asset volume.
   */
  volume?: number;
  /**
   * Optional pitch offset for future playback; useful for subtle variation
   * without duplicating assets.
   */
  pitch?: number;
}

export type LandmarkSoundThemes = Record<LandmarkCategory, SoundAssetRef>;

export const LANDMARK_SOUND_THEMES: LandmarkSoundThemes = {
  shore: { id: 'sfx_shore_waves_placeholder', volume: 0.9 },
  ocean: { id: 'sfx_ocean_swell_placeholder', volume: 1.0 },
  mountain: { id: 'sfx_mountain_wind_placeholder', volume: 0.8 },
  forest: { id: 'sfx_forest_birds_placeholder', volume: 0.85, pitch: 1.02 },
  desert: { id: 'sfx_desert_wind_placeholder', volume: 0.75 },
};

/**
 * Note for future expansion:
 * - Extend SoundAssetRef with loop/fade metadata as playback hooks mature.
 * - Consider multi-layered themes (e.g., day/night variants) or per-biome
 *   overrides. Keep the single source of truth in this table so loaders and
 *   UI hints stay consistent.
 */
