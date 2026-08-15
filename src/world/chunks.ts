import { Track, type Lane } from './Track';
import type { PowerUpType } from '../entities/PowerUp';
import { difficultyWeight, isDifficultyUnlocked, type ChunkDifficulty } from '../systems/Difficulty';

export type { ChunkDifficulty };

export type ChunkSlotType =
  | 'barrier'
  | 'lowBar'
  | 'highBar'
  | 'wall'
  | 'movingBlock'
  | 'coinLine'
  | 'coinArc'
  | 'powerUp'
  | 'empty';

export type ChunkSlot = {
  z: number;
  lane: Lane;
  type: ChunkSlotType;
  /** Apenas para movingBlock: segunda pista do vaivém (deve ser adjacente a `lane`). */
  toLane?: Lane;
  /** Apenas para powerUp: qual dos 4 tipos aparece nesse slot. */
  powerUpType?: PowerUpType;
};

export type ChunkPattern = {
  id: string;
  difficulty: ChunkDifficulty;
  slots: ChunkSlot[];
};

const BLOCKING_TYPES: readonly ChunkSlotType[] = ['barrier', 'wall', 'movingBlock'];

function isBlockingType(type: ChunkSlotType): boolean {
  return BLOCKING_TYPES.includes(type);
}

function blockedLanesInRow(slots: readonly ChunkSlot[]): Set<Lane> {
  const blocked = new Set<Lane>();
  for (const slot of slots) {
    if (!isBlockingType(slot.type)) continue;
    blocked.add(slot.lane);
    if (slot.type === 'movingBlock' && slot.toLane !== undefined) {
      blocked.add(slot.toLane);
    }
  }
  return blocked;
}

type BlockingRow = { z: number; slots: ChunkSlot[]; blocked: Set<Lane> };

function groupBlockingRows(slots: readonly ChunkSlot[]): BlockingRow[] {
  const byZ = new Map<number, ChunkSlot[]>();
  for (const slot of slots) {
    const existing = byZ.get(slot.z);
    if (existing) {
      existing.push(slot);
    } else {
      byZ.set(slot.z, [slot]);
    }
  }

  const rows: BlockingRow[] = [];
  for (const [z, rowSlots] of byZ) {
    const blocked = blockedLanesInRow(rowSlots);
    if (blocked.size > 0) rows.push({ z, slots: rowSlots, blocked });
  }
  return rows.sort((a, b) => a.z - b.z);
}

/**
 * Busca uma sequência de pistas (uma por linha bloqueante) que atravessa o
 * chunk sem colisão. Pulo/deslize nunca "bloqueiam" uma pista — apenas
 * barrier/wall/movingBlock o fazem — então a busca só precisa achar, em cada
 * linha, uma pista livre.
 */
export function findSurvivalPath(pattern: ChunkPattern): Lane[] | null {
  const rows = groupBlockingRows(pattern.slots);
  const path: Lane[] = [];

  function backtrack(index: number): boolean {
    if (index >= rows.length) return true;
    const row = rows[index];
    if (!row) return true;

    for (const lane of Track.lanes) {
      if (row.blocked.has(lane)) continue;
      path.push(lane);
      if (backtrack(index + 1)) return true;
      path.pop();
    }
    return false;
  }

  return backtrack(0) ? path : null;
}

export function isSolvable(pattern: ChunkPattern): boolean {
  return findSurvivalPath(pattern) !== null;
}

/**
 * Corrige um padrão impossível removendo, linha a linha, os slots
 * bloqueantes que fecham as 3 pistas ao mesmo tempo — até sobrar sempre
 * pelo menos uma pista livre. Nunca falha: no pior caso remove todos os
 * obstáculos bloqueantes do padrão.
 */
export function repairPattern(pattern: ChunkPattern): ChunkPattern {
  if (isSolvable(pattern)) return pattern;

  const rows = groupBlockingRows(pattern.slots);
  const toRemove = new Set<ChunkSlot>();

  for (const row of rows) {
    if (row.blocked.size < Track.lanes.length) continue;
    for (const slot of row.slots) {
      if (isBlockingType(slot.type)) toRemove.add(slot);
    }
  }

  const repaired: ChunkPattern = {
    ...pattern,
    slots: pattern.slots.filter((slot) => !toRemove.has(slot)),
  };

  if (isSolvable(repaired)) return repaired;

  return {
    ...repaired,
    slots: repaired.slots.filter((slot) => !isBlockingType(slot.type)),
  };
}

