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
import { loadManifestTextures } from './manifestLoader';
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
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

let activeTextures: LoadedTextures | null = null;
let activeTierLabel: string | undefined;

const disposeGlobe = () => {
  if (globeHandle) {
    globeHandle.dispose();
    globeHandle = null;
  }
};

const clearHeatmapPreview = () => {
  heatmapPreview.hidden = true;
  heatmapPreview.replaceChildren();
};

const manifestParams =
  typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const manifestParam = manifestParams?.get('manifest');
const manifestLowParam = manifestParams?.get('manifestLow') ?? manifestParams?.get('manifest-low');
const manifestHighParam = manifestParams?.get('manifestHigh') ?? manifestParams?.get('manifest-high');
const manifestFirstChoice = manifestLowParam ?? manifestParam ?? manifestHighParam;
const manifestUpgradeChoice =
  manifestLowParam && (manifestHighParam || manifestParam)
    ? manifestHighParam ?? manifestParam
    : manifestParam && manifestHighParam
      ? manifestHighParam
      : null;
const manifestUpgradeTarget =
  manifestUpgradeChoice && manifestUpgradeChoice !== manifestFirstChoice ? manifestUpgradeChoice : null;

const textureByteLength = (tex: THREE.DataTexture) => {
  const img = tex.image as { data?: ArrayBufferView };
  return img?.data?.byteLength ?? 0;
};

type LoadedTextures =
  | (ReturnType<typeof buildGlobeTextures> & {
      fromManifest: false;
      manifestUrl?: undefined;
      usedCompressed?: false;
    })
  | (Awaited<ReturnType<typeof loadManifestTextures>> & { fromManifest: true; manifestUrl: string });

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

async function resolveDefaultManifestUrl(): Promise<string | null> {
  try {
    const res = await fetch('/generated/latest.json', { cache: 'no-cache' });
    if (!res.ok) return null;
    const data = (await res.json()) as { manifest?: string | null };
    if (typeof data?.manifest === 'string' && data.manifest.length > 0) {
      return data.manifest;
    }
  } catch (error) {
    console.warn('No default manifest pointer found; falling back to client-side generation.', error);
  }
  return null;
}

const buildStatusLabel = (loaded: LoadedTextures, tierLabel?: string) => {
  if (loaded.fromManifest) {
    const prefix = tierLabel ? `${tierLabel} ` : '';
    return `${prefix}manifest ${loaded.manifest.id} (preset ${loaded.manifest.preset}, palette ${loaded.manifest.palette})`;
  }
  return `${MAP_URL} (${ACTIVE_QUALITY_PRESET_ID} preset, ${ACTIVE_PALETTE_ID} palette)`;
};

