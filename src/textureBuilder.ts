import * as THREE from 'three';
import {
  ACTIVE_PALETTE,
  DEFAULT_TILE_COLOR,
  DISPLACEMENT_SCALE,
  HEIGHT_GAIN,
  HEIGHT_DILATION_PASSES,
  HEIGHT_DILATION_RADIUS,
  HEIGHT_SMOOTHING_PASSES,
  HEIGHT_SMOOTHING_RADIUS,
  HILL_HEIGHT,
  MOUNTAIN_HEIGHT,
  NORMAL_STRENGTH,
  PEAK_HEIGHT,
  PLAIN_HEIGHT,
  ROUGH_LAND_HEIGHT,
  TEXTURE_TILE_SCALE,
  COLOR_NOISE_STRENGTH,
  GPU_RELIEF_AMPLITUDE,
  GPU_RELIEF_FREQUENCY,
  GPU_RELIEF_OCTAVES,
  GPU_RELIEF_SEED,
  GPU_RELIEF_WARP,
  COASTAL_FADE_POWER,
  COASTAL_FADE_SCALE,
  GPU_RELIEF_NON_MOUNTAIN_SCALE,
  MOUNTAIN_MASK_RADIUS_TILES,
  MOUNTAIN_MASK_EXPONENT,
} from './config';
import type { ExtendedMap } from './mapLoader';
import { selectPrimaryWaterChar, type TerrainEntry, type TerrainLookup, type WaterPalette } from './terrain';
import { applyGpuRelief } from './gpuRelief';

export interface GlobeTextures {
  colorTexture: THREE.Texture;
  heightTexture: THREE.Texture;
  normalTexture: THREE.Texture;
  mountainMaskTexture: THREE.Texture;
  heightPreviewDataUrl?: string;
  stats: TextureBuildStats;
}

export interface TextureBuildStats {
  width: number;
  height: number;
  isPowerOfTwo: boolean;
  wrapMode: 'repeat' | 'clamp';
  minHeight: number;
  maxHeight: number;
  averageLandHeight: number;
  waterRatio: number;
  landRatio: number;
  nonZeroRatio: number;
  peakRatio: number;
  peakThreshold: number;
  heightGain: number;
  displacementScale: number;
  normalStrength: number;
  missingHeightEntries: number;
  waterMaxHeight: number;
  waterNonZeroRatio: number;
  mountainMaskRatio: number;
  mountainInfluenceAverage: number;
}

const HEIGHT_RULES: Array<{ keywords: string[]; height: number }> = [
  { keywords: ['peak'], height: PEAK_HEIGHT },
  { keywords: ['mountain'], height: MOUNTAIN_HEIGHT },
  { keywords: ['hill', 'ridge'], height: HILL_HEIGHT },
  { keywords: ['forest', 'jungle', 'swamp', 'trench'], height: ROUGH_LAND_HEIGHT },
];

const BIOME_JITTER: Record<string, number> = {
  // token-specific overrides
  i: 0.15, // river
  j: 0.15, // oasis
  k: 0.12, // ocean
  t: 0.1,
  u: 0.1,
  w: 0.1,
  l: 0.08, // wheat/barley
  m: 0.1, // desert
  n: 0.1,
  o: 0.1,
  p: 0.18, // trench
  f: 0.2, // forest
  d: 0.18, // jungle
  e: 0.16, // swamp
  q: 0.14, // mountain
  G: 0.16, // peak
};

const BIOME_GROUP_JITTER: Array<{ tokens: string[]; jitter: number }> = [
  { tokens: ['4', 'i', 'j', 'k', 't', 'u', 'w'], jitter: 0.12 }, // ocean/shallows
  { tokens: ['l', 'm', 'n', 'o', 'p', 'C', 'H'], jitter: 0.1 }, // desert
  { tokens: ['2', 'b', 'c', 'd', 'e', 'f', 'g', 'x', 'y', 'F'], jitter: 0.16 }, // forest/green
  { tokens: ['q', 'G'], jitter: 0.14 }, // peaks
];

