import * as THREE from 'three';
import { BASE_LAND_HEIGHT, DEFAULT_TILE_COLOR, DEFAULT_WATER_CHAR, MOUNTAIN_HEIGHT } from './config';
import type { ExtendedMap } from './mapLoader';
import type { TerrainEntry, TerrainLookup } from './terrain';

export interface GlobeTextures {
  colorTexture: THREE.Texture;
  heightTexture: THREE.Texture;
}

const MOUNTAIN_KEYWORDS = ['mountain'];

function hexFromEntry(entry?: { color?: string }): string {
  if (!entry?.color) return DEFAULT_TILE_COLOR;
  return entry.color.startsWith('#') ? entry.color : `#${entry.color}`;
}

function resolveHeight(entry: TerrainEntry | undefined, isWater: boolean): number {
  if (isWater) return 0;
  const description = entry?.description?.toLowerCase() ?? '';
  if (MOUNTAIN_KEYWORDS.some((keyword) => description.includes(keyword))) {
    return MOUNTAIN_HEIGHT;
  }
  return BASE_LAND_HEIGHT;
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

  map.extendedRows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const tile = row[x];
      const entry = terrain[tile];
      const isWater = waterSet.has(tile);
      const color = hexFromEntry(isWater ? terrain[tile] ?? { color: waterColor } : entry);
      context.fillStyle = color;
      context.fillRect(x, y, 1, 1);

      const heightValue = resolveHeight(entry, isWater);
      heightData[y * map.width + x] = Math.round(Math.max(0, Math.min(1, heightValue)) * 255);
    }
  });

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
  colorTexture.wrapS = THREE.RepeatWrapping;
  colorTexture.wrapT = THREE.ClampToEdgeWrapping;
  colorTexture.needsUpdate = true;

  const heightTexture = new THREE.DataTexture(
    heightData,
    map.width,
    map.extendedHeight,
    THREE.LuminanceFormat,
    THREE.UnsignedByteType
  );
  heightTexture.colorSpace = THREE.NoColorSpace;
  heightTexture.minFilter = THREE.LinearFilter;
  heightTexture.magFilter = THREE.LinearFilter;
  heightTexture.generateMipmaps = false;
  heightTexture.wrapS = THREE.RepeatWrapping;
  heightTexture.wrapT = THREE.ClampToEdgeWrapping;
  heightTexture.needsUpdate = true;

  return { colorTexture, heightTexture };
}
