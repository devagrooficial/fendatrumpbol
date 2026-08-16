import { describe, expect, it } from 'vitest';
import { checkGoal, createKickoffFormation, createMatchState, stepAntiStall } from '../core/rules';
import { step } from '../core/simulation';
import { FIELD, MATCH, PHYS, STALL } from '../core/constants';
import type { Ball, Command, GameState, Player, PlayerId } from '../core/types';

const NO_MOVE: Command = { tick: 0, move: { x: 0, y: 0 }, kickHeld: false, dash: false };
const DT = 1 / 60;

function commands(overrides: Partial<Record<PlayerId, Command>> = {}): Record<PlayerId, Command> {
  return { p1: NO_MOVE, p2: NO_MOVE, ...overrides };
}

function playThroughKickoff(state: GameState): GameState {
  let s = state;
  while (s.phase === 'kickoff') {
    s = step(s, commands(), MATCH.KICKOFF_COUNTDOWN_MS / 1000 + 1).state;
  }
  return s;
}

describe('checkGoal (swept collision)', () => {
  const openingY = FIELD.HEIGHT / 2;

  it('detecta gol da bola em velocidade máxima cruzando a linha entre dois ticks', () => {
    // A ~1500 u/s e dt=1/60, a bola anda ~25u por tick — bem mais que o
    // suficiente pra "pular" a linha x=0 se não fosse swept. A borda da
    // bola (pos - raio) vai de +3 (ainda dentro do campo) a -22 (já do
    // outro lado da linha) num tick só.
    const prev = { x: 20, y: openingY };
    const next = { x: -5, y: openingY };
    expect(checkGoal(prev, next, PHYS.BALL_RADIUS)).toBe('p2');
  });

  it('detecta gol no lado direito', () => {
    const prev = { x: FIELD.WIDTH - 20, y: openingY };
    const next = { x: FIELD.WIDTH + 5, y: openingY };
    expect(checkGoal(prev, next, PHYS.BALL_RADIUS)).toBe('p1');
  });

  it('não conta gol se cruzar fora da abertura (bola tocando a lateral, não o gol)', () => {
    const prev = { x: 20, y: 5 };
    const next = { x: -5, y: 5 };
    expect(checkGoal(prev, next, PHYS.BALL_RADIUS)).toBeNull();
  });

  it('não conta gol se a bola não cruzar a linha', () => {
    const prev = { x: 100, y: openingY };
    const next = { x: 80, y: openingY };
    expect(checkGoal(prev, next, PHYS.BALL_RADIUS)).toBeNull();
  });
});

describe('kickoff', () => {
  it('bloqueia o placar/relógio e ignora comandos até o contador zerar', () => {
    let state = createMatchState(1, 1500);
    const posBefore = state.players.p1.pos;

    const result = step(state, commands({ p1: { ...NO_MOVE, move: { x: 1, y: 0 } } }), DT);
    expect(result.state.phase).toBe('kickoff');
    expect(result.state.players.p1.pos).toEqual(posBefore);

    state = playThroughKickoff(state);
    expect(state.phase).toBe('playing');
    expect(state.timeLeftMs).toBe(MATCH.DURATION_MS);
  });
});

describe('gol em partida completa', () => {
  function makeScoringState(): GameState {
    let state = createMatchState(1, 1);
    state = playThroughKickoff(state);
    // Bola a caminho da linha esquerda, rápido o bastante pra cruzar dentro
    // de um único tick (por isso o teste de checkGoal com swept collision
    // já cobre isso isoladamente; aqui é só pra step() reagir ao gol certo).
    state = {
      ...state,
      ball: { ...state.ball, pos: { x: 30, y: FIELD.HEIGHT / 2 }, vel: { x: -PHYS.BALL_MAX_SPEED, y: 0 } },
    };
    return state;
  }

  it('marca o gol certo e entra na fase de congelamento/replay', () => {
    const state = makeScoringState();
    const result = step(state, commands(), DT);
    expect(result.state.score.p2).toBe(1);
    expect(result.state.phase).toBe('goal');
    expect(result.events).toContainEqual({ type: 'goal', scorer: 'p2' });
  });

  it('depois do congelamento+replay, reseta pra kickoff', () => {
    let state = makeScoringState();
    state = step(state, commands(), DT).state; // gol
    expect(state.phase).toBe('goal');

    state = step(state, commands(), (MATCH.GOAL_FREEZE_MS + MATCH.GOAL_REPLAY_MS) / 1000 + 1).state;
    expect(state.phase).toBe('kickoff');
    expect(state.ball.pos.x).toBeCloseTo(FIELD.WIDTH / 2, 5);
  });

  it('termina a partida quando alguém atinge GOALS_TO_WIN', () => {
    let state = makeScoringState();
    state = { ...state, score: { p1: 0, p2: MATCH.GOALS_TO_WIN - 1 } };
    const result = step(state, commands(), DT);
    expect(result.state.phase).toBe('ended');
    expect(result.state.result).toBe('p2');
    expect(result.events).toContainEqual({ type: 'matchEnded', result: 'p2' });
  });
});