function jitterStrengthForTile(tile: string): number {
  if (BIOME_JITTER[tile] !== undefined) return BIOME_JITTER[tile];
  for (const group of BIOME_GROUP_JITTER) {
    if (group.tokens.includes(tile)) {
      return group.jitter;
    }
  }
  return 0.1;
}

function isPowerOfTwo(value: number): boolean {
  return (value & (value - 1)) === 0;
}

function nextPowerOfTwo(value: number): number {
  if (value <= 0) return 1;
  return 1 << Math.ceil(Math.log2(value));
}

function padRgbaCentered(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number
): Uint8ClampedArray {
  const target = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  const offsetX = Math.floor((targetWidth - width) / 2);
  const offsetY = Math.floor((targetHeight - height) / 2);
  for (let y = 0; y < targetHeight; y += 1) {
    const srcY = Math.min(Math.max(y - offsetY, 0), height - 1);
    for (let x = 0; x < targetWidth; x += 1) {
      const srcX = Math.min(Math.max(x - offsetX, 0), width - 1);
      const srcIdx = (srcY * width + srcX) * 4;
      const dstIdx = (y * targetWidth + x) * 4;
      target[dstIdx] = data[srcIdx];
      target[dstIdx + 1] = data[srcIdx + 1];
      target[dstIdx + 2] = data[srcIdx + 2];
      target[dstIdx + 3] = data[srcIdx + 3];
    }
  }
  return target;
}

function padChannelCentered(
  data: Uint8Array,
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number
): Uint8Array {
  const target = new Uint8Array(targetWidth * targetHeight);
  const offsetX = Math.floor((targetWidth - width) / 2);
  const offsetY = Math.floor((targetHeight - height) / 2);
  for (let y = 0; y < targetHeight; y += 1) {
    const srcY = Math.min(Math.max(y - offsetY, 0), height - 1);
    for (let x = 0; x < targetWidth; x += 1) {
      const srcX = Math.min(Math.max(x - offsetX, 0), width - 1);
      target[y * targetWidth + x] = data[srcY * width + srcX];
    }
  }
  return target;
}

function hashNoise(x: number, y: number, seed: number): number {
  let h = x * 374761393 + y * 668265263 + seed * 1446641;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h >>> 0) / 0xffffffff;
}

function buildNormalMap(heightData: Uint8Array, width: number, height: number, strength: number): Uint8Array {
  const normals = new Uint8Array(width * height * 3);
  const sample = (x: number, y: number) => {
    const clampedX = Math.min(Math.max(x, 0), width - 1);
    const clampedY = Math.min(Math.max(y, 0), height - 1);
    return heightData[clampedY * width + clampedX] / 255;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const left = sample(x - 1, y);
      const right = sample(x + 1, y);
      const up = sample(x, y - 1);
      const down = sample(x, y + 1);

      const dx = (right - left) * strength;
      const dy = (down - up) * strength;

      const nx = -dx;
      const ny = -dy;
      const nz = 1;
      const invLen = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      const nxc = nx * invLen;
      const nyc = ny * invLen;
      const nzc = nz * invLen;

      const idx = (y * width + x) * 3;
      normals[idx] = Math.round((nxc * 0.5 + 0.5) * 255);
      normals[idx + 1] = Math.round((nyc * 0.5 + 0.5) * 255);
      normals[idx + 2] = Math.round((nzc * 0.5 + 0.5) * 255);
    }
  }

  return normals;
}

function addAlphaToNormals(normals: Uint8Array, width: number, height: number, alpha = 255): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < normals.length; i += 3, j += 4) {
    rgba[j] = normals[i];
    rgba[j + 1] = normals[i + 1];
    rgba[j + 2] = normals[i + 2];
    rgba[j + 3] = alpha;
  }
  return rgba;
}

function hexFromEntry(entry?: { color?: string }): string {
  if (!entry?.color) return DEFAULT_TILE_COLOR;
  return entry.color.startsWith('#') ? entry.color : `#${entry.color}`;
}

