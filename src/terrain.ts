import { DEFAULT_WATER_CHAR, DEFAULT_WATER_COLORS, TERRAIN_MAP_URL, WATER_CHARS_URL, WATER_COLORS_URL } from './config';

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
  if (terrain && Object.keys(terrain).length > 0) {
    return terrain;
  }

  return {
    [DEFAULT_WATER_CHAR]: { color: '#0f4f8f', description: 'Fallback water' },
  };
}

export async function loadWaterChars(url: string = WATER_CHARS_URL): Promise<string[]> {
  const data = await fetchJson<{ water: string[] }>(url);
  if (data?.water?.length) {
    return data.water;
  }
  return [DEFAULT_WATER_CHAR];
}

function normalizeHexColor(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

type WaterPaletteResponse = WaterPalette | { colors?: WaterPalette };

export async function loadWaterPalette(
  waterChars: string[],
  terrain: TerrainLookup,
  url: string = WATER_COLORS_URL
): Promise<WaterPalette> {
  const tokens = waterChars && waterChars.length > 0 ? waterChars : [DEFAULT_WATER_CHAR];
  const response = await fetchJson<WaterPaletteResponse>(url);
  const paletteSource = (response && 'colors' in (response as any) ? (response as any).colors : response) ?? {};
  const palette: WaterPalette = {};

  const resolveColor = (token: string): string | null => {
    const fromResponse = normalizeHexColor((paletteSource as Record<string, string | undefined>)[token]);
    if (fromResponse) return fromResponse;
    const fromDefaults = normalizeHexColor(DEFAULT_WATER_COLORS[token]);
    if (fromDefaults) return fromDefaults;
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

  const primary = tokens[0] ?? DEFAULT_WATER_CHAR;
  if (!palette[primary]) {
    palette[primary] = resolveColor(primary) ?? '#0f4f8f';
  }

  return palette;
}
