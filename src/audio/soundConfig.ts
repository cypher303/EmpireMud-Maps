export const AUDIO_BASE_PATH = '/audio';

export type SolarTrackName = 'solar-sun' | 'solar-earth' | 'solar-moon';

export interface AudioLayerConfig {
  url: string;
  baseGain: number;
}

const buildAudioUrl = (fileName: string) => `${AUDIO_BASE_PATH}/${fileName}.wav`;

export const SOLAR_SYSTEM_LAYERS: Record<SolarTrackName, AudioLayerConfig> = {
  'solar-sun': {
    url: buildAudioUrl('solar-sun'),
    baseGain: 0.9,
  },
  'solar-earth': {
    url: buildAudioUrl('solar-earth'),
    baseGain: 0.65,
  },
  'solar-moon': {
    url: buildAudioUrl('solar-moon'),
    baseGain: 0.35,
  },
};

export const SOLAR_SYSTEM_GROUP_NAME = 'solarSystem';
