import { DEFAULT_TILE_COLOR, TERRAIN_MAP_URL, WATER_CHARS_URL, WATER_COLORS_URL } from './config';

export interface TerrainEntry {
  color: string;
  description?: string;
  height?: number;
}

export type TerrainLookup = Record<string, TerrainEntry>;
export type WaterPalette = Record<string, string>;

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Failed to fetch ${url}: ${response.statusText}`);
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    console.warn(`Unable to load ${url}:`, error);
    return null;
  }
}

export async function loadTerrainLookup(url: string = TERRAIN_MAP_URL): Promise<TerrainLookup> {
  const terrain = await fetchJson<TerrainLookup>(url);
  if (!terrain || Object.keys(terrain).length === 0) {
    throw new Error('terrain-map.json is missing or empty. Run npm run extract:terrain to regenerate it from php/map.php.');
  }
  return terrain;
}

export async function loadWaterChars(url: string = WATER_CHARS_URL): Promise<string[]> {
  const data = await fetchJson<{ water: string[] }>(url);
  if (!data?.water?.length) {
    throw new Error('water-chars.json is missing or empty. Run npm run extract:terrain to regenerate it from php/map.php.');
  }
  const chars = data.water.filter((token) => typeof token === 'string' && token.length > 0);
  if (!chars.length) {
    throw new Error('water-chars.json contained no usable entries. Ensure extract-terrain.mjs parsed php/map.php correctly.');
  }
  return Array.from(new Set(chars));
}

function normalizeHexColor(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

const WATER_KEYWORDS = ['ocean', 'sea', 'deep water'];

export function selectPrimaryWaterChar(waterChars: string[], terrain: TerrainLookup): string {
  if (!waterChars.length) {
    throw new Error('Cannot select a primary water character without any water tokens.');
  }

  const matchByKeyword = waterChars.find((token) => {
    const description = terrain[token]?.description?.toLowerCase() ?? '';
    return WATER_KEYWORDS.some((keyword) => description.includes(keyword));
  });
  if (matchByKeyword) return matchByKeyword;

  const matchByHeight = waterChars.find((token) => {
    const height = terrain[token]?.height;
    return height === undefined || height === null || height === 0;
  });
  if (matchByHeight) return matchByHeight;

  return waterChars[0];
}

type WaterPaletteResponse = WaterPalette | { colors?: WaterPalette };

export async function loadWaterPalette(
  waterChars: string[],
  terrain: TerrainLookup,
  url: string = WATER_COLORS_URL
): Promise<WaterPalette> {
  if (!waterChars.length) {
    throw new Error('Cannot build a water palette without water characters. Ensure extract-terrain.mjs ran successfully.');
  }
  const tokens = Array.from(new Set(waterChars));
  const response = await fetchJson<WaterPaletteResponse>(url);
  const paletteSource = (response && 'colors' in (response as any) ? (response as any).colors : response) ?? {};
  const palette: WaterPalette = {};

  const primary = selectPrimaryWaterChar(tokens, terrain);
  const resolveColor = (token: string): string | null => {
    const fromResponse = normalizeHexColor((paletteSource as Record<string, string | undefined>)[token]);
    if (fromResponse) return fromResponse;
    const fromTerrain = normalizeHexColor(terrain?.[token]?.color);
    if (fromTerrain) return fromTerrain;
    return null;
  };

  tokens.forEach((token) => {
    const color = resolveColor(token);
    if (color) {
      palette[token] = color;
    }
  });

  if (!palette[primary]) {
    const fallback =
      resolveColor(primary) ??
      normalizeHexColor((paletteSource as Record<string, string | undefined>)[primary]) ??
      normalizeHexColor(DEFAULT_TILE_COLOR) ??
      '#0f4f8f';
    palette[primary] = fallback;
  }

  return palette;
}
