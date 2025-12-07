import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import {
  KTX2Container,
  KHR_DF_CHANNEL_RGBSDA_ALPHA,
  KHR_DF_CHANNEL_RGBSDA_BLUE,
  KHR_DF_CHANNEL_RGBSDA_GREEN,
  KHR_DF_CHANNEL_RGBSDA_RED,
  KHR_DF_MODEL_RGBSDA,
  KHR_DF_PRIMARIES_BT709,
  KHR_DF_PRIMARIES_UNSPECIFIED,
  KHR_DF_SAMPLE_DATATYPE_LINEAR,
  KHR_DF_SAMPLE_DATATYPE_SIGNED,
  KHR_DF_TRANSFER_LINEAR,
  KHR_DF_TRANSFER_SRGB,
  VK_FORMAT_R8_UNORM,
  VK_FORMAT_R8_SRGB,
  VK_FORMAT_R8G8_UNORM,
  VK_FORMAT_R8G8_SRGB,
  VK_FORMAT_R8G8B8A8_SRGB,
  VK_FORMAT_R8G8B8A8_UNORM,
} from 'three/examples/jsm/libs/ktx-parse.module.js';
import type { TextureBuildStats } from '../src/textureBuilder';
import { promises as fsp } from 'node:fs';

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

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString();
  // Handle local file paths for CLI usage
  const resolveLocalPath = (value: string): string => {
    if (value.startsWith('file://')) return new URL(value).pathname;
    if (value.startsWith('/')) return path.resolve(__dirname, '../public', value.slice(1));
    return path.resolve(__dirname, value);
  };
  if (url.startsWith('file://') || url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) {
    const localPath = resolveLocalPath(url);
    const data = await fsp.readFile(localPath);
    return new Response(data, { status: 200 });
  }
  return originalFetch(input as any, init);
};

