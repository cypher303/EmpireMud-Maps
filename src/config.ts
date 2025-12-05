export const MAP_URL = '/map.txt';
export const TERRAIN_MAP_URL = '/terrain-map.json';
export const WATER_CHARS_URL = '/water-chars.json';
export const WATER_COLORS_URL = '/water-colors.json';

export const DEFAULT_TILE_COLOR = '#2a2f3a';
export const ATMOSPHERE_DEFAULT_ENABLED = true;
export const CLOUDS_DEFAULT_ENABLED = true;
export const ATMOSPHERE_COLOR = '#5db4ff';
export const ATMOSPHERE_OPACITY = 0.12;
export const ATMOSPHERE_THICKNESS_RATIO = 0.02;
export const CLOUD_OPACITY = 0.38;
export const CLOUD_THICKNESS_RATIO = 0.018;
export const CLOUD_ROTATION_SPEED = 0.00085;

export const POLE_PADDING_FACTOR = 1 / 6;
export const PLAIN_HEIGHT = 0.02;
export const ROUGH_LAND_HEIGHT = 0.08;
export const HILL_HEIGHT = 0.18;
export const MOUNTAIN_HEIGHT = 0.3;
export const PEAK_HEIGHT = 0.4;
export const HEIGHT_GAIN = 1; // multiplier applied to all non-water heights for visibility
export const NORMAL_SCALE = 0.85; // MeshStandardMaterial normal scale
export const COLOR_NOISE_STRENGTH = 0.08; // +/- variation applied to albedo per-pixel for detail

export const HEIGHT_DILATION_RADIUS = 2; // pixels; dilate peaks to survive low-geo sampling
export const HEIGHT_DILATION_PASSES = 1;
export const HEIGHT_SMOOTHING_RADIUS = 1; // pixels; blur to taper edges down from peaks
export const HEIGHT_SMOOTHING_PASSES = 1;
export const COASTAL_FADE_SCALE = 1.05;
export const COASTAL_FADE_POWER = 0.68;

export const MIN_SPHERE_SEGMENTS = 256;
export const MAX_SPHERE_SEGMENTS = 1024;

export type QualityPresetId = 'low' | 'high';

export interface QualityPreset {
  textureTileScale: number;
  segmentToTextureRatio: number;
  displacementScale: number;
  normalStrength: number;
  gpuRelief: {
    amplitude: number;
    frequency: number;
    warp: number;
    octaves: number;
    seed: number;
  };
}

export const QUALITY_PRESETS: Record<QualityPresetId, QualityPreset> = {
  low: {
    textureTileScale: 2,
    segmentToTextureRatio: 3.0,
    displacementScale: 0.24,
    normalStrength: 2.2,
    gpuRelief: {
      amplitude: 0.06,
      frequency: 3.0,
      warp: 0.2,
      octaves: 3,
      seed: 1.23,
    },
  },
  high: {
    textureTileScale: 3,
    segmentToTextureRatio: 1.8,
    displacementScale: 0.32,
    normalStrength: 3.0,
    gpuRelief: {
      amplitude: 0.12,
      frequency: 5.0,
      warp: 0.32,
      octaves: 5,
      seed: 1.23,
    },
  },
};

const DEFAULT_PRESET_ID: QualityPresetId = 'high';

function isQualityPresetId(value: string | null): value is QualityPresetId {
  return value === 'low' || value === 'high';
}

function resolveQualityPresetId(): QualityPresetId {
  if (typeof window === 'undefined') return DEFAULT_PRESET_ID;
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('preset');
    if (isQualityPresetId(fromQuery)) {
      window.localStorage?.setItem('qualityPreset', fromQuery);
      return fromQuery;
    }
    const stored = window.localStorage?.getItem('qualityPreset');
    if (isQualityPresetId(stored)) return stored;
  } catch (error) {
    console.warn('Unable to resolve quality preset from query/localStorage; falling back to default.', error);
  }
  return DEFAULT_PRESET_ID;
}

export const ACTIVE_QUALITY_PRESET_ID: QualityPresetId = resolveQualityPresetId();
export const ACTIVE_QUALITY_PRESET: QualityPreset = QUALITY_PRESETS[ACTIVE_QUALITY_PRESET_ID];

export const TEXTURE_TILE_SCALE = ACTIVE_QUALITY_PRESET.textureTileScale; // pixels per map tile when generating color/height/normal textures
export const SEGMENT_TO_TEXTURE_RATIO = ACTIVE_QUALITY_PRESET.segmentToTextureRatio; // lower = more geometry; segments ≈ mapWidth / ratio
export const DISPLACEMENT_SCALE = ACTIVE_QUALITY_PRESET.displacementScale; // base displacement (meters relative to radius)
export const NORMAL_STRENGTH = ACTIVE_QUALITY_PRESET.normalStrength; // gradient amplification when deriving normals from height
export const GPU_RELIEF_AMPLITUDE = ACTIVE_QUALITY_PRESET.gpuRelief.amplitude; // strength of procedural relief added on GPU
export const GPU_RELIEF_FREQUENCY = ACTIVE_QUALITY_PRESET.gpuRelief.frequency; // base frequency of relief noise
export const GPU_RELIEF_WARP = ACTIVE_QUALITY_PRESET.gpuRelief.warp; // domain warp strength for relief noise
export const GPU_RELIEF_OCTAVES = ACTIVE_QUALITY_PRESET.gpuRelief.octaves; // octave count for relief noise
export const GPU_RELIEF_SEED = ACTIVE_QUALITY_PRESET.gpuRelief.seed; // seed for relief noise
