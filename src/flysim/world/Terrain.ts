// Funções puras de terreno (sem THREE.js), testáveis isoladamente. A malha e
// o cenário instanciado vivem em `TerrainMesh` (world/TerrainMesh.ts).

import { AIRSTRIP, TERRAIN } from '../config';
import { fbm2D, valueNoise2D } from './noise';

export type ZoneId = 'valley' | 'coast' | 'canyon' | 'mountains';

const ZONE_ORDER: readonly ZoneId[] = ['valley', 'coast', 'canyon', 'mountains'];

export const ZONE_AMPLITUDE: Record<ZoneId, number> = {
  valley: 0.42,
  coast: 0.22,
  canyon: 1.0,
  mountains: 1.8,
};

function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Zona visual/de amplitude no ponto — 4 setores angulares em torno da origem, com a fronteira distorcida por ruído pra não ficar reta. */
export function zoneAt(x: number, z: number): ZoneId {
  const warp = fbm2D(x * TERRAIN.ZONE_WARP_FREQUENCY, z * TERRAIN.ZONE_WARP_FREQUENCY, 3) * TERRAIN.ZONE_WARP_STRENGTH;
  const angle = Math.atan2(z, x) + warp;
  let normalized = (angle + Math.PI) / (Math.PI * 2);
  normalized -= Math.floor(normalized);
  const index = Math.min(ZONE_ORDER.length - 1, Math.floor(normalized * ZONE_ORDER.length));
  return ZONE_ORDER[index] ?? 'valley';
}

function rawHeight(x: number, z: number): number {
  const base = fbm2D(x * TERRAIN.BASE_FREQUENCY, z * TERRAIN.BASE_FREQUENCY, 4) * TERRAIN.BASE_AMPLITUDE;
  const detail = fbm2D(x * TERRAIN.DETAIL_FREQUENCY, z * TERRAIN.DETAIL_FREQUENCY, 3) * TERRAIN.DETAIL_AMPLITUDE;
  return (base + detail) * ZONE_AMPLITUDE[zoneAt(x, z)];
}

/** Distância (em unidades de mundo) até o retângulo da pista de pouso — 0 se estiver sobre ela. */
export function distanceToAirstrip(x: number, z: number): number {
  const dx = Math.max(Math.abs(x - AIRSTRIP.CENTER_X) - AIRSTRIP.WIDTH / 2, 0);
  const dz = Math.max(Math.abs(z - AIRSTRIP.CENTER_Z) - AIRSTRIP.LENGTH / 2, 0);
  return Math.sqrt(dx * dx + dz * dz);
}

export function isOverAirstrip(x: number, z: number): boolean {
  return distanceToAirstrip(x, z) === 0;
}

/**
 * Altura do terreno em (x, z), com a pista de pouso achatada e mesclada
 * suavemente ao relevo ao redor (evita degrau ou pista flutuante).
 */
export function terrainHeight(x: number, z: number): number {
  const raw = rawHeight(x, z);
  const dist = distanceToAirstrip(x, z);
  if (dist >= AIRSTRIP.BLEND_MARGIN) return raw;
  const t = smoothstep(dist / AIRSTRIP.BLEND_MARGIN);
  return AIRSTRIP.ELEVATION + (raw - AIRSTRIP.ELEVATION) * t;
}

/** Amostra de ruído bruto exposta só para testes de determinismo/continuidade. */
export function sampleNoise(x: number, z: number): number {
  return valueNoise2D(x, z);
}
