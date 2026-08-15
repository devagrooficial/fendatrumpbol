import { describe, expect, it } from 'vitest';
import {
  CHUNK_PATTERNS,
  findSurvivalPath,
  isSolvable,
  repairPattern,
  type ChunkPattern,
} from '../world/chunks';

describe('catálogo de chunks', () => {
  it('tem pelo menos 14 padrões', () => {
    expect(CHUNK_PATTERNS.length).toBeGreaterThanOrEqual(14);
  });

  it('cobre as 5 dificuldades', () => {
    const difficulties = new Set(CHUNK_PATTERNS.map((p) => p.difficulty));
    expect(difficulties).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  it('todo padrão do catálogo é solucionável', () => {
    for (const pattern of CHUNK_PATTERNS) {
      expect(isSolvable(pattern), `padrão "${pattern.id}" não tem caminho de sobrevivência`).toBe(true);
    }
  });

  it('ids são únicos', () => {
    const ids = CHUNK_PATTERNS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('isSolvable', () => {
  it('rejeita uma linha com as 3 pistas bloqueadas', () => {
    const impossible: ChunkPattern = {
      id: 'test-impossible',
      difficulty: 1,
      slots: [
        { z: 10, lane: -1, type: 'barrier' },
        { z: 10, lane: 0, type: 'barrier' },
        { z: 10, lane: 1, type: 'barrier' },
      ],
    };
    expect(isSolvable(impossible)).toBe(false);
  });

  it('aceita quando ao menos uma pista fica livre', () => {
    const solvable: ChunkPattern = {
      id: 'test-solvable',
      difficulty: 1,
      slots: [
        { z: 10, lane: -1, type: 'barrier' },
        { z: 10, lane: 0, type: 'barrier' },
      ],
    };
    expect(isSolvable(solvable)).toBe(true);
    expect(findSurvivalPath(solvable)).toEqual([1]);
  });

  it('lowBar/highBar nunca bloqueiam pista (a ação resolve, não a troca)', () => {
    const pattern: ChunkPattern = {
      id: 'test-lowbar-highbar',
      difficulty: 1,
      slots: [
        { z: 10, lane: -1, type: 'lowBar' },
        { z: 10, lane: 0, type: 'highBar' },
        { z: 10, lane: 1, type: 'lowBar' },
      ],
    };
    expect(isSolvable(pattern)).toBe(true);
  });

  it('movingBlock bloqueia as duas pistas do vaivém', () => {
    const pattern: ChunkPattern = {
      id: 'test-movingblock',
      difficulty: 3,
      slots: [
        { z: 10, lane: -1, type: 'movingBlock', toLane: 0 },
        { z: 10, lane: 1, type: 'barrier' },
      ],
    };
    expect(isSolvable(pattern)).toBe(false);
  });

  it('encontra um caminho através de múltiplas linhas', () => {
    const pattern: ChunkPattern = {
      id: 'test-multi-row',
      difficulty: 2,
      slots: [
        { z: 6, lane: -1, type: 'barrier' },
        { z: 6, lane: 0, type: 'barrier' },
        { z: 18, lane: 0, type: 'wall' },
        { z: 18, lane: 1, type: 'wall' },
      ],
    };
    expect(findSurvivalPath(pattern)).toEqual([1, -1]);
  });
});

describe('repairPattern', () => {
  it('libera uma pista quando as 3 estão bloqueadas na mesma linha', () => {
    const impossible: ChunkPattern = {
      id: 'test-repair',
      difficulty: 1,
      slots: [
        { z: 10, lane: -1, type: 'barrier' },
        { z: 10, lane: 0, type: 'barrier' },
        { z: 10, lane: 1, type: 'barrier' },
      ],
    };
    const repaired = repairPattern(impossible);
    expect(isSolvable(repaired)).toBe(true);
  });

  it('não altera um padrão que já é solucionável', () => {
    const pattern: ChunkPattern = {
      id: 'test-noop',
      difficulty: 1,
      slots: [{ z: 10, lane: 0, type: 'barrier' }],
    };
    expect(repairPattern(pattern)).toBe(pattern);
  });
});
