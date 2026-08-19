import { describe, expect, it } from 'vitest';
import { applyXp, calculateMatchReward, ECONOMY, MAX_LEVEL, splitExitReward, xpForLevel, type LevelProgress } from '../progression/economy';

describe('xpForLevel', () => {
  it('segue a fórmula 300 * n^1.4', () => {
    expect(xpForLevel(1)).toBe(300);
    expect(xpForLevel(2)).toBe(Math.round(300 * Math.pow(2, 1.4)));
  });

  it('cresce com o nível', () => {
    expect(xpForLevel(5)).toBeGreaterThan(xpForLevel(4));
  });
});

describe('calculateMatchReward', () => {
  it('vitória soma bônus de vitória + XP de vitória + sequência', () => {
    const reward = calculateMatchReward('win', 2, 0);
    const baseCoins = ECONOMY.MATCH_COMPLETE_COIN + 2 * ECONOMY.GOAL_COIN + ECONOMY.VICTORY_COIN;
    expect(reward.newStreak).toBe(1);
    expect(reward.coins).toBe(Math.round(baseCoins * (1 + ECONOMY.STREAK_BONUS_PER_WIN)));
    expect(reward.xp).toBe(ECONOMY.XP_BASE + 2 * ECONOMY.XP_PER_GOAL + ECONOMY.XP_PER_WIN);
  });

  it('derrota e empate não dão bônus de vitória e zeram a sequência', () => {
    const loss = calculateMatchReward('loss', 1, 5);
    const draw = calculateMatchReward('draw', 0, 5);
    expect(loss.newStreak).toBe(0);
    expect(draw.newStreak).toBe(0);
    expect(loss.coins).toBe(ECONOMY.MATCH_COMPLETE_COIN + 1 * ECONOMY.GOAL_COIN);
    expect(draw.coins).toBe(ECONOMY.MATCH_COMPLETE_COIN);
  });

  it('o bônus de sequência nunca passa do teto', () => {
    const reward = calculateMatchReward('win', 0, 99);
    expect(reward.streakBonusApplied).toBe(ECONOMY.STREAK_BONUS_CAP);
  });
});

describe('splitExitReward', () => {
  it('divide as moedas entre "sair" e "bônus de continuar" sem perder nem inventar nada', () => {
    const { exitCoins, bonusCoins } = splitExitReward(35);
    expect(exitCoins + bonusCoins).toBe(35);
    expect(exitCoins).toBe(Math.round(35 * ECONOMY.EXIT_COIN_FRACTION));
  });

  it('nunca devolve negativo mesmo com valores pequenos/ímpares', () => {
    for (let coins = 0; coins <= 10; coins++) {
      const { exitCoins, bonusCoins } = splitExitReward(coins);
      expect(exitCoins).toBeGreaterThanOrEqual(0);
      expect(bonusCoins).toBeGreaterThanOrEqual(0);
      expect(exitCoins + bonusCoins).toBe(coins);
    }
  });
});

describe('applyXp', () => {
  it('acumula XP dentro do nível sem passar do limiar', () => {
    const start: LevelProgress = { level: 1, levelXp: 0, xpToNextLevel: xpForLevel(1) };
    const next = applyXp(start, 50);
    expect(next.level).toBe(1);
    expect(next.levelXp).toBe(50);
  });

  it('sobe de nível ao atingir o limiar', () => {
    const start: LevelProgress = { level: 1, levelXp: 0, xpToNextLevel: xpForLevel(1) };
    const next = applyXp(start, xpForLevel(1) + 20);
    expect(next.level).toBe(2);
    expect(next.levelXp).toBe(20);
  });

  it('sobe mais de um nível de uma vez se o ganho for grande o bastante', () => {
    const start: LevelProgress = { level: 1, levelXp: 0, xpToNextLevel: xpForLevel(1) };
    const hugeGain = xpForLevel(1) + xpForLevel(2) + 10;
    const next = applyXp(start, hugeGain);
    expect(next.level).toBe(3);
    expect(next.levelXp).toBe(10);
  });

  it('trava em MAX_LEVEL mesmo com XP suficiente pra passar disso', () => {
    const start: LevelProgress = { level: MAX_LEVEL - 1, levelXp: 0, xpToNextLevel: xpForLevel(MAX_LEVEL - 1) };
    // Ganho gigante, bem mais que o suficiente pra várias "subidas" — não
    // existe nível 21, então tem que parar exatamente em MAX_LEVEL.
    const next = applyXp(start, xpForLevel(MAX_LEVEL - 1) + xpForLevel(MAX_LEVEL) * 10);
    expect(next.level).toBe(MAX_LEVEL);
    expect(next.levelXp).toBe(0);
    expect(next.xpToNextLevel).toBe(0);
  });

  it('já no MAX_LEVEL, XP ganho não faz nada (sem nível 21, sem sobrar XP acumulado)', () => {
    const maxed: LevelProgress = { level: MAX_LEVEL, levelXp: 0, xpToNextLevel: 0 };
    const next = applyXp(maxed, 99999);
    expect(next).toEqual({ level: MAX_LEVEL, levelXp: 0, xpToNextLevel: 0 });
  });

  it('leva uma quantidade de XP total (nível 1 até MAX_LEVEL) compatível com ~1 ano de jogo casual', () => {
    // Calibração (ver comentário de xpForLevel): ~4 partidas/dia, ~104 XP
    // médio por partida (mix de vitória/derrota/gols) — não é uma conta
    // exata de produto, só uma faixa saudável pra não regredir sem querer
    // pra "sobe em 1 mês" ou "nunca sobe".
    let total = 0;
    for (let level = 1; level < MAX_LEVEL; level++) total += xpForLevel(level);
    const avgXpPerMatch = 104;
    const matchesPerDay = 4;
    const daysToMax = total / avgXpPerMatch / matchesPerDay;
    expect(daysToMax).toBeGreaterThan(300);
    expect(daysToMax).toBeLessThan(450);
  });
});
