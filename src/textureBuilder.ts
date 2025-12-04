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
} from './config';
import type { ExtendedMap } from './mapLoader';
import type { TerrainEntry, TerrainLookup } from './terrain';
import { applyGpuRelief } from './gpuRelief';

export interface GlobeTextures {
  colorTexture: THREE.Texture;
  heightTexture: THREE.Texture;
  normalTexture: THREE.Texture;
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

function hexFromEntry(entry?: { color?: string }): string {
  if (!entry?.color) return DEFAULT_TILE_COLOR;
  return entry.color.startsWith('#') ? entry.color : `#${entry.color}`;
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
  const primaryWaterChar = waterChars[0] ?? DEFAULT_WATER_CHAR;
  const waterColor = hexFromEntry(terrain[primaryWaterChar]) || '#0f4f8f';
  const waterSet = new Set(waterChars);
  const scaledWidth = map.width * TEXTURE_TILE_SCALE;
  // map.extendedRows is already pole-padded symmetrically; reversing happens in mapLoader. Keep extendedHeight aligned with reversed rows.
  const scaledHeight = map.extendedHeight * TEXTURE_TILE_SCALE;
  const heightData = new Uint8Array(scaledWidth * scaledHeight);
  const isWaterMask = new Uint8Array(heightData.length);
  let missingHeightEntries = 0;

  const targetWidth = nextPowerOfTwo(scaledWidth);
  const targetHeight = nextPowerOfTwo(scaledHeight);
  const isPowerOfTwoMap = isPowerOfTwo(targetWidth) && isPowerOfTwo(targetHeight);
  const wrapMode = isPowerOfTwoMap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  const colorData = new Uint8ClampedArray(scaledWidth * scaledHeight * 4);

  map.extendedRows.forEach((row, tileY) => {
    for (let x = 0; x < row.length; x += 1) {
      const tile = row[x];
      const entry = terrain[tile];
      const isWater = waterSet.has(tile);
      const colorHex = hexFromEntry(isWater ? terrain[tile] ?? { color: waterColor } : entry);
      const baseColor = rgbFromHex(colorHex);

      const heightValue = resolveHeight(entry, isWater, () => {
        if (!isWater) missingHeightEntries += 1;
      });
      const heightByte = Math.round(clamp01(heightValue) * 255);
      const tileSeed = tile.charCodeAt(0) || 0;

      for (let oy = 0; oy < TEXTURE_TILE_SCALE; oy += 1) {
        const py = tileY * TEXTURE_TILE_SCALE + oy;
        const rowOffset = py * scaledWidth;
        for (let ox = 0; ox < TEXTURE_TILE_SCALE; ox += 1) {
          const px = x * TEXTURE_TILE_SCALE + ox;
          const idx = rowOffset + px;
          const noise = hashNoise(px, py, tileSeed);
          const variation = 1 + (noise - 0.5) * COLOR_NOISE_STRENGTH * 2;

          const colorIdx = idx * 4;
          colorData[colorIdx] = Math.max(0, Math.min(255, Math.round(baseColor.r * variation)));
          colorData[colorIdx + 1] = Math.max(0, Math.min(255, Math.round(baseColor.g * variation)));
          colorData[colorIdx + 2] = Math.max(0, Math.min(255, Math.round(baseColor.b * variation)));
          colorData[colorIdx + 3] = 255;

          isWaterMask[idx] = isWater ? 1 : 0;
          heightData[idx] = heightByte;
        }
      }
    }
  });

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

  const paddedHeightData =
    targetWidth === scaledWidth && targetHeight === scaledHeight
      ? heightData
      : padChannelCentered(heightData, scaledWidth, scaledHeight, targetWidth, targetHeight);
  const paddedWaterMask =
    targetWidth === scaledWidth && targetHeight === scaledHeight
      ? isWaterMask
      : padChannelCentered(isWaterMask, scaledWidth, scaledHeight, targetWidth, targetHeight);

  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = 0;
  let landHeightSum = 0;
  let landCount = 0;
  let waterCount = 0;
  let nonZeroCount = 0;
  let peakCount = 0;
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
  const reliefHeightData = applyGpuRelief(paddedHeightData, targetWidth, targetHeight, {
    amplitude: GPU_RELIEF_AMPLITUDE,
    frequency: GPU_RELIEF_FREQUENCY,
    warp: GPU_RELIEF_WARP,
    octaves: GPU_RELIEF_OCTAVES,
    seed: GPU_RELIEF_SEED,
  });
  const normalData = buildNormalMap(reliefHeightData, targetWidth, targetHeight, NORMAL_STRENGTH);

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
    normalData,
    targetWidth,
    targetHeight,
    THREE.RGBFormat,
    THREE.UnsignedByteType
  );
  normalTexture.colorSpace = THREE.NoColorSpace;
  normalTexture.minFilter = THREE.NearestFilter;
  normalTexture.magFilter = THREE.NearestFilter;
  normalTexture.generateMipmaps = false;
  normalTexture.wrapS = wrapMode;
  normalTexture.wrapT = THREE.ClampToEdgeWrapping;
  normalTexture.needsUpdate = true;

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
    peakThreshold,
    heightGain: HEIGHT_GAIN,
    displacementScale: DISPLACEMENT_SCALE,
    normalStrength: NORMAL_STRENGTH,
    missingHeightEntries,
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

  return { colorTexture, heightTexture, normalTexture, heightPreviewDataUrl, stats };
}