const renderGlobe = (
  loaded: LoadedTextures,
  baseMap: { width: number; height: number },
  extendedMap: { width: number; height: number; polePadding: number; extendedHeight: number },
  timingStart: number,
  options?: { heightPreviewDataUrl?: string; tierLabel?: string }
) => {
  const { colorTexture, heightTexture, normalTexture, mountainMaskTexture, stats } = loaded;
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
  activeTextures = loaded;
  activeTierLabel = options?.tierLabel;

  const timingMs = performance.now() - timingStart;

  status.textContent = buildStatusLabel(loaded, options?.tierLabel);
  const breakdownBytes = loaded.fromManifest
    ? loaded.bytes
    : {
        color: textureByteLength(colorTexture as THREE.DataTexture),
        normal: textureByteLength(normalTexture as THREE.DataTexture),
        height: textureByteLength(heightTexture as THREE.DataTexture),
        mountainMask: textureByteLength(mountainMaskTexture as THREE.DataTexture),
      };
  const totalBytes = Object.values(breakdownBytes).reduce((sum, v) => sum + v, 0);
  console.info('Texture load timing', {
    source: loaded.fromManifest ? 'manifest' : 'local-generation',
    tier: options?.tierLabel ?? (loaded.fromManifest ? 'manifest' : 'local'),
    manifestUrl: loaded.fromManifest ? loaded.manifestUrl : undefined,
    compressed: loaded.fromManifest ? loaded.usedCompressed ?? false : false,
    ms: Math.round(timingMs),
    totalBytes,
    breakdownBytes,
  });
  console.info('Map + height stats', {
    manifest: loaded.fromManifest ? loaded.manifest : null,
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
    palette: loaded.fromManifest ? loaded.manifest.palette : ACTIVE_PALETTE_ID,
    displacementScale: globe?.getDisplacementScale() ?? 0,
    segments: suggestedSegments,
    preset: {
      id: loaded.fromManifest ? loaded.manifest.preset : ACTIVE_QUALITY_PRESET_ID,
      textureTileScale: TEXTURE_TILE_SCALE,
      segmentToTextureRatio: SEGMENT_TO_TEXTURE_RATIO,
      gpuRelief: {
        amplitude: GPU_RELIEF_AMPLITUDE,
        frequency: GPU_RELIEF_FREQUENCY,
        warp: GPU_RELIEF_WARP,
        octaves: GPU_RELIEF_OCTAVES,
      },
    },
  });

  if (options?.heightPreviewDataUrl) {
    const previewLabel = document.createElement('span');
    previewLabel.className = 'heatmap-label';
    previewLabel.textContent = 'Heightmap';
    const preview = document.createElement('img');
    preview.src = options.heightPreviewDataUrl;
    preview.alt = 'Height preview';
    preview.className = 'heatmap-preview-image';
    heatmapPreview.replaceChildren(previewLabel, preview);
    heatmapPreview.hidden = false;
  }

  if (globeHandle) {
    window.addEventListener('beforeunload', globeHandle.dispose, { once: true });
  }
};

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
    disposeGlobe();
    clearHeatmapPreview();
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    const timingStart = performance.now();
    let heightPreviewDataUrl: string | undefined;
    let tierLabel: string | undefined;

    let loaded: LoadedTextures | null = null;

    let initialManifestUrl = manifestFirstChoice;
    if (!initialManifestUrl) {
      initialManifestUrl = await resolveDefaultManifestUrl();
    }
    if (initialManifestUrl) {
      try {
        const manifestResult = await loadManifestTextures(initialManifestUrl, { renderer });
        loaded = { ...manifestResult, fromManifest: true, manifestUrl: initialManifestUrl };
        tierLabel = manifestLowParam && initialManifestUrl === manifestLowParam ? 'low' : undefined;
        status.textContent = `Loaded manifest ${manifestResult.manifest.id} (preset ${manifestResult.manifest.preset}, palette ${manifestResult.manifest.palette})`;
      } catch (error) {
        console.warn(`Failed to load manifest ${initialManifestUrl}, falling back to client generation.`, error);
      }
    }

    if (!loaded) {
      const generated = buildGlobeTextures(extendedMap, terrain, waterChars, renderer, waterPalette);
      heightPreviewDataUrl = generated.heightPreviewDataUrl;
      loaded = { ...generated, fromManifest: false };
      tierLabel = undefined;
      status.textContent = `Map loaded (${baseMap.width}x${baseMap.height})`;
    }

    renderGlobe(loaded, { width: baseMap.width, height: baseMap.height }, extendedMap, timingStart, {
      heightPreviewDataUrl,
      tierLabel,
    });

    if (manifestUpgradeTarget && (!loaded.fromManifest || loaded.manifestUrl !== manifestUpgradeTarget)) {
      const upgradeLabel =
        manifestHighParam && manifestUpgradeTarget === manifestHighParam
          ? 'high'
          : manifestUpgradeTarget !== initialManifestUrl
            ? 'upgrade'
            : undefined;
      status.textContent = `Loading ${upgradeLabel ?? 'high-res'} manifest...`;
      try {
        const upgradeStart = performance.now();
        const manifestResult = await loadManifestTextures(manifestUpgradeTarget, { renderer });
        renderGlobe(
          { ...manifestResult, fromManifest: true, manifestUrl: manifestUpgradeTarget },
          { width: baseMap.width, height: baseMap.height },
          extendedMap,
          upgradeStart,
          { tierLabel: upgradeLabel }
        );
      } catch (error) {
        console.warn(`Failed to load upgrade manifest ${manifestUpgradeTarget}.`, error);
        status.textContent = buildStatusLabel(activeTextures ?? loaded, activeTierLabel ?? tierLabel);
      }
    }
  } catch (error) {
    console.error(error);
    status.textContent = 'Failed to initialize. Check console for details.';
  }
}

bootstrap();
