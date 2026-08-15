import { describe, expect, it } from 'vitest';
import {
  integrateAirspeed,
  stallFactor,
  stallPitchBias,
  stallSinkRate,
  turnRateFromRoll,
  wrapAngle,
  type FlightConfig,
} from '../flysim/systems/FlightPhysics';

const CFG: FlightConfig = {
  throttleAccel: 14,
  dragCoefficient: 0.012,
  gravity: 9.8,
  minSpeed: 0,
  maxSpeed: 62,
  stallSpeed: 16,
};

describe('integrateAirspeed', () => {
  it('acelera com manete cheio e nível (sem componente de gravidade)', () => {
    const next = integrateAirspeed(20, 1, 0, 1, CFG);
    expect(next).toBeGreaterThan(20);
  });

  it('nunca ultrapassa o teto de velocidade', () => {
    expect(integrateAirspeed(CFG.maxSpeed, 1, 0, 5, CFG)).toBeLessThanOrEqual(CFG.maxSpeed);
  });

  it('nunca fica negativa', () => {
    expect(integrateAirspeed(0, 0, 0.5, 5, CFG)).toBeGreaterThanOrEqual(0);
  });

  it('subir (pitch positivo) freia mais que voo nivelado', () => {
    const level = integrateAirspeed(30, 0.5, 0, 1, CFG);
    const climbing = integrateAirspeed(30, 0.5, 0.5, 1, CFG);
    expect(climbing).toBeLessThan(level);
  });

  it('mergulhar (pitch negativo) acelera mais que voo nivelado', () => {
    const level = integrateAirspeed(30, 0.5, 0, 1, CFG);
    const diving = integrateAirspeed(30, 0.5, -0.5, 1, CFG);
    expect(diving).toBeGreaterThan(level);
  });
});

describe('stallFactor', () => {
  it('1 (sustentação plena) na velocidade de estol ou acima', () => {
    expect(stallFactor(16, 16)).toBe(1);
    expect(stallFactor(40, 16)).toBe(1);
  });

  it('cai linearmente abaixo da velocidade de estol', () => {
    expect(stallFactor(8, 16)).toBeCloseTo(0.5, 5);
  });

  it('0 em repouso', () => {
    expect(stallFactor(0, 16)).toBe(0);
  });
});

describe('stallPitchBias / stallSinkRate', () => {
  it('zero quando não há estol (fator 1)', () => {
    expect(stallPitchBias(1, 1.4)).toBe(0);
    expect(stallSinkRate(1, 9)).toBe(0);
  });

  it('máximo quando o estol é total (fator 0)', () => {
    expect(stallPitchBias(0, 1.4)).toBe(1.4);
    expect(stallSinkRate(0, 9)).toBe(9);
  });
});

describe('wrapAngle', () => {
  it('não mexe em ângulos já dentro de (-π, π]', () => {
    expect(wrapAngle(0)).toBeCloseTo(0, 10);
    expect(wrapAngle(1)).toBeCloseTo(1, 10);
    expect(wrapAngle(-1)).toBeCloseTo(-1, 10);
    expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI, 10);
  });

  it('traz de volta ângulos de voltas completas (permite loop/roll sem limite)', () => {
    expect(wrapAngle(Math.PI * 2)).toBeCloseTo(0, 10);
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI, 10);
    expect(wrapAngle(-Math.PI * 2)).toBeCloseTo(0, 10);
  });

  it('sempre retorna um valor em (-π, π]', () => {
    for (let i = -20; i <= 20; i++) {
      const wrapped = wrapAngle(i * 1.3);
      expect(wrapped).toBeGreaterThan(-Math.PI - 1e-9);
      expect(wrapped).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
  });
});

describe('turnRateFromRoll', () => {
  it('zero sem inclinação', () => {
    expect(turnRateFromRoll(0, 0.9)).toBeCloseTo(0, 5);
  });

  it('positivo ao rolar pra direita', () => {
    expect(turnRateFromRoll(Math.PI / 4, 0.9)).toBeGreaterThan(0);
  });

  it('negativo ao rolar pra esquerda', () => {
    expect(turnRateFromRoll(-Math.PI / 4, 0.9)).toBeLessThan(0);
  });
});