function normalizeColorHex(value?: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

function rgbFromHex(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.startsWith('#') ? hex.slice(1) : hex;
  const value = parseInt(normalized, 16);
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clampByte(value: number): number {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return Math.round(value);
}

function validateWaterFlatness(
  heightData: Uint8Array,
  waterMask: Uint8Array,
  tolerance = 1
): { maxWaterHeight: number; waterNonZeroRatio: number } {
  let maxWaterHeight = 0;
  let waterNonZeroCount = 0;
  let waterCount = 0;

  for (let i = 0; i < heightData.length; i += 1) {
    if (!waterMask[i]) continue;
    waterCount += 1;
    const value = heightData[i];
    if (value > maxWaterHeight) {
      maxWaterHeight = value;
    }
    if (value > tolerance) {
      waterNonZeroCount += 1;
    }
  }

  return {
    maxWaterHeight: maxWaterHeight / 255,
    waterNonZeroRatio: waterCount > 0 ? waterNonZeroCount / waterCount : 0,
  };
}

function buildWaterPalette(
  waterChars: string[],
  palette: WaterPalette,
  terrain: TerrainLookup,
  fallbackHex: string,
  paletteOverride?: Record<string, string>
): Map<string, { hex: string; rgb: { r: number; g: number; b: number } }> {
  if (!waterChars.length) {
    throw new Error('Cannot build a water palette without water characters.');
  }
  const tokens = Array.from(new Set(waterChars));
  const map = new Map<string, { hex: string; rgb: { r: number; g: number; b: number } }>();

  tokens.forEach((token) => {
    const hex =
      normalizeColorHex(paletteOverride?.[token]) ??
      normalizeColorHex(palette[token]) ??
      normalizeColorHex(terrain?.[token]?.color) ??
      normalizeColorHex(fallbackHex);
    if (hex) {
      map.set(token, { hex, rgb: rgbFromHex(hex) });
    }
  });

  return map;
}

function mixChannel(value: number, target: number, blend: number): number {
  return clampByte(lerp(value, target, clamp01(blend)));
}

function normalizeExplicitHeight(value: number | undefined): number | null {
  if (value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  return clamp01(value);
}

function classifyHeight(entry: TerrainEntry | undefined): number {
  const description = entry?.description?.toLowerCase() ?? '';
  for (const rule of HEIGHT_RULES) {
    if (rule.keywords.some((keyword) => description.includes(keyword))) {
      return rule.height;
    }
  }
  return PLAIN_HEIGHT;
}

function resolveHeight(entry: TerrainEntry | undefined, isWater: boolean, onMissingHeight: () => void): number {
  if (isWater) return 0;
  const explicit = normalizeExplicitHeight(entry?.height);
  if (explicit !== null) {
    return clamp01(explicit * HEIGHT_GAIN);
  }
  onMissingHeight();
  const gained = classifyHeight(entry) * HEIGHT_GAIN;
  return clamp01(gained);
}

function isMountainTile(tile: string, entry: TerrainEntry | undefined, normalizedHeight: number, isWater: boolean): boolean {
  if (isWater) return false;
  const description = entry?.description?.toLowerCase() ?? '';
  if (description.includes('mountain') || description.includes('peak') || description.includes('hill') || description.includes('ridge')) {
    return true;
  }
  return normalizedHeight >= HILL_HEIGHT * HEIGHT_GAIN;
}

function dilateHeights(data: Uint8Array, width: number, height: number, radius: number, passes: number): void {
  if (radius <= 0 || passes <= 0) return;
  const tmp = new Uint8Array(data.length);

  for (let pass = 0; pass < passes; pass += 1) {
    tmp.set(data);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        let maxValue = tmp[idx];
        for (let dy = -radius; dy <= radius; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -radius; dx <= radius; dx += 1) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            const nIdx = ny * width + nx;
            if (tmp[nIdx] > maxValue) {
              maxValue = tmp[nIdx];
            }
          }
        }
        data[idx] = maxValue;
      }
    }
  }
}

