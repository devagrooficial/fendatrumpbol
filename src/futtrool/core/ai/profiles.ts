// Tabela 5.3 da spec — os 3 níveis de dificuldade, só dados (nenhuma
// decisão aqui, isso é brain.ts). Nomes na UI: Novato / Profissional / Lenda.

export type AiDifficulty = 'novato' | 'profissional' | 'lenda';

export type AiDefensivePositioning = 'weak' | 'holdLine' | 'anticipate';

export type AiProfile = {
  id: AiDifficulty;
  label: string;
  reactionMs: number;
  aimErrorDeg: number;
  speedFactor: number; // fração do PLAYER_MAX_SPEED — a IA nunca manda move com magnitude > isso
  predictionHorizon: number; // segundos
  chargeAccuracy: number; // 0..1, o quanto acerta a carga ideal do chute
  dashUsage: number; // 0..1, chance de usar o dash quando a situação permite
  aggression: number; // 0..1, disputa corpo a corpo
  idleChance: number; // 0..1, chance de hesitar por 0.2-0.5s a cada avaliação
  defensivePositioning: AiDefensivePositioning;
  mistakeChance: number; // 0..1, chance de chutar na direção errada
};

export const AI_PROFILES: Record<AiDifficulty, AiProfile> = {
  novato: {
    id: 'novato',
    label: 'Novato',
    reactionMs: 340,
    aimErrorDeg: 18,
    speedFactor: 0.78,
    predictionHorizon: 0.15,
    chargeAccuracy: 0.55,
    dashUsage: 0.1,
    aggression: 0.25,
    idleChance: 0.14,
    defensivePositioning: 'weak',
    mistakeChance: 0.12,
  },
  profissional: {
    id: 'profissional',
    label: 'Profissional',
    reactionMs: 180,
    aimErrorDeg: 8,
    speedFactor: 0.92,
    predictionHorizon: 0.4,
    chargeAccuracy: 0.8,
    dashUsage: 0.45,
    aggression: 0.6,
    idleChance: 0.05,
    defensivePositioning: 'holdLine',
    mistakeChance: 0.04,
  },
  lenda: {
    id: 'lenda',
    label: 'Lenda',
    reactionMs: 85,
    aimErrorDeg: 2.5,
    speedFactor: 1.0,
    predictionHorizon: 0.75,
    chargeAccuracy: 0.96,
    dashUsage: 0.85,
    aggression: 0.9,
    idleChance: 0.0,
    defensivePositioning: 'anticipate',
    mistakeChance: 0.0,
  },
};

// Seção 5.3: implementado mas desligado por padrão. Se ligar, ao perder por
// 3+ gols a IA reduz speedFactor em 8% — nunca no nível Lenda. Não usado em
// lugar nenhum ainda (fica pronto pra quando/se for ligado).
export const RUBBER_BAND = false;
export const RUBBER_BAND_GOAL_DEFICIT = 3;
export const RUBBER_BAND_SPEED_PENALTY = 0.08;
