import { describe, expect, it } from 'vitest';
import { createRngState, nextRandom, nextRange } from '../core/rng';

describe('rng', () => {
  it('é determinístico: mesmo seed produz a mesma sequência', () => {
    const seed = 12345;
    let a = createRngState(seed);
    let b = createRngState(seed);
    const sequenceA: number[] = [];
    const sequenceB: number[] = [];

    for (let i = 0; i < 10; i++) {
      const stepA = nextRandom(a);
      const stepB = nextRandom(b);
      sequenceA.push(stepA.value);
      sequenceB.push(stepB.value);
      a = stepA.nextState;
      b = stepB.nextState;
    }

    expect(sequenceA).toEqual(sequenceB);
  });

  it('seeds diferentes produzem sequências diferentes', () => {
    const a = nextRandom(createRngState(1));
    const b = nextRandom(createRngState(2));
    expect(a.value).not.toBe(b.value);
  });

  it('nextRandom sempre cai em [0, 1)', () => {
    let state = createRngState(999);
    for (let i = 0; i < 1000; i++) {
      const step = nextRandom(state);
      expect(step.value).toBeGreaterThanOrEqual(0);
      expect(step.value).toBeLessThan(1);
      state = step.nextState;
    }
  });

  it('nextRange respeita os limites min/max', () => {
    let state = createRngState(42);
    for (let i = 0; i < 200; i++) {
      const step = nextRange(state, -10, 10);
      expect(step.value).toBeGreaterThanOrEqual(-10);
      expect(step.value).toBeLessThan(10);
      state = step.nextState;
    }
  });
});