function smoothHeights(
  data: Uint8Array,
  width: number,
  height: number,
  radius: number,
  passes: number,
  waterMask?: Uint8Array
): void {
  if (radius <= 0 || passes <= 0) return;
  const tmp = new Uint8Array(data.length);

  for (let pass = 0; pass < passes; pass += 1) {
    tmp.set(data);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        if (waterMask?.[idx]) {
          data[idx] = 0;
          continue;
        }
        let sum = 0;
        let count = 0;
        for (let dy = -radius; dy <= radius; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -radius; dx <= radius; dx += 1) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            const nIdx = ny * width + nx;
            if (waterMask?.[nIdx]) continue;
            sum += tmp[nIdx];
            count += 1;
          }
        }
        if (count === 0) {
          data[idx] = tmp[idx];
        } else {
          data[idx] = Math.round(sum / count);
        }
      }
    }
  }
}

function blendHeights(target: Uint8Array, smoothed: Uint8Array, waterMask: Uint8Array, blend: number): void {
  for (let i = 0; i < target.length; i += 1) {
    if (waterMask[i]) {
      target[i] = 0;
      continue;
    }
    const delta = smoothed[i] - target[i];
    target[i] = Math.round(target[i] + delta * blend);
  }
}

function buildMountainInfluenceMask(
  mountainMask: Uint8Array,
  width: number,
  height: number,
  radius: number,
  exponent: number
): Float32Array {
  const influence = new Float32Array(mountainMask.length);
  if (radius <= 0) return influence;

  const maxDist = Math.max(1, radius);
  const distance = new Float32Array(mountainMask.length);
  const far = maxDist * 4;

  for (let i = 0; i < mountainMask.length; i += 1) {
    distance[i] = mountainMask[i] > 0 ? 0 : far;
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const current = distance[idx];
      if (current === 0) continue;
      const left = x > 0 ? distance[idx - 1] + 1 : far;
      const up = y > 0 ? distance[idx - width] + 1 : far;
      distance[idx] = Math.min(current, left, up);
    }
  }

  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const idx = y * width + x;
      const current = distance[idx];
      if (current === 0) continue;
      const right = x + 1 < width ? distance[idx + 1] + 1 : far;
      const down = y + 1 < height ? distance[idx + width] + 1 : far;
      distance[idx] = Math.min(current, right, down, current);
    }
  }

  for (let i = 0; i < distance.length; i += 1) {
    const clamped = Math.min(distance[i], maxDist);
    let weight = 1 - clamped / maxDist;
    if (weight < 0) weight = 0;
    if (exponent !== 1) {
      weight = Math.pow(weight, exponent);
    }
    influence[i] = clamp01(weight);
  }

  return influence;
}

function applyMountainClamp(
  target: Uint8Array,
  base: Uint8Array,
  influence: Float32Array,
  waterMask: Uint8Array
): void {
  if (target.length !== base.length || base.length !== influence.length) return;
  const resolveBiomeAllowance = (baseHeightByte: number): number => {
    const normalized = clamp01(baseHeightByte / 255);
    if (normalized >= HILL_HEIGHT) return 1;
    if (normalized >= ROUGH_LAND_HEIGHT) return 0.45;
    if (normalized >= PLAIN_HEIGHT) return 0.12;
    return 0;
  };
  for (let i = 0; i < target.length; i += 1) {
    if (waterMask[i]) {
      target[i] = 0;
      continue;
    }
    const biomeAllowance = resolveBiomeAllowance(base[i]);
    const weight = clamp01(influence[i] * biomeAllowance);
    if (weight <= 0) {
      target[i] = base[i];
      continue;
    }
    const delta = target[i] - base[i];
    target[i] = Math.round(base[i] + delta * weight);
  }
}

