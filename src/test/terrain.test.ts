import { describe, expect, it } from 'vitest';
import { distanceToAirstrip, isOverAirstrip, terrainHeight, zoneAt } from '../flysim/world/Terrain';
import { AIRSTRIP } from '../flysim/config';
import { fbm2D, hash1D, valueNoise2D } from '../flysim/world/noise';

describe('valueNoise2D / fbm2D', () => {
  it('é determinístico — mesma entrada, mesma saída', () => {
    expect(valueNoise2D(12.3, -4.5)).toBe(valueNoise2D(12.3, -4.5));
    expect(fbm2D(12.3, -4.5, 4)).toBe(fbm2D(12.3, -4.5, 4));
  });

  it('valueNoise2D fica em [0, 1]', () => {
    for (let i = 0; i < 50; i++) {
      const v = valueNoise2D(i * 3.7, i * -1.9);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('fbm2D fica em [-1, 1]', () => {
    for (let i = 0; i < 50; i++) {
      const v = fbm2D(i * 2.1, i * 5.3, 4);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('hash1D', () => {
  it('é determinístico e fica em [0, 1]', () => {
    for (let i = 0; i < 50; i++) {
      const v = hash1D(i * 0.91);
      expect(hash1D(i * 0.91)).toBe(v);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('terrainHeight', () => {
  it('é determinística', () => {
    expect(terrainHeight(100, -250)).toBe(terrainHeight(100, -250));
  });

  it('fica achatada na elevação da pista sobre o próprio retângulo da pista', () => {
    expect(terrainHeight(AIRSTRIP.CENTER_X, AIRSTRIP.CENTER_Z)).toBeCloseTo(AIRSTRIP.ELEVATION, 5);
  });

  it('volta ao relevo natural bem longe da pista', () => {
    const far = terrainHeight(AIRSTRIP.CENTER_X + 3000, AIRSTRIP.CENTER_Z + 3000);
    expect(Math.abs(far - AIRSTRIP.ELEVATION)).toBeGreaterThan(1);
  });
});

describe('distanceToAirstrip / isOverAirstrip', () => {
  it('distância zero e isOverAirstrip=true dentro do retângulo', () => {
    expect(distanceToAirstrip(AIRSTRIP.CENTER_X, AIRSTRIP.CENTER_Z)).toBe(0);
    expect(isOverAirstrip(AIRSTRIP.CENTER_X, AIRSTRIP.CENTER_Z)).toBe(true);
  });

  it('distância positiva e isOverAirstrip=false fora do retângulo', () => {
    const far = AIRSTRIP.CENTER_X + AIRSTRIP.WIDTH * 5;
    expect(distanceToAirstrip(far, AIRSTRIP.CENTER_Z)).toBeGreaterThan(0);
    expect(isOverAirstrip(far, AIRSTRIP.CENTER_Z)).toBe(false);
  });
});

describe('zoneAt', () => {
  it('é determinística', () => {
    expect(zoneAt(400, -600)).toBe(zoneAt(400, -600));
  });

  it('só retorna zonas conhecidas', () => {
    const known = new Set(['valley', 'coast', 'canyon', 'mountains']);
    for (let i = 0; i < 30; i++) {
      const angle = (i / 30) * Math.PI * 2;
      const zone = zoneAt(Math.cos(angle) * 500, Math.sin(angle) * 500);
      expect(known.has(zone)).toBe(true);
    }
  });
});
