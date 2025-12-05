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

export const HILL_HEIGHT = 0.12;
export const MOUNTAIN_HEIGHT = 0.16;
export const PEAK_HEIGHT = 0.22;

export const HEIGHT_GAIN = 1; // multiplier applied to all non-water heights for visibility
export const NORMAL_SCALE = 0.85; // MeshStandardMaterial normal scale
export const COLOR_NOISE_STRENGTH = 0.08; // +/- variation applied to albedo per-pixel for detail

export const MOUNTAIN_MASK_RADIUS_TILES = 6; // distance (in tiles) that mountain influence can bleed before clamping back to base biome
export const MOUNTAIN_MASK_EXPONENT = 1.2; // soften the falloff so foothills taper without lifting flats

export const MOUNTAIN_SOIL_COLORS: [string, string] = ['#4b553b', '#5a6546'];
export const MOUNTAIN_ROCK_COLORS: [string, string] = ['#5c5c62', '#7a7a80'];
export const MOUNTAIN_SNOW_COLORS: [string, string] = ['#e7ebf0', '#cfd4dd'];

export const HEIGHT_DILATION_RADIUS = 2; // pixels; dilate peaks to survive low-geo sampling
export const HEIGHT_DILATION_PASSES = 1;
export const HEIGHT_SMOOTHING_RADIUS = 1; // pixels; blur to taper edges down from peaks
export const HEIGHT_SMOOTHING_PASSES = 1;
export const COASTAL_FADE_SCALE = 1.05;
export const COASTAL_FADE_POWER = 0.68;

export const MIN_SPHERE_SEGMENTS = 256;
export const MAX_SPHERE_SEGMENTS = 1024;

export type QualityPresetId = 'low' | 'high' | 'high-plus';

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
    nonMountainScale: number;
  };
  mountainDetail: {
    strength: number;
    tiling: number;
    slopeStart: number;
    slopeEnd: number;
    snowStart: number;
    snowEnd: number;
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
      nonMountainScale: 0.35,
    },
    mountainDetail: {
      strength: 0.22,
      tiling: 7,
      slopeStart: 0.18,
      slopeEnd: 0.6,
      snowStart: 0.52,
      snowEnd: 0.78,
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
      nonMountainScale: 0.55,
    },
    mountainDetail: {
      strength: 0.35,
      tiling: 8.5,
      slopeStart: 0.18,
      slopeEnd: 0.62,
      snowStart: 0.55,
      snowEnd: 0.8,
    },
  },
  'high-plus': {
    textureTileScale: 4,
    segmentToTextureRatio: 1.6,
    displacementScale: 0.34,
    normalStrength: 3.5,
    gpuRelief: {
      amplitude: 0.18,
      frequency: 5.5,
      warp: 0.38,
      octaves: 5,
      seed: 1.23,
      nonMountainScale: 0.45,
    },
    mountainDetail: {
      strength: 0.42,
      tiling: 9.5,
      slopeStart: 0.18,
      slopeEnd: 0.64,
      snowStart: 0.6,
      snowEnd: 0.82,
    },
  },
};

const DEFAULT_PRESET_ID: QualityPresetId = 'high';

