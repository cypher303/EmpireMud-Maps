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
  url: string;
  baseGain: number;
  spatial?: SpatialAudioConfig;
}

const buildAudioUrl = (fileName: string) => `${AUDIO_BASE_PATH}/${fileName}.wav`;

export const SOLAR_SYSTEM_LAYERS: Record<SolarTrackName, AudioLayerConfig> = {
  'solar-sun': {
    url: buildAudioUrl('solar-sun'),
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
    url: buildAudioUrl('solar-earth'),
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
    url: buildAudioUrl('solar-moon'),
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
    url: buildAudioUrl('planet-atmosphere'),
    baseGain: PLANET_GROUP_GAINS.atmosphere,
  },
  'planet-surface': {
    url: buildAudioUrl('planet-surface'),
    baseGain: PLANET_GROUP_GAINS.surface,
  },
};

export const PLANET_GROUP_NAME = 'planet';
