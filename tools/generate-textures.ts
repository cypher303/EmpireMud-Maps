import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { KTX2Exporter } from 'three/examples/jsm/exporters/KTX2Exporter.js';
import { read as readKtx2, write as writeKtx2, KTX2Container } from 'three/examples/jsm/libs/ktx-parse.module.js';
import type { TextureBuildStats } from '../src/textureBuilder';

type WrapMode = 'clamp' | 'repeat';
type TextureFormat = 'rgba8' | 'rg8' | 'r8';
type MinFilter =
  | 'nearest'
  | 'linear'
  | 'nearest-mipmap-nearest'
  | 'nearest-mipmap-linear'
  | 'linear-mipmap-nearest'
  | 'linear-mipmap-linear';
type ColorSpaceHint = 'srgb' | 'linear' | 'none';
type TextureName = 'color' | 'normal' | 'height' | 'mountainMask';

interface TextureLevelEntry {
  path: string;
  width: number;
  height: number;
  size: number;
  hash: string;
}

interface TextureEntry {
  path: string;
  format: TextureFormat;
  width: number;
  height: number;
  wrap: WrapMode;
  minFilter: MinFilter;
  magFilter: 'nearest' | 'linear';
  size: number;
  hash: string;
  cacheControl?: string;
  mipmaps?: TextureLevelEntry[];
}

interface Ktx2TextureEntry {
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
  size: number;
  hash: string;
  cacheControl?: string;
}

interface TextureManifest {
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
  stats: TextureBuildStats;
  cacheControl?: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_ROOT = path.resolve(__dirname, '../dist/generated');
const DEFAULT_CACHE_CONTROL = 'public, max-age=31536000, immutable';

function toMinFilterName(filter: THREE.TextureFilter): MinFilter {
  switch (filter) {
    case THREE.NearestMipmapNearestFilter:
      return 'nearest-mipmap-nearest';
    case THREE.NearestMipmapLinearFilter:
      return 'nearest-mipmap-linear';
    case THREE.LinearMipmapNearestFilter:
      return 'linear-mipmap-nearest';
    case THREE.LinearMipmapLinearFilter:
      return 'linear-mipmap-linear';
    case THREE.NearestFilter:
      return 'nearest';
    case THREE.LinearFilter:
    default:
      return 'linear';
  }
}

function toMagFilterName(filter: THREE.TextureFilter): 'nearest' | 'linear' {
  return filter === THREE.NearestFilter ? 'nearest' : 'linear';
}

function getArgValue(flag: string, args: string[]): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}

const argv = process.argv.slice(2);
const force = argv.includes('--force');
const purge = argv.includes('--purge');
const outOverride = getArgValue('--out', argv);
const mapOverride = getArgValue('--map-url', argv);
const presetOverride = getArgValue('--preset', argv);
const paletteOverride = getArgValue('--palette', argv);
const ktx2Enabled = !argv.includes('--no-ktx2');
const toktxPath = getArgValue('--toktx', argv) ?? process.env.TOKTX_PATH ?? 'toktx';
const toktxArgs = getArgValue('--toktx-args', argv);
const disableToktx = argv.includes('--no-toktx');

if (mapOverride) (process as any).env.MAP_URL = mapOverride;
if (presetOverride) (process as any).env.QUALITY_PRESET = presetOverride;
if (paletteOverride) (process as any).env.PALETTE = paletteOverride;

const OUTPUT_DIR = outOverride ? path.resolve(outOverride) : OUTPUT_ROOT;
const ktx2Exporter = new KTX2Exporter();

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function hashKey(parts: Record<string, unknown>): string {
  const h = crypto.createHash('sha1');
  h.update(JSON.stringify(parts));
  return h.digest('hex').slice(0, 12);
}

