import * as THREE from 'three';

type WrapMode = 'clamp' | 'repeat';
type TextureFormat = 'rgba8' | 'rg8' | 'r8';

export interface TextureEntry {
  path: string;
  format: TextureFormat;
  width: number;
  height: number;
  wrap: WrapMode;
  minFilter: 'nearest' | 'linear';
  magFilter: 'nearest' | 'linear';
  size?: number;
  hash?: string;
  cacheControl?: string;
}

export interface TextureManifest {
  id: string;
  preset: string;
  palette: string;
  map: {
    url: string;
    width: number;
    height: number;
    extendedWidth: number;
    extendedHeight: number;
    polePadding: number;
  };
  generatedAt: string;
  textures: {
    color: TextureEntry;
    normal: TextureEntry;
    height: TextureEntry;
    mountainMask: TextureEntry;
  };
  cacheControl?: string;
  stats: {
    width: number;
    height: number;
    isPowerOfTwo: boolean;
    wrapMode: 'clamp' | 'repeat';
    minHeight: number;
    maxHeight: number;
    averageLandHeight: number;
    waterRatio: number;
    landRatio: number;
    nonZeroRatio: number;
    peakRatio: number;
    mountainMaskRatio: number;
    mountainInfluenceAverage: number;
    peakThreshold: number;
    heightGain: number;
    displacementScale: number;
    normalStrength: number;
    missingHeightEntries: number;
    waterMaxHeight: number;
    waterNonZeroRatio: number;
  };
}

function toWrap(mode: WrapMode): THREE.Wrapping {
  return mode === 'repeat' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
}

function toFilter(value: 'nearest' | 'linear'): THREE.TextureFilter {
  return value === 'nearest' ? THREE.NearestFilter : THREE.LinearFilter;
}

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.arrayBuffer();
}

function buildDataTexture(entry: TextureEntry, data: Uint8Array): THREE.DataTexture {
  let format: THREE.PixelFormat;
  let colorSpace: THREE.ColorSpace = THREE.NoColorSpace;
  switch (entry.format) {
    case 'rgba8':
      format = THREE.RGBAFormat;
      colorSpace = THREE.SRGBColorSpace;
      break;
    case 'rg8':
      format = THREE.RGFormat;
      break;
    case 'r8':
    default:
      format = THREE.RedFormat;
      break;
  }
  const tex = new THREE.DataTexture(data, entry.width, entry.height, format, THREE.UnsignedByteType);
  tex.colorSpace = colorSpace;
  tex.wrapS = toWrap(entry.wrap);
  tex.wrapT = toWrap(entry.wrap);
  tex.minFilter = toFilter(entry.minFilter);
  tex.magFilter = toFilter(entry.magFilter);
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export async function loadManifestTextures(manifestUrl: string) {
  const res = await fetch(manifestUrl);
  if (!res.ok) {
    throw new Error(`Unable to fetch manifest ${manifestUrl}: ${res.status} ${res.statusText}`);
  }
  const manifest = (await res.json()) as TextureManifest;

  const resolve = (p: string) => new URL(p, manifestUrl).toString();

  const [colorBuf, normalBuf, heightBuf, mountainMaskBuf] = await Promise.all([
    fetchArrayBuffer(resolve(manifest.textures.color.path)),
    fetchArrayBuffer(resolve(manifest.textures.normal.path)),
    fetchArrayBuffer(resolve(manifest.textures.height.path)),
    fetchArrayBuffer(resolve(manifest.textures.mountainMask.path)),
  ]);

  const bytes = {
    color: colorBuf.byteLength,
    normal: normalBuf.byteLength,
    height: heightBuf.byteLength,
    mountainMask: mountainMaskBuf.byteLength,
  };

  const colorTexture = buildDataTexture(manifest.textures.color, new Uint8Array(colorBuf));
  const normalTexture = buildDataTexture(manifest.textures.normal, new Uint8Array(normalBuf));
  const heightTexture = buildDataTexture(manifest.textures.height, new Uint8Array(heightBuf));
  const mountainMaskTexture = buildDataTexture(manifest.textures.mountainMask, new Uint8Array(mountainMaskBuf));

  return {
    manifest,
    colorTexture,
    normalTexture,
    heightTexture,
    mountainMaskTexture,
    stats: manifest.stats,
    bytes,
  };
}
