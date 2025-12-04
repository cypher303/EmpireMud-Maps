import './style.css';
import { bootstrapGlobe } from './globe';
import {
  MAP_URL,
  MAX_SPHERE_SEGMENTS,
  MIN_SPHERE_SEGMENTS,
  SEGMENT_TO_TEXTURE_RATIO,
} from './config';
import { extendMapWithPoles, loadMapRows } from './mapLoader';
import { buildGlobeTextures } from './textureBuilder';
import { loadTerrainLookup, loadWaterChars } from './terrain';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app mount point');
}

const header = document.createElement('header');
const title = document.createElement('h1');
title.textContent = 'Ready Source:';
const status = document.createElement('code');
status.className = 'status';
status.textContent = MAP_URL;
header.append(title, status);

const controls = document.createElement('div');
controls.className = 'controls';
const fullscreenButton = document.createElement('button');
fullscreenButton.type = 'button';
fullscreenButton.textContent = 'Fullscreen';
fullscreenButton.className = 'ghost';
controls.append(fullscreenButton);

const canvasContainer = document.createElement('div');
canvasContainer.className = 'canvas-container';

app.append(header, controls, canvasContainer);

const toggleFullscreen = async () => {
  if (!document.fullscreenElement) {
    await app.requestFullscreen();
  } else {
    await document.exitFullscreen();
  }
};

fullscreenButton.addEventListener('click', () => {
  toggleFullscreen().catch((error) => console.warn('Fullscreen request failed', error));
});

document.addEventListener('fullscreenchange', () => {
  const isFullscreen = Boolean(document.fullscreenElement);
  app.classList.toggle('fullscreen-active', isFullscreen);
  fullscreenButton.textContent = isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen';
});

async function bootstrap(): Promise<void> {
  try {
    const [terrain, waterChars] = await Promise.all([loadTerrainLookup(), loadWaterChars()]);
    status.textContent = `Terrain mapping loaded (${Object.keys(terrain).length} tiles)`;

    const baseMap = await loadMapRows(MAP_URL);
    status.textContent = `Map loaded (${baseMap.width}x${baseMap.height})`;

    const extendedMap = extendMapWithPoles(baseMap, waterChars[0]);
    const { colorTexture, heightTexture, stats } = buildGlobeTextures(extendedMap, terrain, waterChars);
    const suggestedSegments = Math.max(
      MIN_SPHERE_SEGMENTS,
      Math.min(MAX_SPHERE_SEGMENTS, Math.round(extendedMap.width / SEGMENT_TO_TEXTURE_RATIO))
    );
    const globe = bootstrapGlobe({
      texture: colorTexture,
      heightMap: heightTexture,
      container: canvasContainer,
      segments: suggestedSegments,
    });

    status.textContent = MAP_URL;
    console.info('Map + height stats', {
      baseMap: { width: baseMap.width, height: baseMap.height },
      extended: { width: extendedMap.width, height: extendedMap.extendedHeight, polePadding: extendedMap.polePadding },
      texture: { wrapMode: stats.wrapMode, isPowerOfTwo: stats.isPowerOfTwo },
      heights: {
        min: stats.minHeight,
        max: stats.maxHeight,
        averageLandHeight: stats.averageLandHeight,
        nonZeroRatio: stats.nonZeroRatio,
        peakRatio: stats.peakRatio,
        peakThreshold: stats.peakThreshold,
        gain: stats.heightGain,
      },
      displacementScale: globe.getDisplacementScale(),
      segments: suggestedSegments,
    });

    window.addEventListener('beforeunload', globe.dispose, { once: true });
  } catch (error) {
    console.error(error);
    status.textContent = 'Failed to initialize. Check console for details.';
  }
}

bootstrap();
