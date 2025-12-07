import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

type WrapMode = 'clamp' | 'repeat';
type TextureFormat = 'rgba8' | 'rgb8' | 'rg8' | 'r8';
type MinFilter =
  | 'nearest'
  | 'linear'
  | 'nearest-mipmap-nearest'
  | 'nearest-mipmap-linear'
  | 'linear-mipmap-nearest'
  | 'linear-mipmap-linear';
type ColorSpaceHint = 'srgb' | 'linear' | 'none';

type TextureName = 'color' | 'normal' | 'height' | 'mountainMask';
type DetailKind = 'albedo' | 'normal';

interface TextureLevelEntry {
  path: string;
  width: number;
  height: number;
  size?: number;
  hash?: string;
}

export interface TextureEntry {
  path: string;
  format: TextureFormat;
  width: number;
  height: number;
  wrap: WrapMode;
  minFilter: MinFilter;
  magFilter: 'nearest' | 'linear';
  size?: number;
  hash?: string;
  cacheControl?: string;
  mipmaps?: TextureLevelEntry[];
}

export interface Ktx2TextureEntry {
  path: string;
  container: 'ktx2';
  compression: 'uastc' | 'etc1s' | 'raw';
  colorSpace: ColorSpaceHint;
  width: number;
  height: number;
  wrap: WrapMode;
  minFilter: MinFilter;
  magFilter: 'nearest' | 'linear';
  mipmaps?: number;
  size?: number;
  hash?: string;
  cacheControl?: string;
}

export interface DetailTextureEntry {
  path: string;
  format: 'png';
  width: number;
  height: number;
  wrap: WrapMode;
  minFilter: MinFilter;
  magFilter: 'nearest' | 'linear';
  size?: number;
  hash?: string;
  cacheControl?: string;
  colorSpace: ColorSpaceHint;
}

export interface DetailVariantEntry {
  id: string;
  albedo: DetailTextureEntry;
  normal: DetailTextureEntry;
  compressed?: Partial<Record<DetailKind, Ktx2TextureEntry>>;
}

export interface DetailTileEntry {
  id: string;
  variants: DetailVariantEntry[];
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
  compressed?: Partial<Record<TextureName, Ktx2TextureEntry>>;
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
  detailTiles?: DetailTileEntry[];
}

export interface LoadedDetailVariant {
  id: string;
  albedo: THREE.Texture;
  normal: THREE.Texture;
  bytes: { albedo: number; normal: number };
  source: 'ktx2' | 'png';
}

export interface LoadedDetailTile {
  id: string;
  variants: LoadedDetailVariant[];
}

export interface LoadManifestOptions {
  renderer?: THREE.WebGLRenderer;
  preferCompressed?: boolean;
  transcoderPath?: string;
}

function toWrap(mode: WrapMode): THREE.Wrapping {
  return mode === 'repeat' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
}

function toMinFilter(value: MinFilter): THREE.TextureFilter {
  switch (value) {
    case 'nearest-mipmap-nearest':
      return THREE.NearestMipmapNearestFilter;
    case 'nearest-mipmap-linear':
      return THREE.NearestMipmapLinearFilter;
    case 'linear-mipmap-nearest':
      return THREE.LinearMipmapNearestFilter;
    case 'linear-mipmap-linear':
      return THREE.LinearMipmapLinearFilter;
    case 'nearest':
      return THREE.NearestFilter;
    case 'linear':
    default:
      return THREE.LinearFilter;
  }
}

function toMagFilter(value: 'nearest' | 'linear'): THREE.TextureFilter {
  return value === 'nearest' ? THREE.NearestFilter : THREE.LinearFilter;
}

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.arrayBuffer();
}

