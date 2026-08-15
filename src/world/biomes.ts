import { BIOME } from '../config';

export type BiomeId = 'canyon' | 'cyber-city' | 'ice-cave';

export type BiomePreset = {
  id: BiomeId;
  label: string;
  fogColor: number;
  groundColor: number;
  laneColor: number;
  ambientColor: number;
  hemisphereSkyColor: number;
  hemisphereGroundColor: number;
  directionalColor: number;
};

export const BIOME_ORDER: readonly BiomeId[] = ['canyon', 'cyber-city', 'ice-cave'];

export const BIOME_PRESETS: Record<BiomeId, BiomePreset> = {
  canyon: {
    id: 'canyon',
    label: 'Cânion Neon',
    fogColor: 0x1a0e2e,
    groundColor: 0x18102a,
    laneColor: 0x2f6bff,
    ambientColor: 0x4060ff,
    hemisphereSkyColor: 0x4a2f6e,
    hemisphereGroundColor: 0x140a22,
    directionalColor: 0xffa860,
  },
  'cyber-city': {
    id: 'cyber-city',
    label: 'Cidade Cyber',
    fogColor: 0x0e1030,
    groundColor: 0x0f1226,
    laneColor: 0x8f5bff,
    ambientColor: 0x5a4dff,
    hemisphereSkyColor: 0x2e2b7a,
    hemisphereGroundColor: 0x0a0c1e,
    directionalColor: 0x6fa8ff,
  },
  'ice-cave': {
    id: 'ice-cave',
    label: 'Caverna de Gelo',
    fogColor: 0x0c2233,
    groundColor: 0x0e2734,
    laneColor: 0x7ff2ff,
    ambientColor: 0x3fa8c9,
    hemisphereSkyColor: 0x4fd1e6,
    hemisphereGroundColor: 0x0a1c28,
    directionalColor: 0xcdeeff,
  },
};

const BIOME_LIST: readonly BiomePreset[] = BIOME_ORDER.map((id) => BIOME_PRESETS[id]);

/** Bioma cíclico pela distância percorrida — alterna a cada BIOME.SWITCH_DISTANCE. */
export function biomeForDistance(distance: number): BiomePreset {
  const index = Math.floor(distance / BIOME.SWITCH_DISTANCE) % BIOME_LIST.length;
  return BIOME_LIST[index] ?? BIOME_PRESETS.canyon;
}
