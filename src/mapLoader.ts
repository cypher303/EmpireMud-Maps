import { MAP_URL, POLE_PADDING_FACTOR } from './config';

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

function stripDimensionHeader(rows: string[]): {
  rows: string[];
  expectedWidth?: number;
  expectedHeight?: number;
} {
  if (rows.length === 0) return { rows };

  const match = rows[0].match(/^(\d+)x(\d+)$/i);
  if (!match) return { rows };

  const [, width, height] = match;
  return {
    rows: rows.slice(1),
    expectedWidth: Number(width),
    expectedHeight: Number(height),
  };
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
  const { rows: parsedRows, expectedWidth, expectedHeight } = stripDimensionHeader(normalizeRows(mapText));

  if (parsedRows.length === 0) {
    throw new Error('Map contained no rows after parsing; verify map.txt contents.');
  }

  const width = validateWidth(parsedRows);
  const height = parsedRows.length;

  if ((expectedWidth && expectedWidth !== width) || (expectedHeight && expectedHeight !== height)) {
    console.warn(
      `Map dimensions differ from header (${expectedWidth}x${expectedHeight}); using detected ${width}x${height}.`
    );
  }

  // Align with php/map.php orientation: map comes out upside-down there, so reverse rows to match legacy behavior.
  const trimmedRows = parsedRows
    .map((row) => row.slice(0, width))
    .reverse();

  return { rows: trimmedRows, width, height };
}

export function extendMapWithPoles(map: ParsedMap, waterChar: string): ExtendedMap {
  if (!waterChar) {
    throw new Error('extendMapWithPoles requires a water character from water-chars.json');
  }
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