function buildDataTexture(
  entry: TextureEntry,
  levels: Array<{ data: Uint8Array; width: number; height: number }>
): THREE.DataTexture {
  if (!levels.length) {
    throw new Error(`Texture ${entry.path} missing mip levels`);
  }
  const baseLevel = levels[0];
  let format: THREE.PixelFormat;
  let colorSpace: THREE.ColorSpace = THREE.NoColorSpace;
  let internalFormat: THREE.PixelFormat | THREE.PixelFormatGPU | null = null;
  switch (entry.format) {
    case 'rgba8':
      format = THREE.RGBAFormat;
      colorSpace = THREE.SRGBColorSpace;
      internalFormat = 'RGBA8';
      break;
    case 'rgb8':
      format = THREE.RGBFormat;
      colorSpace = THREE.LinearSRGBColorSpace;
      internalFormat = 'RGB8'; // WebGL2 needs a sized internal format for texStorage2D
      break;
    case 'rg8':
      format = THREE.RGFormat;
      colorSpace = THREE.LinearSRGBColorSpace;
      break;
    case 'r8':
    default:
      format = THREE.RedFormat;
      colorSpace = THREE.LinearSRGBColorSpace;
      break;
  }
  const tex = new THREE.DataTexture(baseLevel.data, baseLevel.width, baseLevel.height, format, THREE.UnsignedByteType);
  if (internalFormat) {
    tex.internalFormat = internalFormat;
  }
  tex.colorSpace = colorSpace;
  tex.wrapS = toWrap(entry.wrap);
  tex.wrapT = toWrap(entry.wrap);
  tex.minFilter = toMinFilter(entry.minFilter);
  tex.magFilter = toMagFilter(entry.magFilter);
  tex.mipmaps = levels.map((level) => ({
    data: level.data,
    width: level.width,
    height: level.height,
  }));
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function colorSpaceFromHint(hint: ColorSpaceHint): THREE.ColorSpace {
  switch (hint) {
    case 'srgb':
      return THREE.SRGBColorSpace;
    case 'linear':
      return THREE.LinearSRGBColorSpace;
    default:
      return THREE.NoColorSpace;
  }
}

async function loadKtx2Texture(
  loader: KTX2Loader | null,
  url: string,
  entry: Ktx2TextureEntry
): Promise<THREE.CompressedTexture | THREE.DataTexture | null> {
  if (!loader) return null;
  try {
    const texture = await loader.loadAsync(url);
    texture.wrapS = toWrap(entry.wrap);
    texture.wrapT = toWrap(entry.wrap);
    texture.minFilter = toMinFilter(entry.minFilter);
    texture.magFilter = toMagFilter(entry.magFilter);
    texture.colorSpace = colorSpaceFromHint(entry.colorSpace);
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  } catch (error) {
    console.warn(`Failed to load KTX2 texture ${url}, falling back to raw bin.`, error);
    return null;
  }
}

export async function loadManifestTextures(manifestUrl: string, options?: LoadManifestOptions) {
  const { renderer, preferCompressed = true, transcoderPath = '/basis/' } = options ?? {};
  const res = await fetch(manifestUrl);
  if (!res.ok) {
    throw new Error(`Unable to fetch manifest ${manifestUrl}: ${res.status} ${res.statusText}`);
  }
  const manifest = (await res.json()) as TextureManifest;

  const resolve = (p: string) => new URL(p, manifestUrl).toString();

  const ktx2Loader = renderer && preferCompressed ? new KTX2Loader() : null;
  const textureLoader = new THREE.TextureLoader();

  if (ktx2Loader && renderer) {
    ktx2Loader.setTranscoderPath(transcoderPath);
    ktx2Loader.detectSupport(renderer);
  }

  const loadTexture = async (
    key: TextureName
  ): Promise<{ texture: THREE.Texture; bytes: number; source: 'ktx2' | 'bin' }> => {
    const compressedEntry = preferCompressed ? manifest.compressed?.[key] : undefined;
    if (compressedEntry) {
      const ktxUrl = resolve(compressedEntry.path);
      const ktxTexture = await loadKtx2Texture(ktx2Loader, ktxUrl, compressedEntry);
      if (ktxTexture) {
        const bytes = compressedEntry.size ?? 0;
        return { texture: ktxTexture, bytes, source: 'ktx2' };
      }
    }

    const rawEntry = manifest.textures[key];
    if (rawEntry.mipmaps && rawEntry.mipmaps.length > 0) {
      const buffers = await Promise.all(rawEntry.mipmaps.map((level) => fetchArrayBuffer(resolve(level.path))));
      const mipLevels = buffers.map((buffer, index) => ({
        data: new Uint8Array(buffer),
        width: rawEntry.mipmaps![index].width,
        height: rawEntry.mipmaps![index].height,
      }));
      const texture = buildDataTexture(rawEntry, mipLevels);
      const bytes = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
      return { texture, bytes, source: 'bin' };
    }

    const buffer = await fetchArrayBuffer(resolve(rawEntry.path));
    const texture = buildDataTexture(rawEntry, [
      { data: new Uint8Array(buffer), width: rawEntry.width, height: rawEntry.height },
    ]);
    return { texture, bytes: buffer.byteLength, source: 'bin' };
  };

  const [colorResult, normalResult, heightResult, mountainMaskResult] = await Promise.all([
    loadTexture('color'),
    loadTexture('normal'),
    loadTexture('height'),
    loadTexture('mountainMask'),
  ]);

  const loadDetailTexture = async (
    entry: DetailTextureEntry,
    compressed?: Ktx2TextureEntry
  ): Promise<{ texture: THREE.Texture; bytes: number; source: 'ktx2' | 'png' }> => {
    if (compressed) {
      const ktxUrl = resolve(compressed.path);
      const ktxTexture = await loadKtx2Texture(ktx2Loader, ktxUrl, compressed);
      if (ktxTexture) {
        return { texture: ktxTexture, bytes: compressed.size ?? 0, source: 'ktx2' };
      }
    }
    const pngUrl = resolve(entry.path);
    const pngTexture = await new Promise<THREE.Texture>((resolveTexture, reject) => {
      textureLoader.load(pngUrl, resolveTexture, undefined, reject);
    });
    pngTexture.wrapS = toWrap(entry.wrap);
    pngTexture.wrapT = toWrap(entry.wrap);
    pngTexture.minFilter = toMinFilter(entry.minFilter);
    pngTexture.magFilter = toMagFilter(entry.magFilter);
    pngTexture.generateMipmaps = true;
    pngTexture.colorSpace = colorSpaceFromHint(entry.colorSpace);
    pngTexture.needsUpdate = true;
    return { texture: pngTexture, bytes: entry.size ?? 0, source: 'png' };
  };

  const bytes = {
    color: colorResult.bytes,
    normal: normalResult.bytes,
    height: heightResult.bytes,
    mountainMask: mountainMaskResult.bytes,
  };

  return {
    manifest,
    colorTexture: colorResult.texture,
    normalTexture: normalResult.texture,
    heightTexture: heightResult.texture,
    mountainMaskTexture: mountainMaskResult.texture,
    stats: manifest.stats,
    bytes,
    usedCompressed:
      colorResult.source === 'ktx2' ||
      normalResult.source === 'ktx2' ||
      heightResult.source === 'ktx2' ||
      mountainMaskResult.source === 'ktx2',
    detailTiles:
      manifest.detailTiles && manifest.detailTiles.length > 0
        ? await Promise.all(
            manifest.detailTiles.map(async (tile) => {
              const variants = await Promise.all(
                tile.variants.map(async (variant) => {
                  const albedoCompressed = preferCompressed ? variant.compressed?.albedo : undefined;
                  const normalCompressed = preferCompressed ? variant.compressed?.normal : undefined;
                  const [albedo, normal] = await Promise.all([
                    loadDetailTexture(variant.albedo, albedoCompressed),
                    loadDetailTexture(variant.normal, normalCompressed),
                  ]);
                  return {
                    id: variant.id,
                    albedo: albedo.texture,
                    normal: normal.texture,
                    bytes: { albedo: albedo.bytes, normal: normal.bytes },
                    source: albedo.source === 'ktx2' || normal.source === 'ktx2' ? 'ktx2' : 'png',
                  };
                })
              );
              return { id: tile.id, variants };
            })
          )
        : undefined,
  };
}
