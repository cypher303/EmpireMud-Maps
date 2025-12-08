import assert from 'node:assert/strict';

import { LANDMARK_SOUND_THEMES } from '../../src/audio/landmark_themes.ts';
import { getLandmarkSound, getLandmarkSoundRef } from '../../src/audio/index.ts';

const EXPECTED_IDS: Record<string, string> = {
  shore: 'sfx_shore_waves_placeholder',
  ocean: 'sfx_ocean_swell_placeholder',
  mountain: 'sfx_mountain_wind_placeholder',
  forest: 'sfx_forest_birds_placeholder',
  desert: 'sfx_desert_wind_placeholder',
};

for (const [landmark, expectedId] of Object.entries(EXPECTED_IDS)) {
  const ref = getLandmarkSoundRef(landmark);
  assert.ok(ref, `Expected sound ref for ${landmark}`);
  assert.equal(ref?.id, expectedId, `Sound ref id for ${landmark} should match mapping`);

  const id = getLandmarkSound(landmark);
  assert.equal(id, expectedId, `getLandmarkSound should return the mapped id for ${landmark}`);
}

assert.equal(
  getLandmarkSound('unknown-landmark'),
  null,
  'Unknown landmarks should resolve to null so callers can choose a fallback',
);

assert.equal(
  getLandmarkSoundRef('unknown-landmark'),
  null,
  'Unknown landmarks should return null references',
);

for (const [landmark, theme] of Object.entries(LANDMARK_SOUND_THEMES)) {
  assert.equal(
    theme.id,
    EXPECTED_IDS[landmark],
    `LANDMARK_SOUND_THEMES should expose the placeholder id for ${landmark}`,
  );
}
