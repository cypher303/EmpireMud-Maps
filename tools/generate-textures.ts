import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import type { TextureBuildStats } from '../src/textureBuilder';

type WrapMode = 'clamp' | 'repeat';
type TextureFormat = 'rgba8' | 'rg8' | 'r8';

interface TextureEntry {
  path: string;
  format: TextureFormat;
  width: number;
  height: number;
  wrap: WrapMode;
  minFilter: 'nearest' | 'linear';
  magFilter: 'nearest' | 'linear';
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
  stats: TextureBuildStats;
  cacheControl?: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_ROOT = path.resolve(__dirname, '../dist/generated');
const DEFAULT_CACHE_CONTROL = 'public, max-age=31536000, immutable';

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

if (mapOverride) (process as any).env.MAP_URL = mapOverride;
if (presetOverride) (process as any).env.QUALITY_PRESET = presetOverride;
if (paletteOverride) (process as any).env.PALETTE = paletteOverride;

const OUTPUT_DIR = outOverride ? path.resolve(outOverride) : OUTPUT_ROOT;

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function hashKey(parts: Record<string, unknown>): string {
  const h = crypto.createHash('sha1');
  h.update(JSON.stringify(parts));
  return h.digest('hex').slice(0, 12);
}

function writeBinaryTexture(
  tex: THREE.DataTexture,
  name: string,
  outDir: string,
  cacheControl: string | undefined
): TextureEntry {
  const { data, width, height } = tex.image as { data: BufferSource; width: number; height: number };
  if (!data || typeof width !== 'number' || typeof height !== 'number') {
    throw new Error(`Texture ${name} missing image data`);
  }
  const buffer = Buffer.from(data as ArrayBufferLike);
  const filename = `${name}.bin`;
  fs.writeFileSync(path.join(outDir, filename), buffer);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');

  const format: TextureFormat =
    tex.format === THREE.RGBAFormat ? 'rgba8' : tex.format === THREE.RGFormat ? 'rg8' : 'r8';

  return {
    path: filename,
    format,
    width,
    height,
    wrap: tex.wrapS === THREE.RepeatWrapping || tex.wrapT === THREE.RepeatWrapping ? 'repeat' : 'clamp',
    minFilter: tex.minFilter === THREE.NearestFilter ? 'nearest' : 'linear',
    magFilter: tex.magFilter === THREE.NearestFilter ? 'nearest' : 'linear',
    size: buffer.byteLength,
    hash,
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

  const { buildGlobeTextures, type TextureBuildStats } = await import('../src/textureBuilder');
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
  if (fs.existsSync(existingManifest)) {
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

  const cacheControl = DEFAULT_CACHE_CONTROL;
  const colorEntry = writeBinaryTexture(colorTexture, 'color', outDir, cacheControl);
  const normalEntry = writeBinaryTexture(normalTexture, 'normal', outDir, cacheControl);
  const heightEntry = writeBinaryTexture(heightTexture, 'height', outDir, cacheControl);
  const mountainMaskEntry = writeBinaryTexture(mountainMaskTexture, 'mountainMask', outDir, cacheControl);

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
    cacheControl,
    stats,
  };

  fs.writeFileSync(existingManifest, JSON.stringify(manifest, null, 2));
  console.info(`Wrote textures and manifest to ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
