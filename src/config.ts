export const MAP_URL = '/map.txt';
export const TERRAIN_MAP_URL = '/terrain-map.json';
export const WATER_CHARS_URL = '/water-chars.json';

export const DEFAULT_WATER_CHAR = 'k';
export const DEFAULT_TILE_COLOR = '#2a2f3a';

export const POLE_PADDING_FACTOR = 1 / 6;
export const PLAIN_HEIGHT = 0.02;
export const ROUGH_LAND_HEIGHT = 0.08;
export const HILL_HEIGHT = 0.18;
export const MOUNTAIN_HEIGHT = 0.3;
export const PEAK_HEIGHT = 0.4;
export const HEIGHT_GAIN = 1; // multiplier applied to all non-water heights for visibility
export const DISPLACEMENT_SCALE = 0.35; // base displacement (meters relative to radius)
export const NORMAL_STRENGTH = 2.5; // gradient amplification when deriving normals from height
export const NORMAL_SCALE = 0.85; // MeshStandardMaterial normal scale
export const TEXTURE_TILE_SCALE = 2; // pixels per map tile when generating color/height/normal textures
export const COLOR_NOISE_STRENGTH = 0.08; // +/- variation applied to albedo per-pixel for detail

export const HEIGHT_DILATION_RADIUS = 2; // pixels; dilate peaks to survive low-geo sampling
export const HEIGHT_DILATION_PASSES = 1;
export const HEIGHT_SMOOTHING_RADIUS = 1; // pixels; blur to taper edges down from peaks
export const HEIGHT_SMOOTHING_PASSES = 1;
export const SEGMENT_TO_TEXTURE_RATIO = 2.5; // lower = more geometry; segments ≈ mapWidth / ratio

export const MIN_SPHERE_SEGMENTS = 256;
export const MAX_SPHERE_SEGMENTS = 768;
