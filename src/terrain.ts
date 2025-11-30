import { DEFAULT_WATER_CHAR, TERRAIN_MAP_URL, WATER_CHARS_URL } from './config';

export interface TerrainEntry {
  color: string;
  description?: string;
}

export type TerrainLookup = Record<string, TerrainEntry>;

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
