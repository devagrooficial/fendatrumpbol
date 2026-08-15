import { describe, expect, it } from 'vitest';
import { generateCheckpointCourse } from '../flysim/world/Checkpoints';
import { CHECKPOINT } from '../flysim/config';

describe('generateCheckpointCourse', () => {
  it('gera a quantidade de pontos pedida', () => {
    expect(generateCheckpointCourse(CHECKPOINT.COUNT)).toHaveLength(CHECKPOINT.COUNT);
  });

  it('é determinística', () => {
    const a = generateCheckpointCourse(8);
    const b = generateCheckpointCourse(8);
    expect(a).toEqual(b);
  });

  it('mantém altitude sempre positiva e acima do relevo local', () => {
    const points = generateCheckpointCourse(CHECKPOINT.COUNT);
    for (const point of points) {
      expect(point.y).toBeGreaterThan(0);
    }
  });

  it('espalha os pontos em posições distintas', () => {
    const points = generateCheckpointCourse(CHECKPOINT.COUNT);
    const unique = new Set(points.map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`));
    expect(unique.size).toBe(points.length);
  });
});