function isQualityPresetId(value: string | null): value is QualityPresetId {
  return value === 'low' || value === 'high' || value === 'high-plus';
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

export type PaletteId = 'terrain' | 'legacy-natural';

export const PALETTES: Record<PaletteId, Record<string, string>> = {
  terrain: {},
  'legacy-natural': {
    '0': '#f7f7f5',
    '1': '#d63a3a',
    '2': '#4fa34f',
    '3': '#c7b23a',
    '4': '#4a7cc9',
    '5': '#cf4fb6',
    '6': '#3cb7c0',
    a: '#9a2b2b',
    b: '#8ac27a',
    c: '#7fb24d',
    d: '#3c9f7c',
    e: '#2c7a5a',
    f: '#1f4f29',
    g: '#70811f',
    h: '#bcdde5',
    i: '#1b92d4',
    j: '#2ba5df',
    k: '#0a6fb5',
    l: '#d6c9a0',
    m: '#e9d08f',
    n: '#e39b67',
    o: '#d88730',
    p: '#7a7045',
    q: '#8a7a5a',
    r: '#c5c5c5',
    s: '#5b5b5b',
    t: '#12315f',
    u: '#165384',
    v: '#8a3a6e',
    w: '#1f6f6f',
    x: '#6ac86a',
    y: '#3c9f3c',
    z: '#c4732f',
    A: '#dba0c8',
    B: '#c05c9e',
    C: '#c9ad85',
    D: '#8d5ad3',
    E: '#60348f',
    F: '#1a3a1a',
    G: '#b6a27a',
    H: '#e2c75a',
  },
};

const DEFAULT_PALETTE_ID: PaletteId = 'terrain';

function isPaletteId(value: string | null): value is PaletteId {
  return value === 'terrain' || value === 'legacy-natural';
}

function resolvePaletteId(): PaletteId {
  if (typeof window === 'undefined') return DEFAULT_PALETTE_ID;
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('palette');
    if (isPaletteId(fromQuery)) {
      window.localStorage?.setItem('palette', fromQuery);
      return fromQuery;
    }
    const stored = window.localStorage?.getItem('palette');
    if (isPaletteId(stored)) return stored;
  } catch (error) {
    console.warn('Unable to resolve palette from query/localStorage; falling back to default.', error);
  }
  return DEFAULT_PALETTE_ID;
}

export const ACTIVE_PALETTE_ID: PaletteId = resolvePaletteId();
export const ACTIVE_PALETTE: Record<string, string> = PALETTES[ACTIVE_PALETTE_ID];

export const TEXTURE_TILE_SCALE = ACTIVE_QUALITY_PRESET.textureTileScale; // pixels per map tile when generating color/height/normal textures
export const SEGMENT_TO_TEXTURE_RATIO = ACTIVE_QUALITY_PRESET.segmentToTextureRatio; // lower = more geometry; segments ≈ mapWidth / ratio
export const DISPLACEMENT_SCALE = ACTIVE_QUALITY_PRESET.displacementScale; // base displacement (meters relative to radius)
export const NORMAL_STRENGTH = ACTIVE_QUALITY_PRESET.normalStrength; // gradient amplification when deriving normals from height
export const GPU_RELIEF_AMPLITUDE = ACTIVE_QUALITY_PRESET.gpuRelief.amplitude; // strength of procedural relief added on GPU
export const GPU_RELIEF_FREQUENCY = ACTIVE_QUALITY_PRESET.gpuRelief.frequency; // base frequency of relief noise
export const GPU_RELIEF_WARP = ACTIVE_QUALITY_PRESET.gpuRelief.warp; // domain warp strength for relief noise
export const GPU_RELIEF_OCTAVES = ACTIVE_QUALITY_PRESET.gpuRelief.octaves; // octave count for relief noise
export const GPU_RELIEF_SEED = ACTIVE_QUALITY_PRESET.gpuRelief.seed; // seed for relief noise
export const GPU_RELIEF_NON_MOUNTAIN_SCALE = ACTIVE_QUALITY_PRESET.gpuRelief.nonMountainScale; // damp relief outside mountains/hills

export const MOUNTAIN_DETAIL_STRENGTH = ACTIVE_QUALITY_PRESET.mountainDetail.strength; // mix factor for soil/rock/snow detail tinting
export const MOUNTAIN_DETAIL_TILING = ACTIVE_QUALITY_PRESET.mountainDetail.tiling; // repeats across the globe (uv multiplier)
export const MOUNTAIN_DETAIL_SLOPE_START = ACTIVE_QUALITY_PRESET.mountainDetail.slopeStart; // slope where soil starts giving way to rock
export const MOUNTAIN_DETAIL_SLOPE_END = ACTIVE_QUALITY_PRESET.mountainDetail.slopeEnd; // slope where rock fully replaces soil (before snow)
export const MOUNTAIN_DETAIL_SNOW_START = ACTIVE_QUALITY_PRESET.mountainDetail.snowStart; // normalized height where snow begins
export const MOUNTAIN_DETAIL_SNOW_END = ACTIVE_QUALITY_PRESET.mountainDetail.snowEnd; // normalized height where snow fully replaces rock