export function buildGlobeTextures(
  map: ExtendedMap,
  terrain: TerrainLookup,
  waterChars: string[],
  renderer?: THREE.WebGLRenderer,
  waterPalette: WaterPalette = {},
  paletteOverride: Record<string, string> = ACTIVE_PALETTE
): GlobeTextures {
  const primaryWaterChar = selectPrimaryWaterChar(waterChars, terrain);
  const primaryWaterHex =
    normalizeColorHex(paletteOverride[primaryWaterChar]) ??
    normalizeColorHex(waterPalette[primaryWaterChar]) ??
    normalizeColorHex(terrain[primaryWaterChar]?.color) ??
    '#0f4f8f';
  const waterSet = new Set(waterChars);
  const waterPaletteMap = buildWaterPalette(waterChars, waterPalette, terrain, primaryWaterHex, paletteOverride);
  const primaryWaterColor = waterPaletteMap.get(primaryWaterChar)?.hex ?? primaryWaterHex;
  const primaryWaterRgb = rgbFromHex(primaryWaterColor);
  const scaledWidth = map.width * TEXTURE_TILE_SCALE;
  // map.extendedRows is already pole-padded symmetrically; reversing happens in mapLoader. Keep extendedHeight aligned with reversed rows.
  const scaledHeight = map.extendedHeight * TEXTURE_TILE_SCALE;
  const heightData = new Uint8Array(scaledWidth * scaledHeight);
  const isWaterMask = new Uint8Array(heightData.length);
  const mountainMask = new Uint8Array(heightData.length);
  let missingHeightEntries = 0;

  const targetWidth = nextPowerOfTwo(scaledWidth);
  const targetHeight = nextPowerOfTwo(scaledHeight);
  const isPowerOfTwoMap = isPowerOfTwo(targetWidth) && isPowerOfTwo(targetHeight);
  const wrapMode = isPowerOfTwoMap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  const colorData = new Uint8ClampedArray(scaledWidth * scaledHeight * 4);

  const waterEdgeMask = new Float32Array(scaledWidth * scaledHeight);

  map.extendedRows.forEach((row, tileY) => {
    for (let x = 0; x < row.length; x += 1) {
      const tile = row[x];
      const entry = terrain[tile];
      const isWater = waterSet.has(tile);
      const overrideHex = normalizeColorHex(paletteOverride?.[tile]);
      const baseColor = isWater
        ? overrideHex
          ? rgbFromHex(overrideHex)
          : waterPaletteMap.get(tile)?.rgb ?? primaryWaterRgb
        : rgbFromHex(overrideHex ?? hexFromEntry(entry));

      const heightValue = resolveHeight(entry, isWater, () => {
        if (!isWater) missingHeightEntries += 1;
      });
      const heightByte = Math.round(clamp01(heightValue) * 255);
      const tileSeed = tile.charCodeAt(0) || 0;
      const jitterStrength = COLOR_NOISE_STRENGTH * jitterStrengthForTile(tile);
      const isMountain = isMountainTile(tile, entry, heightValue, isWater);

      for (let oy = 0; oy < TEXTURE_TILE_SCALE; oy += 1) {
        const py = tileY * TEXTURE_TILE_SCALE + oy;
        const rowOffset = py * scaledWidth;
        for (let ox = 0; ox < TEXTURE_TILE_SCALE; ox += 1) {
          const px = x * TEXTURE_TILE_SCALE + ox;
          const idx = rowOffset + px;
          const noise = hashNoise(px, py, tileSeed);
          const variation = 1 + (noise - 0.5) * jitterStrength * 2;

          const colorIdx = idx * 4;
          colorData[colorIdx] = Math.max(0, Math.min(255, Math.round(baseColor.r * variation)));
          colorData[colorIdx + 1] = Math.max(0, Math.min(255, Math.round(baseColor.g * variation)));
          colorData[colorIdx + 2] = Math.max(0, Math.min(255, Math.round(baseColor.b * variation)));
          colorData[colorIdx + 3] = 255;

          isWaterMask[idx] = isWater ? 1 : 0;
          mountainMask[idx] = isMountain ? 1 : 0;
          heightData[idx] = heightByte;
          // Mark water mask for fade (normalized 0..1)
          waterEdgeMask[idx] = isWater ? 1 : 0;
        }
      }
    }
  });

  const baseHeightData = new Uint8Array(heightData);
  dilateHeights(
    heightData,
    scaledWidth,
    scaledHeight,
    HEIGHT_DILATION_RADIUS * TEXTURE_TILE_SCALE,
    HEIGHT_DILATION_PASSES
  );
  const smoothedHeights = new Uint8Array(heightData);
  smoothHeights(
    smoothedHeights,
    scaledWidth,
    scaledHeight,
    HEIGHT_SMOOTHING_RADIUS * TEXTURE_TILE_SCALE,
    HEIGHT_SMOOTHING_PASSES,
    isWaterMask
  );
  blendHeights(heightData, smoothedHeights, isWaterMask, 0.65);

  const mountainInfluenceRadius = Math.max(1, Math.round(MOUNTAIN_MASK_RADIUS_TILES * TEXTURE_TILE_SCALE));
  const mountainInfluence = buildMountainInfluenceMask(
    mountainMask,
    scaledWidth,
    scaledHeight,
    mountainInfluenceRadius,
    MOUNTAIN_MASK_EXPONENT
  );
  applyMountainClamp(heightData, baseHeightData, mountainInfluence, isWaterMask);

  // Coastal fade: compute distance transform on water mask and blend heights/colors near shores
  const distanceField = new Float32Array(waterEdgeMask.length);
  const maxDist = Math.hypot(scaledWidth, scaledHeight);
  // Initialize distance field (0 for water, large for land)
  for (let i = 0; i < waterEdgeMask.length; i += 1) {
    distanceField[i] = waterEdgeMask[i] > 0 ? 0 : maxDist;
  }
  // 2-pass distance approximation (taxicab-like)
  for (let y = 0; y < scaledHeight; y += 1) {
    for (let x = 0; x < scaledWidth; x += 1) {
      const idx = y * scaledWidth + x;
      const current = distanceField[idx];
      if (current === 0) continue;
      const left = x > 0 ? distanceField[idx - 1] + 1 : maxDist;
      const up = y > 0 ? distanceField[idx - scaledWidth] + 1 : maxDist;
      distanceField[idx] = Math.min(current, left, up);
    }
  }
  for (let y = scaledHeight - 1; y >= 0; y -= 1) {
    for (let x = scaledWidth - 1; x >= 0; x -= 1) {
      const idx = y * scaledWidth + x;
      const current = distanceField[idx];
      if (current === 0) continue;
      const right = x + 1 < scaledWidth ? distanceField[idx + 1] + 1 : maxDist;
      const down = y + 1 < scaledHeight ? distanceField[idx + scaledWidth] + 1 : maxDist;
      distanceField[idx] = Math.min(current, right, down, current);
    }
  }

  const coastalBlend = (distance: number): number => {
    const maxFadeDistance = Math.max(1, TEXTURE_TILE_SCALE * 8 * COASTAL_FADE_SCALE);
    if (distance > maxFadeDistance) return 0;
    const normalized = distance / maxFadeDistance;
    return 1 - Math.pow(Math.min(1, normalized), COASTAL_FADE_POWER);
  };

  // Apply coastal fade to color and height: blend toward water at shorelines
  for (let y = 0; y < scaledHeight; y += 1) {
    for (let x = 0; x < scaledWidth; x += 1) {
      const idx = y * scaledWidth + x;
      if (waterEdgeMask[idx] > 0) continue; // water stays water
      const dist = distanceField[idx];
      if (dist === 0 || dist > scaledWidth) continue;
      const blend = coastalBlend(dist);
      if (blend <= 0) continue;

      // Color fade toward primary water color
      const colorIdx = idx * 4;
      const waterRgb = primaryWaterRgb;
      colorData[colorIdx] = Math.round(colorData[colorIdx] * (1 - blend) + waterRgb.r * blend);
      colorData[colorIdx + 1] = Math.round(colorData[colorIdx + 1] * (1 - blend) + waterRgb.g * blend);
      colorData[colorIdx + 2] = Math.round(colorData[colorIdx + 2] * (1 - blend) + waterRgb.b * blend);

      // Height taper toward zero
      heightData[idx] = Math.round(heightData[idx] * (1 - blend));
    }
  }

  const mountainInfluenceBytes = new Uint8Array(mountainInfluence.length);
  for (let i = 0; i < mountainInfluence.length; i += 1) {
    mountainInfluenceBytes[i] = clampByte(Math.round(clamp01(mountainInfluence[i]) * 255));
  }

  const paddedHeightData =
    targetWidth === scaledWidth && targetHeight === scaledHeight
      ? heightData
      : padChannelCentered(heightData, scaledWidth, scaledHeight, targetWidth, targetHeight);
  const paddedWaterMask =
    targetWidth === scaledWidth && targetHeight === scaledHeight
      ? isWaterMask
      : padChannelCentered(isWaterMask, scaledWidth, scaledHeight, targetWidth, targetHeight);
  const paddedMountainMask =
    targetWidth === scaledWidth && targetHeight === scaledHeight
      ? mountainInfluenceBytes
      : padChannelCentered(mountainInfluenceBytes, scaledWidth, scaledHeight, targetWidth, targetHeight);

  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = 0;
  let landHeightSum = 0;
  let landCount = 0;
  let waterCount = 0;
  let nonZeroCount = 0;
  let peakCount = 0;
  let mountainMaskCount = 0;
  let mountainInfluenceSum = 0;
  const peakThreshold = 0.9;
  const peakByteThreshold = Math.round(clamp01(peakThreshold) * 255);

  for (let i = 0; i < paddedHeightData.length; i += 1) {
    const normalizedHeight = paddedHeightData[i] / 255;
    minHeight = Math.min(minHeight, normalizedHeight);
    maxHeight = Math.max(maxHeight, normalizedHeight);
    if (paddedHeightData[i] > 0) {
      nonZeroCount += 1;
    }
    if (paddedHeightData[i] >= peakByteThreshold) {
      peakCount += 1;
    }
    if (paddedWaterMask[i]) {
      waterCount += 1;
    } else {
      landCount += 1;
      landHeightSum += normalizedHeight;
    }
    const mountainValue = paddedMountainMask[i];
    if (mountainValue > 0) {
      mountainMaskCount += 1;
    }
    mountainInfluenceSum += mountainValue;
  }

  if (minHeight === Number.POSITIVE_INFINITY) {
    minHeight = 0;
  }

  const imageData =
    targetWidth === scaledWidth && targetHeight === scaledHeight
      ? new ImageData(colorData, scaledWidth, scaledHeight)
      : new ImageData(
          padRgbaCentered(colorData, scaledWidth, scaledHeight, targetWidth, targetHeight),
          targetWidth,
          targetHeight
        );
  const reliefHeightData = applyGpuRelief(
    paddedHeightData,
    targetWidth,
    targetHeight,
    {
      amplitude: GPU_RELIEF_AMPLITUDE,
      frequency: GPU_RELIEF_FREQUENCY,
      warp: GPU_RELIEF_WARP,
      octaves: GPU_RELIEF_OCTAVES,
      seed: GPU_RELIEF_SEED,
      nonMountainScale: GPU_RELIEF_NON_MOUNTAIN_SCALE,
    },
    renderer,
    paddedWaterMask,
    paddedMountainMask
  );
  const normalData = buildNormalMap(reliefHeightData, targetWidth, targetHeight, NORMAL_STRENGTH);
  const normalDataRgba = addAlphaToNormals(normalData, targetWidth, targetHeight);
  const waterValidation = validateWaterFlatness(reliefHeightData, paddedWaterMask);

  const colorTexture = new THREE.DataTexture(imageData.data, targetWidth, targetHeight, THREE.RGBAFormat, THREE.UnsignedByteType);
  colorTexture.colorSpace = THREE.SRGBColorSpace;
  colorTexture.minFilter = THREE.NearestFilter;
  colorTexture.magFilter = THREE.NearestFilter;
  colorTexture.generateMipmaps = false;
  colorTexture.wrapS = wrapMode;
  colorTexture.wrapT = THREE.ClampToEdgeWrapping;
  colorTexture.needsUpdate = true;

  const heightTexture = new THREE.DataTexture(
    reliefHeightData,
    targetWidth,
    targetHeight,
    THREE.RedFormat,
    THREE.UnsignedByteType
  );
  heightTexture.colorSpace = THREE.NoColorSpace;
  heightTexture.minFilter = THREE.NearestFilter;
  heightTexture.magFilter = THREE.NearestFilter;
  heightTexture.generateMipmaps = false;
  heightTexture.wrapS = wrapMode;
  heightTexture.wrapT = THREE.ClampToEdgeWrapping;
  heightTexture.needsUpdate = true;

  const normalTexture = new THREE.DataTexture(
    normalDataRgba,
    targetWidth,
    targetHeight,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );
  normalTexture.colorSpace = THREE.NoColorSpace;
  (normalTexture as any).internalFormat = 'RGBA8'; // Sized format for texStorage2D on WebGL2
  normalTexture.minFilter = THREE.NearestFilter;
  normalTexture.magFilter = THREE.NearestFilter;
  normalTexture.generateMipmaps = false;
  normalTexture.wrapS = wrapMode;
  normalTexture.wrapT = THREE.ClampToEdgeWrapping;
  normalTexture.needsUpdate = true;

  const mountainMaskTexture = new THREE.DataTexture(
    paddedMountainMask,
    targetWidth,
    targetHeight,
    THREE.RedFormat,
    THREE.UnsignedByteType
  );
  mountainMaskTexture.colorSpace = THREE.NoColorSpace;
  mountainMaskTexture.minFilter = THREE.NearestFilter;
  mountainMaskTexture.magFilter = THREE.NearestFilter;
  mountainMaskTexture.generateMipmaps = false;
  mountainMaskTexture.wrapS = wrapMode;
  mountainMaskTexture.wrapT = THREE.ClampToEdgeWrapping;
  mountainMaskTexture.needsUpdate = true;

  const totalTiles = targetWidth * targetHeight;
  const stats: TextureBuildStats = {
    width: targetWidth,
    height: targetHeight,
    isPowerOfTwo: isPowerOfTwoMap,
    wrapMode: isPowerOfTwoMap ? 'repeat' : 'clamp',
    minHeight,
    maxHeight,
    averageLandHeight: landCount > 0 ? landHeightSum / landCount : 0,
    waterRatio: totalTiles > 0 ? waterCount / totalTiles : 0,
    landRatio: totalTiles > 0 ? 1 - waterCount / totalTiles : 0,
    nonZeroRatio: totalTiles > 0 ? nonZeroCount / totalTiles : 0,
    peakRatio: totalTiles > 0 ? peakCount / totalTiles : 0,
    mountainMaskRatio: totalTiles > 0 ? mountainMaskCount / totalTiles : 0,
    mountainInfluenceAverage: totalTiles > 0 ? mountainInfluenceSum / (totalTiles * 255) : 0,
    peakThreshold,
    heightGain: HEIGHT_GAIN,
    displacementScale: DISPLACEMENT_SCALE,
    normalStrength: NORMAL_STRENGTH,
    missingHeightEntries,
    waterMaxHeight: waterValidation.maxWaterHeight,
    waterNonZeroRatio: waterValidation.waterNonZeroRatio,
  };

  // Build a small height preview (grayscale) for debugging
  const previewSize = 256;
  const previewCanvas = document.createElement('canvas');
  previewCanvas.width = previewSize;
  previewCanvas.height = previewSize;
  const previewCtx = previewCanvas.getContext('2d');
  let heightPreviewDataUrl: string | undefined;
  if (previewCtx) {
    const previewImage = previewCtx.createImageData(previewSize, previewSize);
    for (let y = 0; y < previewSize; y += 1) {
      const srcY = Math.floor((y / previewSize) * targetHeight);
      for (let x = 0; x < previewSize; x += 1) {
        const srcX = Math.floor((x / previewSize) * targetWidth);
        const srcIdx = srcY * targetWidth + srcX;
        const value = paddedHeightData[srcIdx];
        const dstIdx = (y * previewSize + x) * 4;
        previewImage.data[dstIdx] = value;
        previewImage.data[dstIdx + 1] = value;
        previewImage.data[dstIdx + 2] = value;
        previewImage.data[dstIdx + 3] = 255;
      }
    }
    previewCtx.putImageData(previewImage, 0, 0);
    heightPreviewDataUrl = previewCanvas.toDataURL('image/png');
  }

  return { colorTexture, heightTexture, normalTexture, mountainMaskTexture, heightPreviewDataUrl, stats };
}
