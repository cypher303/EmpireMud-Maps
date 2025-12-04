import * as THREE from 'three';
import {
  DEFAULT_TILE_COLOR,
  DEFAULT_WATER_CHAR,
  DISPLACEMENT_SCALE,
  HEIGHT_GAIN,
  HEIGHT_DILATION_PASSES,
  HEIGHT_DILATION_RADIUS,
  HEIGHT_SMOOTHING_PASSES,
  HEIGHT_SMOOTHING_RADIUS,
  HILL_HEIGHT,
  MOUNTAIN_HEIGHT,
  PEAK_HEIGHT,
  PLAIN_HEIGHT,
  ROUGH_LAND_HEIGHT,
} from './config';
import type { ExtendedMap } from './mapLoader';
import type { TerrainEntry, TerrainLookup } from './terrain';

export interface GlobeTextures {
  colorTexture: THREE.Texture;
  heightTexture: THREE.Texture;
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
}

const HEIGHT_RULES: Array<{ keywords: string[]; height: number }> = [
  { keywords: ['peak'], height: PEAK_HEIGHT },
  { keywords: ['mountain'], height: MOUNTAIN_HEIGHT },
  { keywords: ['hill', 'ridge'], height: HILL_HEIGHT },
  { keywords: ['forest', 'jungle', 'swamp', 'trench'], height: ROUGH_LAND_HEIGHT },
];

function isPowerOfTwo(value: number): boolean {
  return (value & (value - 1)) === 0;
}

function hexFromEntry(entry?: { color?: string }): string {
  if (!entry?.color) return DEFAULT_TILE_COLOR;
  return entry.color.startsWith('#') ? entry.color : `#${entry.color}`;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
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

function resolveHeight(entry: TerrainEntry | undefined, isWater: boolean): number {
  if (isWater) return 0;
  const gained = classifyHeight(entry) * HEIGHT_GAIN;
  return clamp01(gained);
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

export function buildGlobeTextures(map: ExtendedMap, terrain: TerrainLookup, waterChars: string[]): GlobeTextures {
  const canvas = document.createElement('canvas');
  canvas.width = map.width;
  canvas.height = map.extendedHeight;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Unable to acquire 2D context for texture building');
  }

  const primaryWaterChar = waterChars[0] ?? DEFAULT_WATER_CHAR;
  const waterColor = hexFromEntry(terrain[primaryWaterChar]) || '#0f4f8f';
  const waterSet = new Set(waterChars);
  const heightData = new Uint8Array(map.width * map.extendedHeight);
  const isWaterMask = new Uint8Array(heightData.length);

  const isPowerOfTwoMap = isPowerOfTwo(map.width) && isPowerOfTwo(map.extendedHeight);
  const wrapMode = isPowerOfTwoMap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;

  map.extendedRows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const tile = row[x];
      const entry = terrain[tile];
      const isWater = waterSet.has(tile);
      const color = hexFromEntry(isWater ? terrain[tile] ?? { color: waterColor } : entry);
      context.fillStyle = color;
      context.fillRect(x, y, 1, 1);

      const heightValue = resolveHeight(entry, isWater);
      const index = y * map.width + x;
      isWaterMask[index] = isWater ? 1 : 0;
      heightData[index] = Math.round(clamp01(heightValue) * 255);
    }
  });

  dilateHeights(heightData, map.width, map.extendedHeight, HEIGHT_DILATION_RADIUS, HEIGHT_DILATION_PASSES);
  const smoothedHeights = new Uint8Array(heightData);
  smoothHeights(smoothedHeights, map.width, map.extendedHeight, HEIGHT_SMOOTHING_RADIUS, HEIGHT_SMOOTHING_PASSES, isWaterMask);
  blendHeights(heightData, smoothedHeights, isWaterMask, 0.65);

  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = 0;
  let landHeightSum = 0;
  let landCount = 0;
  let waterCount = 0;
  let nonZeroCount = 0;
  let peakCount = 0;
  const peakThreshold = 0.9;
  const peakByteThreshold = Math.round(clamp01(peakThreshold) * 255);

  for (let i = 0; i < heightData.length; i += 1) {
    const normalizedHeight = heightData[i] / 255;
    minHeight = Math.min(minHeight, normalizedHeight);
    maxHeight = Math.max(maxHeight, normalizedHeight);
    if (heightData[i] > 0) {
      nonZeroCount += 1;
    }
    if (heightData[i] >= peakByteThreshold) {
      peakCount += 1;
    }
    if (isWaterMask[i]) {
      waterCount += 1;
    } else {
      landCount += 1;
      landHeightSum += normalizedHeight;
    }
  }

  if (minHeight === Number.POSITIVE_INFINITY) {
    minHeight = 0;
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

  const colorTexture = new THREE.DataTexture(
    imageData.data,
    canvas.width,
    canvas.height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );
  colorTexture.colorSpace = THREE.SRGBColorSpace;
  colorTexture.minFilter = THREE.NearestFilter;
  colorTexture.magFilter = THREE.NearestFilter;
  colorTexture.generateMipmaps = false;
  colorTexture.wrapS = wrapMode;
  colorTexture.wrapT = THREE.ClampToEdgeWrapping;
  colorTexture.needsUpdate = true;

  const heightTexture = new THREE.DataTexture(
    heightData,
    map.width,
    map.extendedHeight,
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

  const totalTiles = map.width * map.extendedHeight;
  const stats: TextureBuildStats = {
    width: map.width,
    height: map.extendedHeight,
    isPowerOfTwo: isPowerOfTwoMap,
    wrapMode: isPowerOfTwoMap ? 'repeat' : 'clamp',
    minHeight,
    maxHeight,
    averageLandHeight: landCount > 0 ? landHeightSum / landCount : 0,
    waterRatio: totalTiles > 0 ? waterCount / totalTiles : 0,
    landRatio: totalTiles > 0 ? 1 - waterCount / totalTiles : 0,
    nonZeroRatio: totalTiles > 0 ? nonZeroCount / totalTiles : 0,
    peakRatio: totalTiles > 0 ? peakCount / totalTiles : 0,
    peakThreshold,
    heightGain: HEIGHT_GAIN,
    displacementScale: DISPLACEMENT_SCALE,
  };

  return { colorTexture, heightTexture, stats };
}
