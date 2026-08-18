// Economia e curva de XP (spec seção 9). Funções puras — testáveis sem
// browser, embora não precisem viver em core/ (não fazem parte da
// simulação determinística, só da progressão entre partidas).

export const ECONOMY = {
  MATCH_COMPLETE_COIN: 10,
  VICTORY_COIN: 25,
  GOAL_COIN: 5,
  STREAK_BONUS_PER_WIN: 0.1, // +10% por vitória consecutiva
  STREAK_BONUS_CAP: 0.5, // teto de +50%
  XP_BASE: 40,
  XP_PER_GOAL: 15,
  XP_PER_WIN: 60,
  // Fração das moedas que "Sair" garante na hora — o resto só entra se a
  // pessoa escolher "Mais uma!" em vez de sair. Antes os dois botões
  // mostravam o mesmo valor (o prêmio já tinha sido creditado antes de
  // qualquer clique, então "Sair"/"Mais uma" eram só rótulos idênticos
  // sem efeito nenhum na escolha) — agora sair de verdade abre mão de
  // parte da moeda, pra ser um incentivo de continuar, não só decoração.
  EXIT_COIN_FRACTION: 0.5,
};

export function xpForLevel(level: number): number {
  return Math.round(300 * Math.pow(level, 1.35));
}

export type MatchOutcome = 'win' | 'loss' | 'draw';

export type MatchReward = {
  coins: number;
  xp: number;
  newStreak: number;
  streakBonusApplied: number; // 0..STREAK_BONUS_CAP, só informativo pra UI
};

// Decisão não explicitada na spec: só vitória mantém/aumenta a sequência —
// empate ou derrota zera. É a leitura mais comum de "sequência de
// vitórias" e a mais simples de justificar pro jogador na UI.
export function calculateMatchReward(
  outcome: MatchOutcome,
  goalsScored: number,
  winStreakBefore: number,
): MatchReward {
  let coins = ECONOMY.MATCH_COMPLETE_COIN + goalsScored * ECONOMY.GOAL_COIN;
  let xp = ECONOMY.XP_BASE + goalsScored * ECONOMY.XP_PER_GOAL;

  if (outcome !== 'win') {
    return { coins, xp, newStreak: 0, streakBonusApplied: 0 };
  }

  coins += ECONOMY.VICTORY_COIN;
  xp += ECONOMY.XP_PER_WIN;
  const newStreak = winStreakBefore + 1;
  const streakBonusApplied = Math.min(ECONOMY.STREAK_BONUS_CAP, newStreak * ECONOMY.STREAK_BONUS_PER_WIN);
  coins = Math.round(coins * (1 + streakBonusApplied));

  return { coins, xp, newStreak, streakBonusApplied };
}

// Divide o total de moedas ganho na partida entre "garantido, mesmo saindo"
// e "só se continuar jogando". A soma dos dois sempre bate com `coins`
// exatamente (sem perder nem inventar moeda no arredondamento).
export function splitExitReward(coins: number): { exitCoins: number; bonusCoins: number } {
  const exitCoins = Math.round(coins * ECONOMY.EXIT_COIN_FRACTION);
  return { exitCoins, bonusCoins: coins - exitCoins };
}

export type LevelProgress = {
  level: number;
  levelXp: number; // progresso dentro do nível atual
  xpToNextLevel: number; // xpForLevel(level) — quanto falta pro próximo
};

// Aplica XP ganho, subindo de nível quantas vezes forem necessárias (cobre
// o caso raro de um ganho gigante cruzar mais de um nível de uma vez).
export function applyXp(progress: LevelProgress, xpGained: number): LevelProgress {
  let { level, levelXp } = progress;
  levelXp += xpGained;

  let threshold = xpForLevel(level);
  while (levelXp >= threshold) {
    levelXp -= threshold;
    level += 1;
    threshold = xpForLevel(level);
  }

  return { level, levelXp, xpToNextLevel: threshold };
}
