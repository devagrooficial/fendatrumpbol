import { describe, expect, it } from 'vitest';
import { difficultyWeight, isDifficultyUnlocked, nextSpeed, targetDifficulty } from '../systems/Difficulty';
import { RUN } from '../config';

describe('nextSpeed', () => {
  it('acelera pela aceleração configurada', () => {
    expect(nextSpeed(10, 1)).toBeCloseTo(10 + RUN.ACCELERATION, 5);
  });

  it('nunca ultrapassa o teto de velocidade', () => {
    expect(nextSpeed(RUN.MAX_SPEED, 5)).toBe(RUN.MAX_SPEED);
    expect(nextSpeed(RUN.MAX_SPEED - 0.01, 10)).toBe(RUN.MAX_SPEED);
  });
});

describe('targetDifficulty', () => {
  it('começa em 1 na distância zero', () => {
    expect(targetDifficulty(0)).toBe(1);
  });

  it('sobe linearmente com a distância', () => {
    expect(targetDifficulty(1000)).toBe(2);
    expect(targetDifficulty(2000)).toBe(3);
  });

  it('sobe até o nível 5', () => {
    expect(targetDifficulty(4000)).toBe(5);
  });

  it('nunca ultrapassa o teto 5', () => {
    expect(targetDifficulty(100000)).toBe(5);
  });
});

describe('difficultyWeight', () => {
  it('dá o maior peso ao padrão que bate com a dificuldade-alvo', () => {
    const weights = [1, 2, 3, 4, 5].map((d) => difficultyWeight(d as 1 | 2 | 3 | 4 | 5, 0));
    expect(Math.max(...weights)).toBe(weights[0]); // alvo=1 na distância 0
  });

  it('peso máximo (1) quando a dificuldade bate exatamente com o alvo', () => {
    expect(difficultyWeight(3, 2000)).toBe(1); // alvo(2000) = 3
  });
});

describe('isDifficultyUnlocked', () => {
  it('dificuldade 1 sempre desbloqueada', () => {
    expect(isDifficultyUnlocked(1, 0)).toBe(true);
  });

  it('dificuldades maiores exigem distância mínima', () => {
    expect(isDifficultyUnlocked(2, 0)).toBe(false);
    expect(isDifficultyUnlocked(2, 500)).toBe(true);
    expect(isDifficultyUnlocked(4, 2199)).toBe(false);
    expect(isDifficultyUnlocked(4, 2200)).toBe(true);
    expect(isDifficultyUnlocked(5, 3499)).toBe(false);
    expect(isDifficultyUnlocked(5, 3500)).toBe(true);
  });
});
