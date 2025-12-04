export const MAP_URL = '/map.txt';
export const TERRAIN_MAP_URL = '/terrain-map.json';
export const WATER_CHARS_URL = '/water-chars.json';

export const DEFAULT_WATER_CHAR = 'k';
export const DEFAULT_TILE_COLOR = '#2a2f3a';

export const POLE_PADDING_FACTOR = 1 / 6;
export const PLAIN_HEIGHT = 0.05;
export const ROUGH_LAND_HEIGHT = 0.2;
export const HILL_HEIGHT = 0.45;
export const MOUNTAIN_HEIGHT = 0.9;
export const PEAK_HEIGHT = 1;
export const HEIGHT_GAIN = 1.8; // multiplier applied to all non-water heights for visibility
export const DISPLACEMENT_SCALE = 1; // base displacement (meters relative to radius)
export const DISPLACEMENT_EXAGGERATION = 2.5; // toggle multiplier for debug visibility

export const HEIGHT_DILATION_RADIUS = 2; // pixels; dilate peaks to survive low-geo sampling
export const HEIGHT_DILATION_PASSES = 1;

export const MIN_SPHERE_SEGMENTS = 256;
export const MAX_SPHERE_SEGMENTS = 768;
export const SEGMENT_TO_TEXTURE_RATIO = 3.5; // lower = more geometry; segments ≈ mapWidth / ratio
