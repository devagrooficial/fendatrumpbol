import { DIFFICULTY, RUN } from '../config';

export type ChunkDifficulty = 1 | 2 | 3 | 4 | 5;

/** Avança a velocidade de corrida um passo de simulação (aceleração constante até o teto). */
export function nextSpeed(currentSpeed: number, dt: number): number {
  return Math.min(currentSpeed + RUN.ACCELERATION * dt, RUN.MAX_SPEED);
}

/** Dificuldade "alvo" contínua para a distância percorrida — sobe 1 nível a cada 1000u, até o teto 5. */
export function targetDifficulty(distance: number): number {
  return Math.min(1 + distance / 1000, 5);
}

/** Peso de sorteio de um padrão: quanto mais perto da dificuldade-alvo, mais peso ele recebe. */
export function difficultyWeight(patternDifficulty: ChunkDifficulty, distance: number): number {
  return 1 / (1 + Math.abs(patternDifficulty - targetDifficulty(distance)));
}

function unlockDistanceFor(difficulty: ChunkDifficulty): number {
  const index = (difficulty - 1) as 0 | 1 | 2 | 3 | 4;
  return DIFFICULTY.UNLOCK_DISTANCES[index];
}

/** Se essa dificuldade já pode entrar no sorteio de padrões nessa distância. */
export function isDifficultyUnlocked(difficulty: ChunkDifficulty, distance: number): boolean {
  return distance >= unlockDistanceFor(difficulty);
}
