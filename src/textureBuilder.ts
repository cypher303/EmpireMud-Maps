import * as THREE from 'three';
import { DEFAULT_TILE_COLOR, DEFAULT_WATER_CHAR } from './config';
import type { ExtendedMap } from './mapLoader';
import type { TerrainLookup } from './terrain';

function hexFromEntry(entry?: { color?: string }): string {
  if (!entry?.color) return DEFAULT_TILE_COLOR;
  return entry.color.startsWith('#') ? entry.color : `#${entry.color}`;
}

export function buildCanvasTexture(
  map: ExtendedMap,
  terrain: TerrainLookup,
  waterChars: string[]
): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = map.width;
  canvas.height = map.extendedHeight;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Unable to acquire 2D context for texture building');
  }

  const primaryWaterChar = waterChars[0] ?? DEFAULT_WATER_CHAR;
  const waterColor = hexFromEntry(terrain[primaryWaterChar]) || '#0f4f8f';

  map.extendedRows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const tile = row[x];
      const entry = terrain[tile];
      const isWater = waterChars.includes(tile);
      const color = hexFromEntry(isWater ? terrain[tile] ?? { color: waterColor } : entry);
      context.fillStyle = color;
      context.fillRect(x, y, 1, 1);
    }
  });

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

  const texture = new THREE.DataTexture(
    imageData.data,
    canvas.width,
    canvas.height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}
