// Geração pura (sem THREE.js) do percurso de anéis — testável isoladamente.

import { CHECKPOINT } from '../config';
import { hash1D } from './noise';
import { terrainHeight } from './Terrain';

export type CheckpointPoint = { x: number; y: number; z: number };

/**
 * Percurso determinístico em espiral ao redor da origem, cruzando as 4 zonas
 * visuais e variando bastante de altitude — força o jogador a subir/mergulhar,
 * não só virar.
 */
export function generateCheckpointCourse(count: number): CheckpointPoint[] {
  const points: CheckpointPoint[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const angle = t * Math.PI * 2 * 1.6 + hash1D(i * 3.7) * 0.5;
    const radiusT = (Math.sin(t * Math.PI * 2 * 1.3) + 1) / 2;
    const radius = CHECKPOINT.TOUR_RADIUS_MIN + (CHECKPOINT.TOUR_RADIUS_MAX - CHECKPOINT.TOUR_RADIUS_MIN) * radiusT;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    const altitudeT = (Math.cos(t * Math.PI * 2 * 1.7) + 1) / 2;
    const clearance = CHECKPOINT.ALTITUDE_MIN + (CHECKPOINT.ALTITUDE_MAX - CHECKPOINT.ALTITUDE_MIN) * altitudeT;
    const y = Math.max(terrainHeight(x, z) + 35, clearance);

    points.push({ x, y, z });
  }
  return points;
}
