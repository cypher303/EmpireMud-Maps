import { DEFAULT_WATER_CHAR, MAP_URL, POLE_PADDING_FACTOR } from './config';

export interface ParsedMap {
  rows: string[];
  width: number;
  height: number;
}

export interface ExtendedMap extends ParsedMap {
  extendedRows: string[];
  extendedHeight: number;
  polePadding: number;
}

function normalizeRows(mapText: string): string[] {
  return mapText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => line.length > 0);
}

function validateWidth(rows: string[]): number {
  const widths = rows.map((row) => row.length);
  const uniqueWidths = new Set(widths);
  if (uniqueWidths.size > 1) {
    console.warn('Detected ragged map rows; using the shortest width for downstream steps.');
  }
  return Math.min(...widths);
}

export async function loadMapRows(sourceUrl: string = MAP_URL): Promise<ParsedMap> {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Unable to fetch map from ${sourceUrl}: ${response.status} ${response.statusText}`);
  }

  const mapText = await response.text();
  const rows = normalizeRows(mapText);
  const width = validateWidth(rows);
  const height = rows.length;

  const trimmedRows = rows.map((row) => row.slice(0, width));

  return { rows: trimmedRows, width, height };
}

export function extendMapWithPoles(map: ParsedMap, waterChar: string = DEFAULT_WATER_CHAR): ExtendedMap {
  const polePadding = Math.max(1, Math.round(map.height * POLE_PADDING_FACTOR));
  const waterRow = waterChar.repeat(map.width);
  const extendedRows = [
    ...Array.from({ length: polePadding }, () => waterRow),
    ...map.rows,
    ...Array.from({ length: polePadding }, () => waterRow),
  ];

  return {
    ...map,
    extendedRows,
    extendedHeight: extendedRows.length,
    polePadding,
  };
}
