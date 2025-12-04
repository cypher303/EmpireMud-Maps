import './style.css';
import { bootstrapGlobe } from './globe';
import {
  DISPLACEMENT_EXAGGERATION,
  DISPLACEMENT_SCALE,
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
title.textContent = 'EmpireMUD Globe (Three.js template)';
const status = document.createElement('div');
status.className = 'status';
status.textContent = 'Loading assets…';
header.append(title, status);

const controls = document.createElement('div');
controls.className = 'controls';
const orbitTips = document.createElement('div');
orbitTips.className = 'control-row';
const orbitLabel = document.createElement('span');
orbitLabel.textContent = 'Mouse/touch orbit';
const zoomTip = document.createElement('code');
zoomTip.textContent = 'scroll / pinch to zoom';
const rotateTip = document.createElement('code');
rotateTip.textContent = 'click + drag to rotate';
orbitTips.append(orbitLabel, zoomTip, rotateTip);

const heightRow = document.createElement('div');
heightRow.className = 'control-row';
const exaggerateButton = document.createElement('button');
exaggerateButton.type = 'button';
exaggerateButton.disabled = true;
exaggerateButton.textContent = 'Height exaggeration: off';
const statsReadout = document.createElement('code');
statsReadout.textContent = 'Loading terrain stats…';
heightRow.append(exaggerateButton, statsReadout);

controls.append(orbitTips, heightRow);

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

    const baseDisplacement = stats.displacementScale || DISPLACEMENT_SCALE;
    const exaggeratedDisplacement = baseDisplacement * DISPLACEMENT_EXAGGERATION;
    let isExaggerated = false;
    const updateButton = () => {
      exaggerateButton.textContent = `Height exaggeration: ${isExaggerated ? 'on' : 'off'}`;
    };
    exaggerateButton.disabled = false;
    exaggerateButton.addEventListener('click', () => {
      isExaggerated = !isExaggerated;
      globe.setDisplacementScale(isExaggerated ? exaggeratedDisplacement : baseDisplacement);
      updateButton();
      status.textContent = `Displacement scale set to ${globe.getDisplacementScale().toFixed(2)} (gain ${stats.heightGain}x)`;
    });
    updateButton();

    const heightRange = `${stats.minHeight.toFixed(2)}-${stats.maxHeight.toFixed(2)}`;
    status.textContent = `Extended to ${extendedMap.width}x${extendedMap.extendedHeight} (padded ${extendedMap.polePadding} rows); heights ${heightRange}`;
    statsReadout.textContent = `wrap:${stats.wrapMode} land:${(stats.landRatio * 100).toFixed(1)}% water:${(
      stats.waterRatio * 100
    ).toFixed(1)}% heights:${heightRange} avg land:${stats.averageLandHeight
      .toFixed(2)} peaks:${(stats.peakRatio * 100).toFixed(2)}% segments:${suggestedSegments}`;
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
