import { describe, expect, it } from 'vitest';
import { calculateScore } from '../systems/Score';

describe('calculateScore', () => {
  it('soma distância (arredondada para baixo) e moedas * 10', () => {
    expect(calculateScore(123.9, 5, 1)).toBe(123 + 50);
  });

  it('sem moedas, score é só a distância', () => {
    expect(calculateScore(50, 0, 1)).toBe(50);
  });

  it('aplica o multiplicador só na parcela de distância', () => {
    expect(calculateScore(100, 5, 2)).toBe(200 + 50);
  });

  it('distância zero com moedas ainda soma o valor das moedas', () => {
    expect(calculateScore(0, 3, 1)).toBe(30);
  });

  it('multiplicador fracionário arredonda a distância para baixo', () => {
    expect(calculateScore(10, 0, 1.5)).toBe(15);
    expect(calculateScore(11, 0, 1.5)).toBe(16); // floor(16.5) = 16
  });
});