describe('cronômetro e prorrogação', () => {
  it('termina a partida quando o tempo acaba com placar diferente', () => {
    let state = createMatchState(1, 1);
    state = playThroughKickoff(state);
    state = { ...state, timeLeftMs: 10, score: { p1: 2, p2: 1 } };
    const result = step(state, commands(), 1); // 1s > 10ms restantes
    expect(result.state.phase).toBe('ended');
    expect(result.state.result).toBe('p1');
  });

  it('entra em prorrogação se o tempo acabar empatado', () => {
    let state = createMatchState(1, 1);
    state = playThroughKickoff(state);
    state = { ...state, timeLeftMs: 10, score: { p1: 1, p2: 1 } };
    const result = step(state, commands(), 1);
    expect(result.state.phase).toBe('playing');
    expect(result.state.overtime).toBe(true);
    expect(result.state.timeLeftMs).toBe(MATCH.OVERTIME_MS);
  });

  it('termina em empate se a prorrogação também esgotar', () => {
    let state = createMatchState(1, 1);
    state = playThroughKickoff(state);
    state = { ...state, timeLeftMs: 10, overtime: true, score: { p1: 1, p2: 1 } };
    const result = step(state, commands(), 1);
    expect(result.state.phase).toBe('ended');
    expect(result.state.result).toBe('draw');
  });

  it('qualquer gol na prorrogação encerra a partida na hora (morte súbita)', () => {
    let state = createMatchState(1, 1);
    state = playThroughKickoff(state);
    state = {
      ...state,
      overtime: true,
      score: { p1: 1, p2: 1 },
      ball: { ...state.ball, pos: { x: 30, y: FIELD.HEIGHT / 2 }, vel: { x: -PHYS.BALL_MAX_SPEED, y: 0 } },
    };
    const result = step(state, commands(), DT);
    expect(result.state.phase).toBe('ended');
    expect(result.state.result).toBe('p2');
  });
});

describe('anti-degenerescência', () => {
  const { players } = createKickoffFormation();
  const farPlayers: Record<PlayerId, Player> = {
    p1: { ...players.p1, pos: { x: -9999, y: -9999 } },
    p2: { ...players.p2, pos: { x: -9999, y: -9999 } },
  };

  it('não mexe na bola enquanto ela se move rápido o bastante', () => {
    const ball = { pos: { x: 50, y: 50 }, vel: { x: 100, y: 0 }, radius: PHYS.BALL_RADIUS, lastTouchedBy: null, stallTimer: 0 };
    const next = stepAntiStall(ball, farPlayers, 10);
    expect(next.vel).toEqual({ x: 100, y: 0 });
  });

  it('empurra a bola pro centro depois de TIME_THRESHOLD_S parada e sem ninguém perto', () => {
    let ball: Ball = { pos: { x: 50, y: 50 }, vel: { x: 0, y: 0 }, radius: PHYS.BALL_RADIUS, lastTouchedBy: null, stallTimer: 0 };
    // dt=1s, algumas iterações a mais que o necessário — margem de sobra
    // pra não depender de acúmulo exato de ponto flutuante batendo o limiar.
    for (let i = 0; i < Math.ceil(STALL.TIME_THRESHOLD_S) + 2; i++) {
      ball = stepAntiStall(ball, farPlayers, 1);
    }
    const speed = Math.hypot(ball.vel.x, ball.vel.y);
    expect(speed).toBeCloseTo(STALL.NUDGE_SPEED, 5);
    // Empurrão aponta pro centro do campo (x e y aumentando, já que a bola
    // estava em (50,50) e o centro é (600,400)).
    expect(ball.vel.x).toBeGreaterThan(0);
    expect(ball.vel.y).toBeGreaterThan(0);
  });

  it('não empurra se um jogador estiver perto', () => {
    const near: Record<PlayerId, Player> = {
      p1: { ...players.p1, pos: { x: 55, y: 50 } },
      p2: { ...players.p2, pos: { x: -9999, y: -9999 } },
    };
    let ball: Ball = { pos: { x: 50, y: 50 }, vel: { x: 0, y: 0 }, radius: PHYS.BALL_RADIUS, lastTouchedBy: null, stallTimer: 0 };
    const dt = STALL.TIME_THRESHOLD_S / 10;
    for (let i = 0; i < 10; i++) {
      ball = stepAntiStall(ball, near, dt);
    }
    expect(ball.vel).toEqual({ x: 0, y: 0 });
  });
});

describe('step em partida já encerrada', () => {
  it('devolve o estado sem mudar nada e sem eventos, mesmo com comandos de verdade', () => {
    let state = createMatchState(1, 1);
    state = playThroughKickoff(state);
    state = { ...state, phase: 'ended', result: 'p1' };

    const result = step(state, commands({ p1: { ...NO_MOVE, move: { x: 1, y: 1 }, kickHeld: true, dash: true } }), DT);

    expect(result.state).toBe(state); // mesma referência — nem um novo objeto é criado
    expect(result.events).toEqual([]);
  });
});
