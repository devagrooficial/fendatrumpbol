import { describe, expect, it } from 'vitest';
import { ReplayBuffer } from '../replay/buffer';
import { ReplayPlayer } from '../replay/player';
import { createMatchState } from '../core/rules';
import { FIXED_TIMESTEP_S, REPLAY } from '../core/constants';
import type { PlayerId, TeamId } from '../core/types';

const ROSTER: Record<TeamId, PlayerId[]> = { teamA: ['teamA-0'], teamB: ['teamB-0'] };

function makeState(tick: number) {
  const state = createMatchState(1, 0, ROSTER);
  return { ...state, tick, phase: 'playing' as const };
}

describe('ReplayBuffer', () => {
  it('guarda um snapshot por chamada de record', () => {
    const buffer = new ReplayBuffer();
    buffer.record(makeState(0));
    buffer.record(makeState(1));
    expect(buffer.getAll()).toHaveLength(2);
  });

  it('nunca guarda mais que BUFFER_SECONDS de conteúdo (descarta o mais antigo)', () => {
    const buffer = new ReplayBuffer();
    const totalTicks = Math.round(REPLAY.BUFFER_SECONDS / FIXED_TIMESTEP_S) + 50;
    for (let i = 0; i < totalTicks; i++) buffer.record(makeState(i));

    const all = buffer.getAll();
    expect(all.length).toBe(Math.round(REPLAY.BUFFER_SECONDS / FIXED_TIMESTEP_S));
    // O mais antigo guardado já não é o tick 0 — foi descartado.
    expect(all[0]?.tick).toBeGreaterThan(0);
    expect(all[all.length - 1]?.tick).toBe(totalTicks - 1);
  });

  it('getLastSeconds devolve só a cauda pedida, mais recente por último', () => {
    const buffer = new ReplayBuffer();
    for (let i = 0; i < 300; i++) buffer.record(makeState(i));

    const lastSecond = buffer.getLastSeconds(1);
    expect(lastSecond).toHaveLength(60);
    expect(lastSecond[lastSecond.length - 1]?.tick).toBe(299);
  });

  it('getLastSeconds nunca pede mais do que o buffer realmente tem', () => {
    const buffer = new ReplayBuffer();
    buffer.record(makeState(0));
    buffer.record(makeState(1));
    expect(buffer.getLastSeconds(10)).toHaveLength(2);
  });

  it('clear esvazia o buffer', () => {
    const buffer = new ReplayBuffer();
    buffer.record(makeState(0));
    buffer.clear();
    expect(buffer.getAll()).toHaveLength(0);
  });
});

describe('ReplayPlayer', () => {
  it('toca o conteúdo em REPLAY.SPEED da velocidade real', () => {
    const buffer = new ReplayBuffer();
    for (let i = 0; i < 180; i++) buffer.record(makeState(i)); // 3s de conteúdo a 60Hz

    const player = new ReplayPlayer();
    player.start(buffer.getAll());

    expect(player.durationS).toBeCloseTo(3, 5);
    expect(player.isFinished).toBe(false);

    // 1s de relógio real = REPLAY.SPEED segundos de conteúdo tocado.
    player.update(1);
    expect(player.progress).toBeCloseTo(REPLAY.SPEED / 3, 2);
    expect(player.isFinished).toBe(false);

    // Tempo real suficiente pra cobrir os 3s de conteúdo a 0.6x (5s reais).
    player.update(10);
    expect(player.isFinished).toBe(true);
    expect(player.progress).toBe(1);
  });

  it('getCurrentSnapshot avança conforme o tempo, sem passar do último snapshot', () => {
    const buffer = new ReplayBuffer();
    for (let i = 0; i < 60; i++) buffer.record(makeState(i)); // 1s de conteúdo

    const player = new ReplayPlayer();
    player.start(buffer.getAll());

    expect(player.getCurrentSnapshot()?.tick).toBe(0);

    player.update(100); // bem mais que o suficiente pra terminar
    expect(player.getCurrentSnapshot()?.tick).toBe(59);
  });

  it('skipToEnd pula direto pro final', () => {
    const buffer = new ReplayBuffer();
    for (let i = 0; i < 60; i++) buffer.record(makeState(i));

    const player = new ReplayPlayer();
    player.start(buffer.getAll());
    player.skipToEnd();

    expect(player.isFinished).toBe(true);
  });

  it('sem conteúdo, isFinished é true e getCurrentSnapshot é null', () => {
    const player = new ReplayPlayer();
    player.start([]);
    expect(player.isFinished).toBe(true);
    expect(player.getCurrentSnapshot()).toBeNull();
  });
});
