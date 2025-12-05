import * as THREE from 'three';
import { DEFAULT_TILE_COLOR, DEFAULT_WATER_CHAR } from './config';
import type { ExtendedMap } from './mapLoader';
import type { TerrainLookup } from './terrain';

const NORMAL_STRENGTH = 6;
const DISPLACEMENT_SCALE = 0.18;

export interface GlobeTextures {
  colorTexture: THREE.Texture;
  normalTexture: THREE.Texture;
  displacementTexture: THREE.Texture;
  displacementScale: number;
}

function hexFromEntry(entry?: { color?: string }): string {
  if (!entry?.color) return DEFAULT_TILE_COLOR;
  return entry.color.startsWith('#') ? entry.color : `#${entry.color}`;
}

function luminance(hexColor: string): number {
  const normalized = hexColor.replace('#', '');
  const bigint = parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function estimateHeight(tile: string, entry: { color?: string; description?: string } | undefined, isWater: boolean): number {
  if (isWater) return -0.1;

  const description = entry?.description?.toLowerCase() ?? '';
  const baseLuminance = luminance(hexFromEntry(entry));

  if (description.includes('mountain') || description.includes('peak')) {
    return 0.95 + baseLuminance * 0.05;
  }
  if (description.includes('trench') || description.includes('canyon')) {
    return -0.25 + baseLuminance * 0.1;
  }
  if (description.includes('forest') || description.includes('woods') || description.includes('grove')) {
    return 0.38 + baseLuminance * 0.2;
  }
  if (description.includes('hill') || description.includes('ridge')) {
    return 0.6 + baseLuminance * 0.15;
  }
  if (description.includes('swamp') || description.includes('marsh') || description.includes('bog')) {
    return 0.18 + baseLuminance * 0.1;
  }
  return 0.3 + baseLuminance * 0.25;
}

function blurHeightField(values: Float32Array, width: number, height: number): Float32Array {
  const output = new Float32Array(values.length);
  const kernel = [
    [1, 2, 1],
    [2, 4, 2],
    [1, 2, 1],
  ];
  const kernelWeight = 16;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let ky = -1; ky <= 1; ky += 1) {
        for (let kx = -1; kx <= 1; kx += 1) {
          const sampleX = THREE.MathUtils.clamp(x + kx, 0, width - 1);
          const sampleY = THREE.MathUtils.clamp(y + ky, 0, height - 1);
          const weight = kernel[ky + 1][kx + 1];
          sum += values[sampleY * width + sampleX] * weight;
        }
      }
      output[y * width + x] = sum / kernelWeight;
    }
  }

  return output;
}

function buildNormalMap(heightField: Float32Array, width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const center = heightField[y * width + x];
      const left = heightField[y * width + Math.max(x - 1, 0)];
      const right = heightField[y * width + Math.min(x + 1, width - 1)];
      const top = heightField[Math.max(y - 1, 0) * width + x];
      const bottom = heightField[Math.min(y + 1, height - 1) * width + x];

      const dx = (right - left) * NORMAL_STRENGTH;
      const dy = (bottom - top) * NORMAL_STRENGTH;
      const normal = new THREE.Vector3(-dx, -dy, 1).normalize();

      const offset = (y * width + x) * 4;
      data[offset] = Math.round((normal.x * 0.5 + 0.5) * 255);
      data[offset + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
      data[offset + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
      data[offset + 3] = 255;
    }
  }

  return data;
}

function toDataTexture(
  data: BufferSource,
  width: number,
  height: number,
  format: THREE.PixelFormat = THREE.RGBAFormat,
  type: THREE.TextureDataType = THREE.UnsignedByteType
): THREE.DataTexture {
  const texture = new THREE.DataTexture(data as ArrayBufferView, width, height, format, type);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

export function buildGlobeTextures(
  map: ExtendedMap,
  terrain: TerrainLookup,
  waterChars: string[]
): GlobeTextures {
  const canvas = document.createElement('canvas');
  canvas.width = map.width;
  canvas.height = map.extendedHeight;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Unable to acquire 2D context for texture building');
  }

  const primaryWaterChar = waterChars[0] ?? DEFAULT_WATER_CHAR;
  const waterColor = hexFromEntry(terrain[primaryWaterChar]) || '#0f4f8f';

  const heightField = new Float32Array(map.width * map.extendedHeight);

  map.extendedRows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const tile = row[x];
      const entry = terrain[tile];
      const isWater = waterChars.includes(tile);
      const color = hexFromEntry(isWater ? terrain[tile] ?? { color: waterColor } : entry);
      context.fillStyle = color;
      context.fillRect(x, y, 1, 1);

      const height = estimateHeight(tile, entry, isWater);
      heightField[y * map.width + x] = THREE.MathUtils.clamp(height, -0.3, 1);
    }
  });

  const smoothedHeight = blurHeightField(heightField, map.width, map.extendedHeight);
  const heightTextureData = new Uint8ClampedArray(map.width * map.extendedHeight * 4);
  for (let i = 0; i < smoothedHeight.length; i += 1) {
    const value = THREE.MathUtils.clamp((smoothedHeight[i] + 0.3) / 1.3, 0, 1);
    const byte = Math.round(value * 255);
    const offset = i * 4;
    heightTextureData[offset] = byte;
    heightTextureData[offset + 1] = byte;
    heightTextureData[offset + 2] = byte;
    heightTextureData[offset + 3] = 255;
  }

  const colorImageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const normalTextureData = buildNormalMap(smoothedHeight, map.width, map.extendedHeight);

  return {
    colorTexture: toDataTexture(colorImageData.data, canvas.width, canvas.height),
    normalTexture: toDataTexture(normalTextureData, canvas.width, canvas.height),
    displacementTexture: toDataTexture(heightTextureData, canvas.width, canvas.height),
    displacementScale: DISPLACEMENT_SCALE,
  };
}