export function pickPattern(distance: number, excludeId: string | null): ChunkPattern {
  const unlocked = CHUNK_PATTERNS.filter((p) => isDifficultyUnlocked(p.difficulty, distance));
  const pool = unlocked.length > 1 ? unlocked.filter((p) => p.id !== excludeId) : unlocked;

  const weights = pool.map((p) => difficultyWeight(p.difficulty, distance));
  const total = weights.reduce((sum, w) => sum + w, 0);

  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    const candidate = pool[i];
    const weight = weights[i];
    if (candidate === undefined || weight === undefined) continue;
    r -= weight;
    if (r <= 0) return candidate;
  }

  const fallback = pool[pool.length - 1];
  if (!fallback) throw new Error('Catálogo de chunks vazio');
  return fallback;
}

export const CHUNK_PATTERNS: ChunkPattern[] = [
  // ---- Dificuldade 1: quase só moedas, um obstáculo simples por chunk ----
  {
    id: 'd1-coin-line',
    difficulty: 1,
    slots: [
      { z: 10, lane: 0, type: 'coinLine' },
      { z: 20, lane: 1, type: 'powerUp', powerUpType: 'shield' },
    ],
  },
  {
    id: 'd1-single-lowbar',
    difficulty: 1,
    slots: [
      { z: 16, lane: 0, type: 'lowBar' },
      { z: 6, lane: -1, type: 'coinLine' },
    ],
  },
  {
    id: 'd1-single-highbar',
    difficulty: 1,
    slots: [
      { z: 16, lane: 1, type: 'highBar' },
      { z: 6, lane: -1, type: 'coinArc' },
    ],
  },
  {
    id: 'd1-single-barrier',
    difficulty: 1,
    slots: [
      { z: 15, lane: -1, type: 'barrier' },
      { z: 8, lane: 1, type: 'coinLine' },
    ],
  },

  // ---- Dificuldade 2: duas linhas de obstáculo, entra o wall ----
  {
    id: 'd2-barrier-lowbar',
    difficulty: 2,
    slots: [
      { z: 8, lane: 0, type: 'barrier' },
      { z: 20, lane: 1, type: 'lowBar' },
      { z: 8, lane: -1, type: 'coinLine' },
    ],
  },
  {
    id: 'd2-wall-left',
    difficulty: 2,
    slots: [
      { z: 12, lane: -1, type: 'wall' },
      { z: 12, lane: 0, type: 'wall' },
      { z: 6, lane: 1, type: 'coinLine' },
      { z: 20, lane: 1, type: 'powerUp', powerUpType: 'multiplier' },
    ],
  },
  {
    id: 'd2-wall-right',
    difficulty: 2,
    slots: [
      { z: 12, lane: 0, type: 'wall' },
      { z: 12, lane: 1, type: 'wall' },
      { z: 6, lane: -1, type: 'coinLine' },
    ],
  },
  {
    id: 'd2-highbar-barrier',
    difficulty: 2,
    slots: [
      { z: 8, lane: -1, type: 'highBar' },
      { z: 20, lane: 1, type: 'barrier' },
      { z: 14, lane: 0, type: 'coinLine' },
      { z: 27, lane: 0, type: 'powerUp', powerUpType: 'boost' },
    ],
  },

  // ---- Dificuldade 3: entra o movingBlock, mais densidade ----
  {
    id: 'd3-movingblock-basic',
    difficulty: 3,
    slots: [
      { z: 6, lane: 1, type: 'lowBar' },
      { z: 16, lane: -1, type: 'movingBlock', toLane: 0 },
      { z: 24, lane: 1, type: 'powerUp', powerUpType: 'magnet' },
    ],
  },
  {
    id: 'd3-triple-row',
    difficulty: 3,
    slots: [
      { z: 8, lane: 1, type: 'barrier' },
      { z: 16, lane: -1, type: 'highBar' },
      { z: 24, lane: 0, type: 'movingBlock', toLane: 1 },
    ],
  },
  {
    id: 'd3-wall-and-lowbar',
    difficulty: 3,
    slots: [
      { z: 10, lane: -1, type: 'wall' },
      { z: 10, lane: 0, type: 'wall' },
      { z: 10, lane: 1, type: 'lowBar' },
      { z: 22, lane: -1, type: 'movingBlock', toLane: 0 },
    ],
  },
  {
    id: 'd3-big-crossing',
    difficulty: 3,
    slots: [
      { z: 8, lane: -1, type: 'barrier' },
      { z: 16, lane: 0, type: 'wall' },
      { z: 16, lane: 1, type: 'wall' },
      { z: 24, lane: -1, type: 'movingBlock', toLane: 0 },
    ],
  },

  // ---- Dificuldade 4: máxima densidade, ainda sempre solucionável ----
  {
    id: 'd4-dense-zigzag',
    difficulty: 4,
    slots: [
      { z: 6, lane: 1, type: 'barrier' },
      { z: 12, lane: -1, type: 'wall' },
      { z: 12, lane: 0, type: 'wall' },
      { z: 18, lane: 0, type: 'movingBlock', toLane: 1 },
      { z: 24, lane: -1, type: 'barrier' },
    ],
  },
  {
    id: 'd4-gauntlet',
    difficulty: 4,
    slots: [
      { z: 6, lane: -1, type: 'highBar' },
      { z: 6, lane: 1, type: 'lowBar' },
      { z: 14, lane: 0, type: 'wall' },
      { z: 14, lane: 1, type: 'wall' },
      { z: 22, lane: -1, type: 'movingBlock', toLane: 0 },
      { z: 28, lane: 1, type: 'barrier' },
    ],
  },
  {
    id: 'd4-precision',
    difficulty: 4,
    slots: [
      { z: 6, lane: 0, type: 'lowBar' },
      { z: 12, lane: 0, type: 'highBar' },
      { z: 18, lane: -1, type: 'wall' },
      { z: 18, lane: 0, type: 'wall' },
      { z: 24, lane: 0, type: 'movingBlock', toLane: 1 },
    ],
  },
  {
    id: 'd4-finale',
    difficulty: 4,
    slots: [
      { z: 6, lane: -1, type: 'barrier' },
      { z: 12, lane: 1, type: 'barrier' },
      { z: 18, lane: -1, type: 'wall' },
      { z: 18, lane: 0, type: 'wall' },
      { z: 18, lane: 1, type: 'highBar' },
      { z: 26, lane: -1, type: 'movingBlock', toLane: 0 },
      { z: 10, lane: 1, type: 'powerUp', powerUpType: 'shield' },
    ],
  },

  // ---- Dificuldade 5: o topo — combos densos, sempre com transição de
  // pista adjacente (nunca pede um pulo de 2 pistas de uma vez) ----
  {
    id: 'd5-double-moving',
    difficulty: 5,
    slots: [
      { z: 6, lane: -1, type: 'movingBlock', toLane: 0 },
      { z: 6, lane: 1, type: 'coinLine' },
      { z: 13, lane: -1, type: 'barrier' },
      { z: 13, lane: 1, type: 'barrier' },
      { z: 20, lane: 0, type: 'movingBlock', toLane: 1 },
      { z: 20, lane: -1, type: 'highBar' },
      { z: 27, lane: -1, type: 'barrier' },
      { z: 27, lane: 1, type: 'barrier' },
      { z: 27, lane: 0, type: 'powerUp', powerUpType: 'shield' },
    ],
  },
  {
    id: 'd5-precision-gauntlet',
    difficulty: 5,
    slots: [
      { z: 6, lane: 0, type: 'lowBar' },
      { z: 6, lane: 1, type: 'highBar' },
      { z: 12, lane: 0, type: 'wall' },
      { z: 12, lane: 1, type: 'wall' },
      { z: 18, lane: 0, type: 'movingBlock', toLane: 1 },
      { z: 18, lane: -1, type: 'lowBar' },
      { z: 24, lane: -1, type: 'barrier' },
      { z: 24, lane: 1, type: 'barrier' },
      { z: 27, lane: -1, type: 'movingBlock', toLane: 0 },
      { z: 27, lane: 1, type: 'coinArc' },
    ],
  },
  {
    id: 'd5-triple-threat',
    difficulty: 5,
    slots: [
      { z: 6, lane: -1, type: 'wall' },
      { z: 6, lane: 0, type: 'wall' },
      { z: 6, lane: 1, type: 'highBar' },
      { z: 13, lane: -1, type: 'movingBlock', toLane: 0 },
      { z: 13, lane: 1, type: 'lowBar' },
      { z: 20, lane: -1, type: 'barrier' },
      { z: 20, lane: 1, type: 'barrier' },
      { z: 27, lane: 0, type: 'wall' },
      { z: 27, lane: 1, type: 'wall' },
      { z: 27, lane: -1, type: 'powerUp', powerUpType: 'magnet' },
    ],
  },
  {
    id: 'd5-final-gauntlet',
    difficulty: 5,
    slots: [
      { z: 6, lane: -1, type: 'barrier' },
      { z: 6, lane: 1, type: 'barrier' },
      { z: 13, lane: -1, type: 'wall' },
      { z: 13, lane: 0, type: 'wall' },
      { z: 13, lane: 1, type: 'highBar' },
      { z: 20, lane: -1, type: 'movingBlock', toLane: 0 },
      { z: 20, lane: 1, type: 'lowBar' },
      { z: 27, lane: -1, type: 'barrier' },
      { z: 27, lane: 1, type: 'barrier' },
      { z: 27, lane: 0, type: 'powerUp', powerUpType: 'boost' },
    ],
  },
];
