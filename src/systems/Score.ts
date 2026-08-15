import { SCORE } from '../config';

/** score = floor(distância * multiplicador) + moedas * valor da moeda. */
export function calculateScore(distance: number, coins: number, multiplier: number): number {
  return Math.floor(distance * multiplier) + coins * SCORE.COIN_VALUE;
}