function resolveLocalUrl(url: string, assumePublic: boolean = true): string {
  try {
    // Absolute URL already
    // eslint-disable-next-line no-new
    new URL(url);
    return url;
  } catch {
    // fall through to file resolution
  }
  const cleaned = url.replace(/^file:\/\//, '');
  const basePath = assumePublic ? path.resolve(__dirname, '../public') : path.resolve(__dirname, '..');
  const resolved = cleaned.startsWith('/') ? path.resolve(basePath, cleaned.slice(1)) : path.resolve(basePath, cleaned);
  return `file://${resolved}`;
}

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
const ktxCliPath = getArgValue('--ktx', argv) ?? process.env.KTX_PATH ?? 'ktx';
const ktxCliArgs = getArgValue('--ktx-args', argv);
const skipKtxCli = argv.includes('--no-ktx-cli') || argv.includes('--no-toktx');

if (mapOverride) (process as any).env.MAP_URL = mapOverride;
if (presetOverride) (process as any).env.QUALITY_PRESET = presetOverride;
if (paletteOverride) (process as any).env.PALETTE = paletteOverride;

const OUTPUT_DIR = outOverride ? path.resolve(outOverride) : OUTPUT_ROOT;
const KTX2_IDENTIFIER = new Uint8Array([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);

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

const CHANNEL_TYPE_MAP = [
  KHR_DF_CHANNEL_RGBSDA_RED,
  KHR_DF_CHANNEL_RGBSDA_GREEN,
  KHR_DF_CHANNEL_RGBSDA_BLUE,
  KHR_DF_CHANNEL_RGBSDA_ALPHA,
];

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return Math.abs((a * b) / gcd(a, b));
}

function align(value: number, alignment: number): number {
  if (alignment <= 0) return value;
  const remainder = value % alignment;
  return remainder === 0 ? value : value + (alignment - remainder);
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

function ensureKtxCliAvailable(): boolean {
  if (skipKtxCli || !ktx2Enabled) return false;
  try {
    const result = spawnSync(ktxCliPath, ['--version'], { stdio: 'pipe' });
    if (result.error || result.status !== 0) {
      throw new Error(
        `ktx CLI not available or failed to respond (path: ${ktxCliPath}). Install it or run with --no-ktx-cli to skip compression.`
      );
    }
    return true;
  } catch (error) {
    throw error;
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

function resolveVkFormat(tex: THREE.DataTexture): number {
  if (tex.type !== THREE.UnsignedByteType) {
    throw new Error(`Unsupported texture type for KTX2 export (expected UnsignedByteType, got ${tex.type})`);
  }
  switch (tex.format) {
    case THREE.RGBAFormat:
      return tex.colorSpace === THREE.SRGBColorSpace ? VK_FORMAT_R8G8B8A8_SRGB : VK_FORMAT_R8G8B8A8_UNORM;
    case THREE.RGFormat:
      return tex.colorSpace === THREE.SRGBColorSpace ? VK_FORMAT_R8G8_SRGB : VK_FORMAT_R8G8_UNORM;
    case THREE.RedFormat:
      return tex.colorSpace === THREE.SRGBColorSpace ? VK_FORMAT_R8_SRGB : VK_FORMAT_R8_UNORM;
    default:
      throw new Error(`Unsupported pixel format for KTX2 export: ${tex.format}`);
  }
}

function populateBasicDfd(container: KTX2Container, tex: THREE.DataTexture, typeSize: number, channels: number) {
  const descriptor = container.dataFormatDescriptor[0];
  descriptor.vendorId = 0;
  descriptor.descriptorType = 0;
  descriptor.versionNumber = 2;
  descriptor.descriptorBlockSize = 24 + 16 * channels;
  descriptor.colorModel = KHR_DF_MODEL_RGBSDA;
  descriptor.colorPrimaries =
    tex.colorSpace === THREE.NoColorSpace ? KHR_DF_PRIMARIES_UNSPECIFIED : KHR_DF_PRIMARIES_BT709;
  descriptor.transferFunction =
    tex.colorSpace === THREE.SRGBColorSpace ? KHR_DF_TRANSFER_SRGB : KHR_DF_TRANSFER_LINEAR;
  descriptor.flags = 0;
  descriptor.texelBlockDimension = [0, 0, 0, 0];
  descriptor.bytesPlane = [typeSize * channels, 0, 0, 0, 0, 0, 0, 0];
  descriptor.samples = new Array(channels).fill(null).map((_, index) => {
    let channelType = CHANNEL_TYPE_MAP[index] ?? KHR_DF_CHANNEL_RGBSDA_RED;
    const isAlpha = channelType === KHR_DF_CHANNEL_RGBSDA_ALPHA;
    if (tex.colorSpace === THREE.SRGBColorSpace && isAlpha) {
      channelType |= KHR_DF_SAMPLE_DATATYPE_LINEAR;
    }
    const bitLength = typeSize * 8 - 1;
    const bitOffset = index * typeSize * 8;
    return {
      channelType,
      bitOffset,
      bitLength,
      samplePosition: [0, 0, 0, 0],
      sampleLower: 0,
      sampleUpper: Math.max(0, 2 ** (typeSize * 8) - 1),
    };
  });
}

function createKeyValueData(keyValue: Record<string, ArrayBufferView | ArrayBuffer | string>): Uint8Array {
  const entries: Uint8Array[] = [];
  Object.entries(keyValue).forEach(([key, value]) => {
    const keyBytes = Buffer.from(key, 'utf8');
    let valueBytes: Uint8Array;
    if (typeof value === 'string') {
      valueBytes = Buffer.from(value, 'utf8');
    } else if (Buffer.isBuffer(value)) {
      valueBytes = value;
    } else if (value instanceof ArrayBuffer) {
      valueBytes = new Uint8Array(value);
    } else if (ArrayBuffer.isView(value)) {
      const view = value as ArrayBufferView;
      valueBytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    } else {
      valueBytes = new Uint8Array();
    }

    const keyValueByteLength = keyBytes.byteLength + 1 + valueBytes.byteLength + 1;
    const paddedEntryLength = align(keyValueByteLength, 4);
    const padding = paddedEntryLength - keyValueByteLength;
    const entryLength = Buffer.alloc(4);
    entryLength.writeUInt32LE(keyValueByteLength, 0);

    entries.push(
      Buffer.concat([
        entryLength,
        keyBytes,
        Buffer.from([0]),
        valueBytes,
        Buffer.from([0]),
        Buffer.alloc(padding),
      ])
    );
  });

  if (!entries.length) return new Uint8Array();
  return Buffer.concat(entries);
}

function createDfdBlock(descriptor: KTX2Container['dataFormatDescriptor'][0]): Uint8Array {
  const sampleCount = descriptor.samples.length;
  const descriptorBlockSize = 24 + 16 * sampleCount;
  const blockSize = 28 + 16 * sampleCount;
  const buffer = new ArrayBuffer(blockSize);
  const view = new DataView(buffer);

  view.setUint32(0, blockSize, true);
  view.setUint16(4, descriptor.vendorId ?? 0, true);
  view.setUint16(6, descriptor.descriptorType ?? 0, true);
  view.setUint16(8, descriptor.versionNumber ?? 2, true);
  view.setUint16(10, descriptorBlockSize, true);
  view.setUint8(12, descriptor.colorModel ?? 0);
  view.setUint8(13, descriptor.colorPrimaries ?? 0);
  view.setUint8(14, descriptor.transferFunction ?? 0);
  view.setUint8(15, descriptor.flags ?? 0);

  const texelBlock = descriptor.texelBlockDimension ?? [0, 0, 0, 0];
  for (let i = 0; i < 4; i += 1) {
    view.setUint8(16 + i, texelBlock[i] ?? 0);
  }

  const bytesPlane = descriptor.bytesPlane ?? [];
  for (let i = 0; i < 8; i += 1) {
    view.setUint8(20 + i, bytesPlane[i] ?? 0);
  }

  descriptor.samples.forEach((sample, index) => {
    const offset = 28 + 16 * index;
    view.setUint16(offset, sample.bitOffset, true);
    view.setUint8(offset + 2, sample.bitLength);
    view.setUint8(offset + 3, sample.channelType);
    view.setUint8(offset + 4, sample.samplePosition[0] ?? 0);
    view.setUint8(offset + 5, sample.samplePosition[1] ?? 0);
    view.setUint8(offset + 6, sample.samplePosition[2] ?? 0);
    view.setUint8(offset + 7, sample.samplePosition[3] ?? 0);
    if (sample.channelType & KHR_DF_SAMPLE_DATATYPE_SIGNED) {
      view.setInt32(offset + 8, sample.sampleLower ?? 0, true);
      view.setInt32(offset + 12, sample.sampleUpper ?? 0, true);
    } else {
      view.setUint32(offset + 8, sample.sampleLower ?? 0, true);
      view.setUint32(offset + 12, sample.sampleUpper ?? 0, true);
    }
  });

  return new Uint8Array(buffer);
}

function encodeKtx2(container: KTX2Container): Uint8Array {
  const levelCount = container.levels.length;
  if (levelCount === 0) {
    throw new Error('KTX2 export requires at least one mip level');
  }

  const descriptor = container.dataFormatDescriptor[0];
  const dfdBlock = createDfdBlock(descriptor);
  const keyValueData = createKeyValueData(container.keyValue);
  const levelIndexSize = levelCount * 24;

  const dfdByteOffset = KTX2_IDENTIFIER.byteLength + 68 + levelIndexSize;
  const kvdByteOffset = dfdByteOffset + dfdBlock.byteLength;
  const kvdByteLength = align(keyValueData.byteLength, 4); // spec requires 4-byte alignment for KVD

  const texelBlockBytes = descriptor.bytesPlane[0] || container.typeSize * descriptor.samples.length || 1;
  const levelAlignment = Math.max(4, lcm(texelBlockBytes, 4));
  const dataStart = align(kvdByteOffset + kvdByteLength, levelAlignment);

  const levelOffsets: number[] = new Array(levelCount);
  const levelByteLengths: number[] = new Array(levelCount);
  const levelUncompressed: number[] = new Array(levelCount);

  let cursor = dataStart;
  for (let level = levelCount - 1; level >= 0; level -= 1) {
    const levelData = toUint8Array(container.levels[level].levelData);
    const byteLength = levelData.byteLength;
    const uncompressedLength = container.levels[level].uncompressedByteLength ?? byteLength;
    levelOffsets[level] = cursor;
    levelByteLengths[level] = byteLength;
    levelUncompressed[level] = uncompressedLength;
    cursor = align(cursor + byteLength, levelAlignment);
  }

  const totalSize = cursor;
  const output = new Uint8Array(totalSize);

  output.set(KTX2_IDENTIFIER, 0);

  const headerOffset = KTX2_IDENTIFIER.byteLength;
  const headerView = new DataView(output.buffer, output.byteOffset + headerOffset, 68);
  headerView.setUint32(0, container.vkFormat, true);
  headerView.setUint32(4, container.typeSize, true);
  headerView.setUint32(8, container.pixelWidth, true);
  headerView.setUint32(12, container.pixelHeight, true);
  headerView.setUint32(16, container.pixelDepth, true);
  headerView.setUint32(20, container.layerCount, true);
  headerView.setUint32(24, container.faceCount, true);
  headerView.setUint32(28, levelCount, true);
  headerView.setUint32(32, container.supercompressionScheme, true);
  headerView.setUint32(36, dfdByteOffset, true);
  headerView.setUint32(40, dfdBlock.byteLength, true);
  headerView.setUint32(44, kvdByteOffset, true);
  headerView.setUint32(48, kvdByteLength, true);
  headerView.setBigUint64(52, BigInt(0), true);
  headerView.setBigUint64(60, BigInt(0), true);

  const levelIndexOffset = headerOffset + 68;
  const levelIndexView = new DataView(output.buffer, output.byteOffset + levelIndexOffset, levelIndexSize);
  for (let level = 0; level < levelCount; level += 1) {
    const base = level * 24;
    levelIndexView.setBigUint64(base, BigInt(levelOffsets[level]), true);
    levelIndexView.setBigUint64(base + 8, BigInt(levelByteLengths[level]), true);
    levelIndexView.setBigUint64(base + 16, BigInt(levelUncompressed[level]), true);
  }

  output.set(dfdBlock, dfdByteOffset);
  output.set(keyValueData, kvdByteOffset);

  const levelPadding = dataStart - (kvdByteOffset + kvdByteLength);
  if (levelPadding > 0) {
    output.fill(0, kvdByteOffset + kvdByteLength, dataStart);
  }

  for (let level = levelCount - 1; level >= 0; level -= 1) {
    const data = toUint8Array(container.levels[level].levelData);
    const offset = levelOffsets[level];
    output.set(data, offset);
    const dataEnd = offset + levelByteLengths[level];
    const nextStart = level === 0 ? totalSize : levelOffsets[level - 1];
    if (nextStart > dataEnd) {
      output.fill(0, dataEnd, nextStart);
    }
  }

  return output;
}

function createKtx2Container(tex: THREE.DataTexture, mipChain: MipChain): KTX2Container {
  const container = new KTX2Container();
  const image = tex.image as { data: ArrayBufferView; width: number; height: number };
  const typeSize = image.data.BYTES_PER_ELEMENT ?? 1;
  const channels = channelCount(tex.format);

  container.vkFormat = resolveVkFormat(tex);
  container.typeSize = typeSize;
  container.pixelWidth = image.width;
  container.pixelHeight = image.height;
  container.pixelDepth = 0;
  container.layerCount = 0;
  container.faceCount = 1;
  container.supercompressionScheme = 0;

  populateBasicDfd(container, tex, typeSize, channels);

  container.levels = mipChain.map((level) => ({
    levelData: new Uint8Array(level.data),
    uncompressedByteLength: level.data.byteLength,
  }));

  container.keyValue = {
    KTXwriter: 'generate-textures.ts',
  };

  return container;
}

function writeKtx2Texture(
  tex: THREE.DataTexture,
  mipChain: MipChain,
  name: TextureName,
  outDir: string,
  cacheControl: string | undefined,
  compressionArgs: string[],
  ktxCliAvailable: boolean
): Ktx2TextureEntry {
  const { width, height, wrap, minFilter, magFilter } = textureMeta(tex);
  const rawFilename = `${name}.raw.ktx2`;
  const rawPath = path.join(outDir, rawFilename);
  const container = createKtx2Container(tex, mipChain);
  const rawBuffer = encodeKtx2(container);
  fs.writeFileSync(rawPath, Buffer.from(rawBuffer));

  const finalPath = path.join(outDir, `${name}.ktx2`);
  let compression: Ktx2TextureEntry['compression'] = 'raw';
  let compressed = false;
  const compressionHint = inferCompression(compressionArgs);

  if (ktxCliAvailable) {
    const allowedCommands = ['encode', 'deflate', 'create'];
    const usesCustomCommand = compressionArgs.length > 0 && allowedCommands.includes(compressionArgs[0]);
    const command = usesCustomCommand ? compressionArgs[0] : 'encode';
    const args = [command, ...(usesCustomCommand ? compressionArgs.slice(1) : compressionArgs), rawPath, finalPath];
    const result = spawnSync(ktxCliPath, args, { stdio: 'pipe' });
    if (!result.error && result.status === 0 && fs.existsSync(finalPath)) {
      compression = compressionHint;
      compressed = true;
    } else {
      const errOutput = result.error ? result.error.message : result.stderr?.toString()?.trim();
      console.warn(
        `ktx ${command} failed for ${name}, falling back to raw KTX2. ${errOutput ? `(${errOutput})` : ''}`.trim()
      );
    }
  }

  if (!compressed) {
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
  const ktxCliAvailable = ensureKtxCliAvailable();
  const compressionArgs = (() => {
    const args = splitArgs(ktxCliArgs);
    if (args.length > 0) return args;
    return ['--codec', 'uastc', '--uastc-quality', '4'];
  })();

  const { buildGlobeTextures } = await import('../src/textureBuilder');
  const { extendMapWithPoles, loadMapRows } = await import('../src/mapLoader');
  const { loadTerrainLookup, loadWaterChars, loadWaterPalette, selectPrimaryWaterChar } = await import('../src/terrain');
  const { ACTIVE_PALETTE_ID, ACTIVE_QUALITY_PRESET_ID, MAP_URL, TEXTURE_TILE_SCALE } = await import('../src/config');

  const mapUrl = resolveLocalUrl(process.env.MAP_URL || MAP_URL);
  const terrainUrl = resolveLocalUrl(process.env.TERRAIN_MAP_URL || '/terrain-map.json', true);
  const waterCharsUrl = resolveLocalUrl(process.env.WATER_CHARS_URL || '/water-chars.json', true);
  const waterColorsUrl = resolveLocalUrl(process.env.WATER_COLORS_URL || '/water-colors.json', true);

  const [terrain, waterChars] = await Promise.all([
    loadTerrainLookup(terrainUrl),
    loadWaterChars(waterCharsUrl),
  ]);
  const waterPalette = await loadWaterPalette(waterChars, terrain, waterColorsUrl);
  const primaryWaterChar = selectPrimaryWaterChar(waterChars, terrain);
  const baseMap = await loadMapRows(mapUrl);
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
        ktxCliAvailable
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
    ? ` (KTX2 ${ktxCliAvailable ? 'compressed via ktx' : 'raw container only'})`
    : '';
  console.info(`Wrote textures and manifest to ${outDir}${compressionNote}`);

  // Write a pointer to the latest manifest so the client can default to baked assets without a query param.
  const latestPointer = {
    manifest: `/generated/${key}/manifest.json`,
    generatedAt: manifest.generatedAt,
    preset: manifest.preset,
    palette: manifest.palette,
  };
  fs.writeFileSync(path.join(OUTPUT_ROOT, 'latest.json'), JSON.stringify(latestPointer, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
