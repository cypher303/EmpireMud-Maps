export const MAP_URL = '/map.txt';
export const TERRAIN_MAP_URL = '/terrain-map.json';
export const WATER_CHARS_URL = '/water-chars.json';
export const WATER_COLORS_URL = '/water-colors.json';

export const DEFAULT_WATER_CHAR = 'k';
export const DEFAULT_TILE_COLOR = '#2a2f3a';
export const DEFAULT_WATER_COLORS: Record<string, string> = {
  '4': '#4a7cc9',
  i: '#1b92d4',
  j: '#2ba5df',
  k: '#0a6fb5',
  t: '#12315f',
  u: '#165384',
  w: '#1f6f6f',
};
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
export const DISPLACEMENT_SCALE = 0.26; // base displacement (meters relative to radius)
export const NORMAL_STRENGTH = 2.5; // gradient amplification when deriving normals from height
export const NORMAL_SCALE = 0.85; // MeshStandardMaterial normal scale
export const TEXTURE_TILE_SCALE = 2; // pixels per map tile when generating color/height/normal textures
export const COLOR_NOISE_STRENGTH = 0.08; // +/- variation applied to albedo per-pixel for detail

export const HEIGHT_DILATION_RADIUS = 2; // pixels; dilate peaks to survive low-geo sampling
export const HEIGHT_DILATION_PASSES = 1;
export const HEIGHT_SMOOTHING_RADIUS = 1; // pixels; blur to taper edges down from peaks
export const HEIGHT_SMOOTHING_PASSES = 1;
export const SEGMENT_TO_TEXTURE_RATIO = 2.5; // lower = more geometry; segments ≈ mapWidth / ratio
export const GPU_RELIEF_AMPLITUDE = 0.08; // strength of procedural relief added on GPU
export const GPU_RELIEF_FREQUENCY = 4.0; // base frequency of relief noise
export const GPU_RELIEF_WARP = 0.25; // domain warp strength for relief noise
export const GPU_RELIEF_OCTAVES = 4; // octave count for relief noise
export const GPU_RELIEF_SEED = 1.23; // seed for relief noise
export const COASTAL_FADE_SCALE = 1.05;
export const COASTAL_FADE_POWER = 0.68;
export const POLAR_COLORS = {
  cap: '#8cb7ff',
  trench: '#010912',
  rim: '#0c2436',
  land: '#dfefff',
  melt: '#0a0c16',
  rimTint: '#1b3450',
};
export const POLAR_SETTINGS = {
  capRatio: 0.06,
  capHeight: 0.015,
  meltBandRatio: 0.02,
  meltStrength: 0.75,
  trenchBandRatio: 0.12,
  trenchDepthBonus: 0.45,
  trenchStrength: 0.9,
  rimRatio: 0.05,
  rimStrength: 0.75,
};
export const POLAR_EDGE_BLEND = {
  ratio: 0.08,
  strength: 0.8,
};

export const MIN_SPHERE_SEGMENTS = 256;
export const MAX_SPHERE_SEGMENTS = 1024;
