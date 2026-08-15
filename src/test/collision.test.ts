import { describe, expect, it } from 'vitest';
import { intersects, resolveCollision, type AABB } from '../systems/Collision';

function box(minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number): AABB {
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

describe('intersects', () => {
  it('detecta sobreposição total', () => {
    const a = box(-1, 1, 0, 2, -1, 1);
    const b = box(-0.5, 0.5, 0.5, 1.5, -0.5, 0.5);
    expect(intersects(a, b)).toBe(true);
  });

  it('detecta sobreposição parcial só na borda', () => {
    const a = box(0, 1, 0, 1, 0, 1);
    const b = box(1, 2, 0, 1, 0, 1);
    expect(intersects(a, b)).toBe(true);
  });

  it('não detecta quando separadas no eixo X', () => {
    const a = box(-2, -1, 0, 1, 0, 1);
    const b = box(1, 2, 0, 1, 0, 1);
    expect(intersects(a, b)).toBe(false);
  });

  it('não detecta quando separadas no eixo Y (ex.: player pulou por cima)', () => {
    const a = box(-1, 1, 2, 3, 0, 1);
    const b = box(-1, 1, 0, 0.8, 0, 1);
    expect(intersects(a, b)).toBe(false);
  });

  it('não detecta quando separadas no eixo Z', () => {
    const a = box(-1, 1, 0, 1, -10, -9);
    const b = box(-1, 1, 0, 1, 5, 6);
    expect(intersects(a, b)).toBe(false);
  });
});

describe('resolveCollision', () => {
  const player = box(-0.3, 0.3, 0, 1.3, -0.15, 0.15);
  const obstacle = box(-0.8, 0.8, 0, 1.8, -0.25, 0.25);

  it('retorna "none" sem sobreposição', () => {
    expect(resolveCollision(player, [box(10, 11, 0, 1, 0, 1)], false)).toBe('none');
  });

  it('retorna "fatal" quando não está trocando de pista', () => {
    expect(resolveCollision(player, [obstacle], false)).toBe('fatal');
  });

  it('retorna "scrape" quando está trocando de pista', () => {
    expect(resolveCollision(player, [obstacle], true)).toBe('scrape');
  });

  it('ignora obstáculos sem sobreposição mesmo com vários na lista', () => {
    const far = box(50, 51, 0, 1, 0, 1);
    expect(resolveCollision(player, [far, far, far], false)).toBe('none');
  });
});
