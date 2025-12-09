import { PLANET_GROUP_GAINS, SOLAR_SYSTEM_GROUP_GAINS } from '../config';

export const AUDIO_BASE_PATH = '/audio';

export type SolarTrackName = 'solar-sun' | 'solar-earth' | 'solar-moon';
export type PlanetTrackName = 'planet-atmosphere' | 'planet-surface';

export interface SpatialAudioConfig {
  refDistance?: number;
  maxDistance?: number;
  rolloffFactor?: number;
  distanceModel?: DistanceModelType;
  panningModel?: PanningModelType;
}

export interface AudioLayerConfig {
  urls: string[];
  baseGain: number;
  spatial?: SpatialAudioConfig;
}

const AUDIO_PREFERRED_EXTENSIONS = ['webm', 'wav'] as const;
type AudioExtension = (typeof AUDIO_PREFERRED_EXTENSIONS)[number];

const pickAudioExtension = (): AudioExtension => {
  if (typeof document === 'undefined') {
    return AUDIO_PREFERRED_EXTENSIONS[0];
  }
  const probe = document.createElement('audio');
  for (const ext of AUDIO_PREFERRED_EXTENSIONS) {
    const mime = ext === 'webm' ? 'audio/webm; codecs=opus' : `audio/${ext}`;
    if (probe.canPlayType(mime)) {
      return ext;
    }
  }
  return AUDIO_PREFERRED_EXTENSIONS[AUDIO_PREFERRED_EXTENSIONS.length - 1];
};

const AUDIO_EXTENSION: AudioExtension = pickAudioExtension();

const buildAudioUrl = (fileName: string, extension: AudioExtension = AUDIO_EXTENSION) =>
  `${AUDIO_BASE_PATH}/${fileName}.${extension}`;

const buildAudioUrls = (fileName: string): string[] => {
  const fallbacks = AUDIO_PREFERRED_EXTENSIONS.filter((ext) => ext !== AUDIO_EXTENSION);
  return [buildAudioUrl(fileName, AUDIO_EXTENSION), ...fallbacks.map((ext) => buildAudioUrl(fileName, ext))];
};

export const SOLAR_SYSTEM_LAYERS: Record<SolarTrackName, AudioLayerConfig> = {
  'solar-sun': {
    urls: buildAudioUrls('solar-sun'),
    baseGain: SOLAR_SYSTEM_GROUP_GAINS.sun,
    spatial: {
      refDistance: 140,
      maxDistance: 640,
      rolloffFactor: 0.8,
      distanceModel: 'inverse',
      panningModel: 'HRTF',
    },
  },
  'solar-earth': {
    urls: buildAudioUrls('solar-earth'),
    baseGain: SOLAR_SYSTEM_GROUP_GAINS.earth,
    spatial: {
      refDistance: 18,
      maxDistance: 360,
      rolloffFactor: 1,
      distanceModel: 'inverse',
      panningModel: 'HRTF',
    },
  },
  'solar-moon': {
    urls: buildAudioUrls('solar-moon'),
    baseGain: SOLAR_SYSTEM_GROUP_GAINS.moon,
    spatial: {
      refDistance: 48,
      maxDistance: 420,
      rolloffFactor: 0.95,
      distanceModel: 'inverse',
      panningModel: 'HRTF',
    },
  },
};

export const SOLAR_SYSTEM_GROUP_NAME = 'solarSystem';

export const PLANET_LAYERS: Record<PlanetTrackName, AudioLayerConfig> = {
  'planet-atmosphere': {
    urls: buildAudioUrls('planet-atmosphere'),
    baseGain: PLANET_GROUP_GAINS.atmosphere,
  },
  'planet-surface': {
    urls: buildAudioUrls('planet-surface'),
    baseGain: PLANET_GROUP_GAINS.surface,
  },
};

export const PLANET_GROUP_NAME = 'planet';
