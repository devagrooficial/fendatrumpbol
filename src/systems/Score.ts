import { SCORE } from '../config';

/** score = floor(distância * multiplicador) + moedas * valor + gemas * valor. */
export function calculateScore(distance: number, coins: number, gems: number, multiplier: number): number {
  return Math.floor(distance * multiplier) + coins * SCORE.COIN_VALUE + gems * SCORE.GEM_VALUE;
}
