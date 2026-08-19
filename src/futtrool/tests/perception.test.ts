import { describe, expect, it } from 'vitest';
import { getDelayedSnapshot, pushSnapshot, type AiSnapshot } from '../core/ai/perception';

function makeSnapshot(tMs: number): AiSnapshot {
  return {
    tMs,
    ball: { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 } },
    self: { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, facing: 0 },
    opponent: { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 } },
    score: { teamA: 0, teamB: 0 },
    timeLeftMs: 0,
  };
}

describe('pushSnapshot', () => {
  it('acumula snapshots dentro da janela de HISTORY_MAX_MS', () => {
    let history: AiSnapshot[] = [];
    history = pushSnapshot(history, makeSnapshot(0));
    history = pushSnapshot(history, makeSnapshot(100));
    expect(history).toHaveLength(2);
  });

  it('descarta snapshots mais velhos que a janela', () => {
    let history: AiSnapshot[] = [];
    history = pushSnapshot(history, makeSnapshot(0));
    history = pushSnapshot(history, makeSnapshot(700)); // > HISTORY_MAX_MS (600) à frente do primeiro
    expect(history.map((s) => s.tMs)).toEqual([700]);
  });

  it('nunca esvazia de vez, mesmo se o filtro descartar tudo (mantém o mais recente)', () => {
    // Caso degenerado: um salto gigante de tMs faria o filtro descartar
    // até o snapshot recém-adicionado se não houvesse a salvaguarda.
    let history: AiSnapshot[] = [makeSnapshot(0)];
    history = pushSnapshot(history, makeSnapshot(100000));
    expect(history).toHaveLength(1);
    expect(history[0]?.tMs).toBe(100000);
  });
});

describe('getDelayedSnapshot', () => {
  it('devolve null com histórico vazio', () => {
    expect(getDelayedSnapshot([], 340, 1000)).toBeNull();
  });

  it('acha o snapshot mais próximo do instante atrasado', () => {
    const history = [makeSnapshot(0), makeSnapshot(100), makeSnapshot(200), makeSnapshot(300)];
    // nowMs=300, reactionMs=180 -> alvo=120 -> mais próximo é 100.
    expect(getDelayedSnapshot(history, 180, 300)?.tMs).toBe(100);
  });

  it('no início da partida (histórico raso), usa o mais antigo disponível — nunca o futuro', () => {
    const history = [makeSnapshot(0), makeSnapshot(16)];
    // reactionMs bem maior que a profundidade do histórico inteiro.
    expect(getDelayedSnapshot(history, 340, 16)?.tMs).toBe(0);
  });
});
