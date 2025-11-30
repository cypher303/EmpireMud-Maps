import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const SOURCE_FILE = 'php/map.php';
const TERRAIN_OUT = 'public/terrain-map.json';
const WATER_OUT = 'public/water-chars.json';

const waterKeywords = ['ocean', 'river', 'oasis', 'water'];

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function toHex(r, g, b) {
  return `#${[r, g, b]
    .map((component) => Number(component).toString(16).padStart(2, '0'))
    .join('')}`;
}

function parseTerrainFile() {
  const php = readFileSync(SOURCE_FILE, 'utf8');
  const mapping = {};
  const water = new Set();
  const regex = /['"](.?)['"]\s*=>\s*imagecolorallocate\(\$im,\s*(\d+),\s*(\d+),\s*(\d+)\),\s*\/\/\s*(.+)/g;

  let match;
  while ((match = regex.exec(php)) !== null) {
    const [, char, r, g, b, description] = match;
    const normalizedDescription = description.trim();
    mapping[char] = {
      color: toHex(r, g, b),
      description: normalizedDescription,
    };

    const lower = normalizedDescription.toLowerCase();
    if (waterKeywords.some((keyword) => lower.includes(keyword))) {
      water.add(char);
    }
  }

  return { mapping, water: Array.from(water) };
}

function main() {
  const { mapping, water } = parseTerrainFile();
  ensureDir(TERRAIN_OUT);
  writeFileSync(TERRAIN_OUT, `${JSON.stringify(mapping, null, 2)}\n`);
  writeFileSync(WATER_OUT, `${JSON.stringify({ water }, null, 2)}\n`);

  console.log(`Terrain entries: ${Object.keys(mapping).length}`);
  console.log(`Water characters: ${water.join(', ') || 'none detected'}`);
}

main();
