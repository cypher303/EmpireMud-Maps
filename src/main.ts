import './style.css';
import { bootstrapGlobe } from './globe';
import { MAP_URL } from './config';
import { extendMapWithPoles, loadMapRows } from './mapLoader';
import { buildGlobeTextures } from './textureBuilder';
import { loadTerrainLookup, loadWaterChars } from './terrain';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app mount point');
}

const header = document.createElement('header');
const title = document.createElement('h1');
title.textContent = 'EmpireMUD Globe (Three.js template)';
const status = document.createElement('div');
status.className = 'status';
status.textContent = 'Loading assets…';
header.append(title, status);

const controls = document.createElement('div');
controls.className = 'controls';
controls.innerHTML = `
  <span>Mouse/touch orbit</span>
  <code>scroll / pinch to zoom</code>
  <code>click + drag to rotate</code>
`;

const canvasContainer = document.createElement('div');
canvasContainer.style.flex = '1';
canvasContainer.style.minHeight = '360px';

app.append(header, controls, canvasContainer);

async function bootstrap(): Promise<void> {
  try {
    const [terrain, waterChars] = await Promise.all([loadTerrainLookup(), loadWaterChars()]);
    status.textContent = `Terrain mapping loaded (${Object.keys(terrain).length} tiles)`;

    const baseMap = await loadMapRows(MAP_URL);
    status.textContent = `Map loaded (${baseMap.width}x${baseMap.height})`;

    const extendedMap = extendMapWithPoles(baseMap, waterChars[0]);
    const { colorTexture, heightTexture } = buildGlobeTextures(extendedMap, terrain, waterChars);
    const dispose = bootstrapGlobe({ texture: colorTexture, heightMap: heightTexture, container: canvasContainer });

    status.textContent = `Extended to ${extendedMap.width}x${extendedMap.extendedHeight} (padded ${extendedMap.polePadding} rows)`;

    window.addEventListener('beforeunload', dispose, { once: true });
  } catch (error) {
    console.error(error);
    status.textContent = 'Failed to initialize. Check console for details.';
  }
}

bootstrap();
