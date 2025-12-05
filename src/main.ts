import './style.css';
import * as THREE from 'three';
import { bootstrapGlobe } from './globe';
import {
  ACTIVE_PALETTE_ID,
  ACTIVE_QUALITY_PRESET_ID,
  ATMOSPHERE_DEFAULT_ENABLED,
  CLOUDS_DEFAULT_ENABLED,
  GPU_RELIEF_AMPLITUDE,
  GPU_RELIEF_FREQUENCY,
  GPU_RELIEF_OCTAVES,
  GPU_RELIEF_WARP,
  MAP_URL,
  MAX_SPHERE_SEGMENTS,
  MIN_SPHERE_SEGMENTS,
  SEGMENT_TO_TEXTURE_RATIO,
  TEXTURE_TILE_SCALE,
} from './config';
import { extendMapWithPoles, loadMapRows } from './mapLoader';
import { buildGlobeTextures } from './textureBuilder';
import { loadTerrainLookup, loadWaterChars, loadWaterPalette, selectPrimaryWaterChar } from './terrain';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app mount point');
}

const header = document.createElement('header');
const title = document.createElement('h1');
title.textContent = 'Ready Source:';
const status = document.createElement('code');
status.className = 'status';
status.textContent = 'Loading terrain lookup tables. Please be patient (average load time 10 seconds).';
header.append(title, status);

const controls = document.createElement('div');
controls.className = 'controls';
const toggleRow = document.createElement('div');
toggleRow.className = 'control-row';
const atmosphereToggle = document.createElement('label');
atmosphereToggle.className = 'toggle';
const atmosphereCheckbox = document.createElement('input');
atmosphereCheckbox.type = 'checkbox';
atmosphereCheckbox.checked = ATMOSPHERE_DEFAULT_ENABLED;
const atmosphereCaption = document.createElement('span');
atmosphereCaption.textContent = 'Atmosphere';
atmosphereToggle.append(atmosphereCheckbox, atmosphereCaption);

const cloudsToggle = document.createElement('label');
cloudsToggle.className = 'toggle';
const cloudsCheckbox = document.createElement('input');
cloudsCheckbox.type = 'checkbox';
cloudsCheckbox.checked = CLOUDS_DEFAULT_ENABLED;
const cloudsCaption = document.createElement('span');
cloudsCaption.textContent = 'Clouds';
cloudsToggle.append(cloudsCheckbox, cloudsCaption);
toggleRow.append(atmosphereToggle, cloudsToggle);

const fullscreenButton = document.createElement('button');
fullscreenButton.type = 'button';
fullscreenButton.textContent = 'Fullscreen';
fullscreenButton.className = 'ghost';
controls.append(toggleRow, fullscreenButton);

const heatmapPreview = document.createElement('div');
heatmapPreview.className = 'heatmap-preview';
heatmapPreview.hidden = true;

const canvasContainer = document.createElement('div');
canvasContainer.className = 'canvas-container';

app.append(header, controls, canvasContainer, heatmapPreview);

let globeHandle: ReturnType<typeof bootstrapGlobe> | null = null;

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

atmosphereCheckbox.addEventListener('change', () => {
  globeHandle?.setAtmosphereVisible(atmosphereCheckbox.checked);
});

cloudsCheckbox.addEventListener('change', () => {
  globeHandle?.setCloudsVisible(cloudsCheckbox.checked);
});

async function bootstrap(): Promise<void> {
  try {
    const [terrain, waterChars] = await Promise.all([loadTerrainLookup(), loadWaterChars()]);
    status.textContent = `Terrain mapping loaded (${Object.keys(terrain).length} tiles)`;
    const waterPalette = await loadWaterPalette(waterChars, terrain);
    const primaryWaterChar = selectPrimaryWaterChar(waterChars, terrain);

    const baseMap = await loadMapRows(MAP_URL);
    status.textContent = `Map loaded (${baseMap.width}x${baseMap.height})`;

    const extendedMap = extendMapWithPoles(baseMap, primaryWaterChar);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    const {
      colorTexture,
      heightTexture,
      normalTexture,
      mountainMaskTexture,
      heightPreviewDataUrl,
      stats,
    } = buildGlobeTextures(
      extendedMap,
      terrain,
      waterChars,
      renderer,
      waterPalette
    );
    const suggestedSegments = Math.max(
      MIN_SPHERE_SEGMENTS,
      Math.min(MAX_SPHERE_SEGMENTS, Math.round(stats.width / SEGMENT_TO_TEXTURE_RATIO))
    );
    globeHandle?.dispose();
    globeHandle = bootstrapGlobe({
      texture: colorTexture,
      heightMap: heightTexture,
      normalMap: normalTexture,
      mountainMask: mountainMaskTexture,
      container: canvasContainer,
      segments: suggestedSegments,
      renderer,
      atmosphereEnabled: atmosphereCheckbox.checked,
      cloudsEnabled: cloudsCheckbox.checked,
    });
    const globe = globeHandle;

    status.textContent = `${MAP_URL} (${ACTIVE_QUALITY_PRESET_ID} preset, ${ACTIVE_PALETTE_ID} palette)`;
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
        normalStrength: stats.normalStrength,
        missingHeightEntries: stats.missingHeightEntries,
        waterFlatness: {
          maxHeight: stats.waterMaxHeight,
          nonZeroRatio: stats.waterNonZeroRatio,
        },
      },
      mountains: {
        maskRatio: stats.mountainMaskRatio,
        influenceAverage: stats.mountainInfluenceAverage,
      },
      preset: {
        id: ACTIVE_QUALITY_PRESET_ID,
        textureTileScale: TEXTURE_TILE_SCALE,
        segmentToTextureRatio: SEGMENT_TO_TEXTURE_RATIO,
        gpuRelief: {
          amplitude: GPU_RELIEF_AMPLITUDE,
          frequency: GPU_RELIEF_FREQUENCY,
          warp: GPU_RELIEF_WARP,
          octaves: GPU_RELIEF_OCTAVES,
        },
      },
      palette: ACTIVE_PALETTE_ID,
      displacementScale: globe?.getDisplacementScale() ?? 0,
      segments: suggestedSegments,
    });

    if (heightPreviewDataUrl) {
      const previewLabel = document.createElement('span');
      previewLabel.className = 'heatmap-label';
      previewLabel.textContent = 'Heightmap';
      const preview = document.createElement('img');
      preview.src = heightPreviewDataUrl;
      preview.alt = 'Height preview';
      preview.className = 'heatmap-preview-image';
      heatmapPreview.replaceChildren(previewLabel, preview);
      heatmapPreview.hidden = false;
    }

    if (globeHandle) {
      window.addEventListener('beforeunload', globeHandle.dispose, { once: true });
    }
  } catch (error) {
    console.error(error);
    status.textContent = 'Failed to initialize. Check console for details.';
  }
}

bootstrap();