function hashBuffer(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function toUint8Array(data: BufferSource): Uint8Array {
  if (data instanceof Uint8Array) return new Uint8Array(data); // copy to detach from original view
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  return new Uint8Array(data as ArrayBuffer);
}

function channelCount(format: THREE.PixelFormat): number {
  if (format === THREE.RGBAFormat) return 4;
  if (format === THREE.RGFormat) return 2;
  return 1;
}

type MipChain = Array<{ data: Uint8Array; width: number; height: number }>;

function buildMipChain(
  data: BufferSource,
  width: number,
  height: number,
  channels: number,
  strategy: 'default' | 'normal-rg' = 'default'
): MipChain {
  const mipChain: MipChain = [];
  let currentData = toUint8Array(data);
  let currentWidth = width;
  let currentHeight = height;

  const encodeNormalComponent = (value: number) => Math.round((value * 0.5 + 0.5) * 255);

  mipChain.push({ data: new Uint8Array(currentData), width: currentWidth, height: currentHeight });

  while (currentWidth > 1 || currentHeight > 1) {
    const nextWidth = Math.max(1, Math.floor(currentWidth / 2));
    const nextHeight = Math.max(1, Math.floor(currentHeight / 2));
    const nextData = new Uint8Array(nextWidth * nextHeight * channels);

    for (let y = 0; y < nextHeight; y += 1) {
      for (let x = 0; x < nextWidth; x += 1) {
        const accum = new Float64Array(channels);
        let samples = 0;
        for (let dy = 0; dy < 2; dy += 1) {
          const srcY = Math.min(currentHeight - 1, y * 2 + dy);
          for (let dx = 0; dx < 2; dx += 1) {
            const srcX = Math.min(currentWidth - 1, x * 2 + dx);
            const srcIdx = (srcY * currentWidth + srcX) * channels;
            if (strategy === 'normal-rg' && channels === 2) {
              const nx = currentData[srcIdx] / 255 * 2 - 1;
              const ny = currentData[srcIdx + 1] / 255 * 2 - 1;
              accum[0] += nx;
              accum[1] += ny;
            } else {
              for (let c = 0; c < channels; c += 1) {
                accum[c] += currentData[srcIdx + c];
              }
            }
            samples += 1;
          }
        }

        const dstIdx = (y * nextWidth + x) * channels;
        if (strategy === 'normal-rg' && channels === 2) {
          let nx = accum[0] / samples;
          let ny = accum[1] / samples;
          const length = Math.hypot(nx, ny);
          if (length > 1e-5) {
            const invLen = 1 / Math.max(1, length);
            nx *= invLen;
            ny *= invLen;
          }
          nextData[dstIdx] = encodeNormalComponent(nx);
          nextData[dstIdx + 1] = encodeNormalComponent(ny);
        } else {
          for (let c = 0; c < channels; c += 1) {
            nextData[dstIdx + c] = Math.round(accum[c] / samples);
          }
        }
      }
    }

    mipChain.push({ data: nextData, width: nextWidth, height: nextHeight });
    currentData = nextData;
    currentWidth = nextWidth;
    currentHeight = nextHeight;
  }

  return mipChain;
}

function applyMipmaps(
  tex: THREE.DataTexture,
  mipChain: MipChain,
  minFilter: THREE.TextureFilter,
  magFilter: THREE.TextureFilter
) {
  tex.mipmaps = mipChain.map((mip) => ({
    data: mip.data,
    width: mip.width,
    height: mip.height,
  }));
  tex.minFilter = minFilter;
  tex.magFilter = magFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
}

function textureMeta(tex: THREE.DataTexture) {
  const { width, height } = tex.image as { width: number; height: number };
  const wrap: WrapMode = tex.wrapS === THREE.RepeatWrapping || tex.wrapT === THREE.RepeatWrapping ? 'repeat' : 'clamp';
  const minFilter: MinFilter = toMinFilterName(tex.minFilter);
  const magFilter: 'nearest' | 'linear' = toMagFilterName(tex.magFilter);
  return { width, height, wrap, minFilter, magFilter };
}

function colorSpaceHintFromTexture(tex: THREE.DataTexture): ColorSpaceHint {
  switch (tex.colorSpace) {
    case THREE.SRGBColorSpace:
      return 'srgb';
    case THREE.LinearSRGBColorSpace:
      return 'linear';
    default:
      return 'none';
  }
}

function splitArgs(value?: string): string[] {
  if (!value) return [];
  const matches = value.match(/(?:[^\s"]+|"[^"]*")+/g);
  if (!matches) return [];
  return matches.map((part) => part.replace(/^['"]|['"]$/g, ''));
}

function inferCompression(compressionArgs: string[]): Ktx2TextureEntry['compression'] {
  if (compressionArgs.some((arg) => arg.toLowerCase().includes('etc1s'))) return 'etc1s';
  if (compressionArgs.some((arg) => arg.toLowerCase().includes('uastc'))) return 'uastc';
  return 'raw';
}

function isToktxAvailable(): boolean {
  if (disableToktx || !ktx2Enabled) return false;
  try {
    const result = spawnSync(toktxPath, ['--version'], { stdio: 'pipe' });
    if (result.error || result.status !== 0) {
      console.warn(
        `toktx not available or failed to respond (path: ${toktxPath}). Skipping KTX2 compression.`,
        result.error ?? result.stderr?.toString()
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn(`toktx check failed, skipping compression.`, error);
    return false;
  }
}

function writeBinaryTexture(
  tex: THREE.DataTexture,
  mipChain: MipChain,
  name: string,
  outDir: string,
  cacheControl: string | undefined
): TextureEntry {
  const { width, height, wrap, minFilter, magFilter } = textureMeta(tex);
  if (!mipChain.length) {
    throw new Error(`Texture ${name} missing mip data`);
  }

  const format: TextureFormat =
    tex.format === THREE.RGBAFormat ? 'rgba8' : tex.format === THREE.RGFormat ? 'rg8' : 'r8';

  const baseFilename = `${name}.bin`;
  const baseBuffer = Buffer.from(mipChain[0].data);
  const baseHash = hashBuffer(baseBuffer);

  const mipmaps: TextureLevelEntry[] = mipChain.map((mip, index) => {
    const filename = index === 0 ? baseFilename : `${name}.mip${index}.bin`;
    const buffer = index === 0 ? baseBuffer : Buffer.from(mip.data);
    fs.writeFileSync(path.join(outDir, filename), buffer);
    return {
      path: filename,
      width: mip.width,
      height: mip.height,
      size: buffer.byteLength,
      hash: hashBuffer(buffer),
    };
  });

  return {
    path: baseFilename,
    format,
    width,
    height,
    wrap,
    minFilter,
    magFilter,
    size: baseBuffer.byteLength,
    hash: baseHash,
    cacheControl,
    mipmaps,
  };
}

function writeKtx2Texture(
  tex: THREE.DataTexture,
  mipChain: MipChain,
  name: TextureName,
  outDir: string,
  cacheControl: string | undefined,
  compressionArgs: string[],
  toktxAvailable: boolean
): Ktx2TextureEntry {
  const { width, height, wrap, minFilter, magFilter } = textureMeta(tex);
  const rawFilename = `${name}.raw.ktx2`;
  const rawPath = path.join(outDir, rawFilename);
  const arrayBuffer = ktx2Exporter.parse(tex);
  const container: KTX2Container = readKtx2(new Uint8Array(arrayBuffer));
  container.levels = mipChain.map((level) => ({
    levelData: new Uint8Array(level.data),
    uncompressedByteLength: level.data.byteLength,
  }));
  container.pixelWidth = width;
  container.pixelHeight = height;
  const rawBuffer = writeKtx2(container, { keepWriter: true });
  fs.writeFileSync(rawPath, Buffer.from(rawBuffer));

  const finalPath = path.join(outDir, `${name}.ktx2`);
  let compression: Ktx2TextureEntry['compression'] = 'raw';
  const compressionHint = inferCompression(compressionArgs);

  if (toktxAvailable) {
    const args = [...compressionArgs, finalPath, rawPath];
    const result = spawnSync(toktxPath, args, { stdio: 'pipe' });
    if (!result.error && result.status === 0 && fs.existsSync(finalPath)) {
      compression = compressionHint;
    } else {
      const errOutput = result.error ? result.error.message : result.stderr?.toString()?.trim();
      console.warn(
        `toktx failed for ${name}, falling back to raw KTX2. ${errOutput ? `(${errOutput})` : ''}`.trim()
      );
    }
  }

  if (!fs.existsSync(finalPath)) {
    fs.copyFileSync(rawPath, finalPath);
  }

  try {
    fs.rmSync(rawPath, { force: true });
  } catch {
    // optional cleanup failure can be ignored
  }

  const finalBuffer = fs.readFileSync(finalPath);

  return {
    path: path.basename(finalPath),
    container: 'ktx2',
    compression,
    colorSpace: colorSpaceHintFromTexture(tex),
    width,
    height,
    wrap,
    minFilter,
    magFilter,
    mipmaps: mipChain.length,
    size: finalBuffer.byteLength,
    hash: hashBuffer(finalBuffer),
    cacheControl,
  };
}

async function main() {
  if (purge) {
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    console.info(`Purged generated output at ${OUTPUT_DIR}`);
    if (!force) return;
  }

  ensureDir(OUTPUT_DIR);
  const toktxAvailable = isToktxAvailable();
  const compressionArgs = (() => {
    const args = splitArgs(toktxArgs);
    if (args.length > 0) return args;
    return ['--t2', '--uastc', '4'];
  })();

  const { buildGlobeTextures } = await import('../src/textureBuilder');
  const { extendMapWithPoles, loadMapRows } = await import('../src/mapLoader');
  const { loadTerrainLookup, loadWaterChars, loadWaterPalette, selectPrimaryWaterChar } = await import('../src/terrain');
  const { ACTIVE_PALETTE_ID, ACTIVE_QUALITY_PRESET_ID, MAP_URL, TEXTURE_TILE_SCALE } = await import('../src/config');

  const [terrain, waterChars] = await Promise.all([loadTerrainLookup(), loadWaterChars()]);
  const waterPalette = await loadWaterPalette(waterChars, terrain);
  const primaryWaterChar = selectPrimaryWaterChar(waterChars, terrain);
  const baseMap = await loadMapRows(MAP_URL);
  const extendedMap = extendMapWithPoles(baseMap, primaryWaterChar);

  const key = hashKey({
    map: MAP_URL,
    width: baseMap.width,
    height: baseMap.height,
    preset: ACTIVE_QUALITY_PRESET_ID,
    palette: ACTIVE_PALETTE_ID,
    tileScale: TEXTURE_TILE_SCALE,
  });

  const outDir = path.join(OUTPUT_ROOT, key);
  ensureDir(outDir);

  const existingManifest = path.join(outDir, 'manifest.json');
  if (fs.existsSync(existingManifest) && !force) {
    console.info(`Manifest already exists for key ${key}, skipping generation. (${existingManifest})`);
    return;
  }

  const { colorTexture, normalTexture, heightTexture, mountainMaskTexture, stats } = buildGlobeTextures(
    extendedMap,
    terrain,
    waterChars,
    undefined,
    waterPalette
  );

  const colorImage = colorTexture.image as { data: BufferSource; width: number; height: number };
  const normalImage = normalTexture.image as { data: BufferSource; width: number; height: number };
  const heightImage = heightTexture.image as { data: BufferSource; width: number; height: number };
  const mountainMaskImage = mountainMaskTexture.image as { data: BufferSource; width: number; height: number };

  const mipChains: Record<TextureName, MipChain> = {
    color: buildMipChain(colorImage.data, colorImage.width, colorImage.height, channelCount(colorTexture.format)),
    normal: buildMipChain(
      normalImage.data,
      normalImage.width,
      normalImage.height,
      channelCount(normalTexture.format),
      'normal-rg'
    ),
    height: buildMipChain(heightImage.data, heightImage.width, heightImage.height, channelCount(heightTexture.format)),
    mountainMask: buildMipChain(
      mountainMaskImage.data,
      mountainMaskImage.width,
      mountainMaskImage.height,
      channelCount(mountainMaskTexture.format)
    ),
  };

  applyMipmaps(colorTexture, mipChains.color, THREE.LinearMipmapLinearFilter, THREE.LinearFilter);
  applyMipmaps(normalTexture, mipChains.normal, THREE.LinearMipmapLinearFilter, THREE.LinearFilter);
  applyMipmaps(heightTexture, mipChains.height, THREE.LinearMipmapLinearFilter, THREE.LinearFilter);
  applyMipmaps(mountainMaskTexture, mipChains.mountainMask, THREE.LinearMipmapLinearFilter, THREE.LinearFilter);

  const cacheControl = DEFAULT_CACHE_CONTROL;
  const colorEntry = writeBinaryTexture(colorTexture, mipChains.color, 'color', outDir, cacheControl);
  const normalEntry = writeBinaryTexture(normalTexture, mipChains.normal, 'normal', outDir, cacheControl);
  const heightEntry = writeBinaryTexture(heightTexture, mipChains.height, 'height', outDir, cacheControl);
  const mountainMaskEntry = writeBinaryTexture(
    mountainMaskTexture,
    mipChains.mountainMask,
    'mountainMask',
    outDir,
    cacheControl
  );

  let compressedEntries: Partial<Record<TextureName, Ktx2TextureEntry>> | undefined;
  if (ktx2Enabled) {
    const texturesByName: Record<TextureName, THREE.DataTexture> = {
      color: colorTexture,
      normal: normalTexture,
      height: heightTexture,
      mountainMask: mountainMaskTexture,
    };
    compressedEntries = {} as Partial<Record<TextureName, Ktx2TextureEntry>>;
    (Object.keys(texturesByName) as TextureName[]).forEach((name) => {
      compressedEntries![name] = writeKtx2Texture(
        texturesByName[name],
        mipChains[name],
        name,
        outDir,
        cacheControl,
        compressionArgs,
        toktxAvailable
      );
    });
  }

  const manifest: TextureManifest = {
    id: key,
    preset: ACTIVE_QUALITY_PRESET_ID,
    palette: ACTIVE_PALETTE_ID,
    map: {
      url: MAP_URL,
      width: baseMap.width,
      height: baseMap.height,
      extendedWidth: extendedMap.width,
      extendedHeight: extendedMap.extendedHeight,
      polePadding: extendedMap.polePadding,
    },
    generatedAt: new Date().toISOString(),
    textures: {
      color: colorEntry,
      normal: normalEntry,
      height: heightEntry,
      mountainMask: mountainMaskEntry,
    },
    compressed: compressedEntries,
    cacheControl,
    stats,
  };

  fs.writeFileSync(existingManifest, JSON.stringify(manifest, null, 2));
  const compressionNote = compressedEntries
    ? ` (KTX2 ${toktxAvailable ? 'compressed via toktx' : 'raw container only'})`
    : '';
  console.info(`Wrote textures and manifest to ${outDir}${compressionNote}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
