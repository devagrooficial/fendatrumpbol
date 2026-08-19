import { describe, expect, it } from 'vitest';
import { checkGoal, createKickoffFormation, createMatchState, stepAntiStall } from '../core/rules';
import { step } from '../core/simulation';
import { FIELD, MATCH, PHYS, STALL } from '../core/constants';
import type { Ball, Command, GameState, Player, PlayerId, TeamId } from '../core/types';

const NO_MOVE: Command = { tick: 0, move: { x: 0, y: 0 }, kickHeld: false, dash: false, boost: false };
const DT = 1 / 60;
const ROSTER: Record<TeamId, PlayerId[]> = { teamA: ['teamA-0'], teamB: ['teamB-0'] };

function commands(overrides: Partial<Record<PlayerId, Command>> = {}): Record<PlayerId, Command> {
  return { 'teamA-0': NO_MOVE, 'teamB-0': NO_MOVE, ...overrides };
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
    expect(checkGoal(prev, next, PHYS.BALL_RADIUS)).toBe('teamB');
  });

  it('detecta gol no lado direito', () => {
    const prev = { x: FIELD.WIDTH - 20, y: openingY };
    const next = { x: FIELD.WIDTH + 5, y: openingY };
    expect(checkGoal(prev, next, PHYS.BALL_RADIUS)).toBe('teamA');
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
    let state = createMatchState(1, 1500, ROSTER);
    const posBefore = state.players['teamA-0']!.pos;

    const result = step(state, commands({ 'teamA-0': { ...NO_MOVE, move: { x: 1, y: 0 } } }), DT);
    expect(result.state.phase).toBe('kickoff');
    expect(result.state.players['teamA-0']!.pos).toEqual(posBefore);

    state = playThroughKickoff(state);
    expect(state.phase).toBe('playing');
    expect(state.timeLeftMs).toBe(MATCH.DURATION_MS);
  });
});

describe('gol em partida completa', () => {
  function makeScoringState(): GameState {
    let state = createMatchState(1, 1, ROSTER);
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
    expect(result.state.score.teamB).toBe(1);
    expect(result.state.phase).toBe('goal');
    expect(result.events).toContainEqual({ type: 'goal', scorer: 'teamB' });
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
    state = { ...state, score: { teamA: 0, teamB: MATCH.GOALS_TO_WIN - 1 } };
    const result = step(state, commands(), DT);
    expect(result.state.phase).toBe('ended');
    expect(result.state.result).toBe('teamB');
    expect(result.events).toContainEqual({ type: 'matchEnded', result: 'teamB' });
  });

  it('respeita um limite de gol customizado (matchSettings), não o padrão fixo', () => {
    let state = createMatchState(1, 1, ROSTER, { durationMs: MATCH.DURATION_MS, goalsToWin: 3 });
    state = playThroughKickoff(state);
    state = {
      ...state,
      score: { teamA: 0, teamB: 2 }, // 1 abaixo do limite CUSTOMIZADO (3), bem abaixo do padrão (7)
      ball: { ...state.ball, pos: { x: 30, y: FIELD.HEIGHT / 2 }, vel: { x: -PHYS.BALL_MAX_SPEED, y: 0 } },
    };
    const result = step(state, commands(), DT);
    expect(result.state.phase).toBe('ended');
    expect(result.state.result).toBe('teamB');
  });
});

describe('cronômetro e prorrogação', () => {
  it('termina a partida quando o tempo acaba com placar diferente', () => {
    let state = createMatchState(1, 1, ROSTER);
    state = playThroughKickoff(state);
    state = { ...state, timeLeftMs: 10, score: { teamA: 2, teamB: 1 } };
    const result = step(state, commands(), 1); // 1s > 10ms restantes
    expect(result.state.phase).toBe('ended');
    expect(result.state.result).toBe('teamA');
  });

  it('entra em prorrogação se o tempo acabar empatado', () => {
    let state = createMatchState(1, 1, ROSTER);
    state = playThroughKickoff(state);
    state = { ...state, timeLeftMs: 10, score: { teamA: 1, teamB: 1 } };
    const result = step(state, commands(), 1);
    expect(result.state.phase).toBe('playing');
    expect(result.state.overtime).toBe(true);
    expect(result.state.timeLeftMs).toBe(MATCH.OVERTIME_MS);
  });

  it('termina em empate se a prorrogação também esgotar', () => {
    let state = createMatchState(1, 1, ROSTER);
    state = playThroughKickoff(state);
    state = { ...state, timeLeftMs: 10, overtime: true, score: { teamA: 1, teamB: 1 } };
    const result = step(state, commands(), 1);
    expect(result.state.phase).toBe('ended');
    expect(result.state.result).toBe('draw');
  });

  it('qualquer gol na prorrogação encerra a partida na hora (morte súbita)', () => {
    let state = createMatchState(1, 1, ROSTER);
    state = playThroughKickoff(state);
    state = {
      ...state,
      overtime: true,
      score: { teamA: 1, teamB: 1 },
      ball: { ...state.ball, pos: { x: 30, y: FIELD.HEIGHT / 2 }, vel: { x: -PHYS.BALL_MAX_SPEED, y: 0 } },
    };
    const result = step(state, commands(), DT);
    expect(result.state.phase).toBe('ended');
    expect(result.state.result).toBe('teamB');
  });

  it('dispara finalCountdown uma vez ao cruzar MATCH.FINAL_COUNTDOWN_MS restantes', () => {
    let state = createMatchState(1, 1, ROSTER);
    state = playThroughKickoff(state);
    state = { ...state, timeLeftMs: MATCH.FINAL_COUNTDOWN_MS + 5 };

    const crossing = step(state, commands(), 0.01); // 10ms > os 5ms que faltavam pro limiar
    expect(crossing.state.timeLeftMs).toBeLessThanOrEqual(MATCH.FINAL_COUNTDOWN_MS);
    expect(crossing.events).toContainEqual({ type: 'finalCountdown' });

    // Não dispara de novo no tick seguinte, já abaixo do limiar.
    const after = step(crossing.state, commands(), DT);
    expect(after.events).not.toContainEqual({ type: 'finalCountdown' });
  });

  it('não dispara finalCountdown fora da fase playing (ex.: durante o gol)', () => {
    let state = createMatchState(1, 1, ROSTER);
    state = playThroughKickoff(state);
    state = {
      ...state,
      timeLeftMs: MATCH.FINAL_COUNTDOWN_MS + 5,
      ball: { ...state.ball, pos: { x: 30, y: FIELD.HEIGHT / 2 }, vel: { x: -PHYS.BALL_MAX_SPEED, y: 0 } },
    };
    // Esse chute vira gol no mesmo tick — phase muda pra 'goal' antes do
    // relógio ter chance de cruzar o limiar via stepPlaying.
    const result = step(state, commands(), DT);
    expect(result.state.phase).toBe('goal');
    expect(result.events).not.toContainEqual({ type: 'finalCountdown' });
  });
});

describe('anti-degenerescência', () => {
  const { players } = createKickoffFormation(ROSTER);
  const farPlayers: Record<PlayerId, Player> = {
    'teamA-0': { ...players['teamA-0']!, pos: { x: -9999, y: -9999 } },
    'teamB-0': { ...players['teamB-0']!, pos: { x: -9999, y: -9999 } },
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
      'teamA-0': { ...players['teamA-0']!, pos: { x: 55, y: 50 } },
      'teamB-0': { ...players['teamB-0']!, pos: { x: -9999, y: -9999 } },
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
    let state = createMatchState(1, 1, ROSTER);
    state = playThroughKickoff(state);
    state = { ...state, phase: 'ended', result: 'teamA' };

    const result = step(state, commands({ 'teamA-0': { ...NO_MOVE, move: { x: 1, y: 1 }, kickHeld: true, dash: true } }), DT);

    expect(result.state).toBe(state); // mesma referência — nem um novo objeto é criado
    expect(result.events).toEqual([]);
  });
});

describe('2v2 (roster de 2 jogadores por time)', () => {
  const TEAM2_ROSTER: Record<TeamId, PlayerId[]> = { teamA: ['teamA-0', 'teamA-1'], teamB: ['teamB-0', 'teamB-1'] };

  it('cria os 4 jogadores sem sobreposição de posição', () => {
    const { players } = createKickoffFormation(TEAM2_ROSTER);
    const ids = Object.keys(players) as PlayerId[];
    expect(ids).toHaveLength(4);

    const positions = ids.map((id) => `${players[id]!.pos.x},${players[id]!.pos.y}`);
    expect(new Set(positions).size).toBe(4); // ninguém nasce empilhado

    // teamA na metade esquerda, teamB na direita (mesma convenção do 1v1).
    expect(players['teamA-0']!.pos.x).toBeLessThan(FIELD.WIDTH / 2);
    expect(players['teamA-1']!.pos.x).toBeLessThan(FIELD.WIDTH / 2);
    expect(players['teamB-0']!.pos.x).toBeGreaterThan(FIELD.WIDTH / 2);
    expect(players['teamB-1']!.pos.x).toBeGreaterThan(FIELD.WIDTH / 2);
  });

  it('roda uma partida inteira de 4 jogadores sem erros, com todo mundo colidindo com todo mundo', () => {
    let state = createMatchState(1, 1, TEAM2_ROSTER);
    state = playThroughKickoff(state);

    const fourWayCommands: Record<PlayerId, Command> = {
      'teamA-0': { ...NO_MOVE, move: { x: 1, y: 0 } },
      'teamA-1': { ...NO_MOVE, move: { x: 1, y: 1 } },
      'teamB-0': { ...NO_MOVE, move: { x: -1, y: 0 } },
      'teamB-1': { ...NO_MOVE, move: { x: -1, y: -1 } },
    };

    for (let i = 0; i < 600; i++) {
      state = step(state, fourWayCommands, DT).state;
      for (const player of Object.values(state.players)) {
        expect(Number.isFinite(player.pos.x)).toBe(true);
        expect(Number.isFinite(player.pos.y)).toBe(true);
      }
    }

    expect(Object.keys(state.players)).toHaveLength(4);
  });
});

describe('3v3 (roster de 3 jogadores por time — prova que generaliza, não só 2)', () => {
  const TEAM3_ROSTER: Record<TeamId, PlayerId[]> = {
    teamA: ['teamA-0', 'teamA-1', 'teamA-2'],
    teamB: ['teamB-0', 'teamB-1', 'teamB-2'],
  };

  it('cria os 6 jogadores sem sobreposição de posição', () => {
    const { players } = createKickoffFormation(TEAM3_ROSTER);
    const ids = Object.keys(players) as PlayerId[];
    expect(ids).toHaveLength(6);

    const positions = ids.map((id) => `${players[id]!.pos.x},${players[id]!.pos.y}`);
    expect(new Set(positions).size).toBe(6);

    for (const id of TEAM3_ROSTER.teamA) expect(players[id]!.pos.x).toBeLessThan(FIELD.WIDTH / 2);
    for (const id of TEAM3_ROSTER.teamB) expect(players[id]!.pos.x).toBeGreaterThan(FIELD.WIDTH / 2);
  });

  it('roda uma partida inteira de 6 jogadores sem erros', () => {
    let state = createMatchState(1, 1, TEAM3_ROSTER);
    state = playThroughKickoff(state);

    const sixWayCommands: Record<PlayerId, Command> = {
      'teamA-0': { ...NO_MOVE, move: { x: 1, y: 0 } },
      'teamA-1': { ...NO_MOVE, move: { x: 1, y: 1 } },
      'teamA-2': { ...NO_MOVE, move: { x: 1, y: -1 } },
      'teamB-0': { ...NO_MOVE, move: { x: -1, y: 0 } },
      'teamB-1': { ...NO_MOVE, move: { x: -1, y: -1 } },
      'teamB-2': { ...NO_MOVE, move: { x: -1, y: 1 } },
    };

    for (let i = 0; i < 600; i++) {
      state = step(state, sixWayCommands, DT).state;
      for (const player of Object.values(state.players)) {
        expect(Number.isFinite(player.pos.x)).toBe(true);
        expect(Number.isFinite(player.pos.y)).toBe(true);
      }
    }

    expect(Object.keys(state.players)).toHaveLength(6);
  });
});

describe('estatísticas da partida (core/types.ts MatchStats)', () => {
  function stateWithBallNear(playerId: PlayerId, lastTouchedBy: PlayerId | null): GameState {
    let state = createMatchState(1, 1, ROSTER);
    state = playThroughKickoff(state);
    const player = state.players[playerId]!;
    return {
      ...state,
      ball: { ...state.ball, pos: { x: player.pos.x + 10, y: player.pos.y }, vel: { x: 0, y: 0 }, lastTouchedBy },
    };
  }

  it('conta 1 toque quando a posse da bola muda pra um jogador', () => {
    const state = stateWithBallNear('teamA-0', null);
    expect(state.stats.touches['teamA-0']).toBe(0);

    const result = step(state, commands(), DT);
    expect(result.state.ball.lastTouchedBy).toBe('teamA-0');
    expect(result.state.stats.touches['teamA-0']).toBe(1);
  });

  it('não conta um toque novo a cada tick em que a posse continua a mesma', () => {
    const state = stateWithBallNear('teamA-0', 'teamA-0'); // já era dele ANTES desse tick
    const seeded = { ...state, stats: { ...state.stats, touches: { ...state.stats.touches, 'teamA-0': 1 } } };

    const result = step(seeded, commands(), DT);
    expect(result.state.ball.lastTouchedBy).toBe('teamA-0');
    expect(result.state.stats.touches['teamA-0']).toBe(1); // continua 1, não virou 2
  });

  it('conta toque de um jogador diferente sem mexer na contagem do anterior', () => {
    const state = stateWithBallNear('teamB-0', 'teamA-0');
    const seeded = { ...state, stats: { ...state.stats, touches: { ...state.stats.touches, 'teamA-0': 1 } } };

    const result = step(seeded, commands(), DT);
    expect(result.state.ball.lastTouchedBy).toBe('teamB-0');
    expect(result.state.stats.touches['teamB-0']).toBe(1);
    expect(result.state.stats.touches['teamA-0']).toBe(1);
  });

  it('credita o gol ao jogador que tocou por último, quando ele é do time que marcou', () => {
    let state = createMatchState(1, 1, ROSTER);
    state = playThroughKickoff(state);
    state = {
      ...state,
      ball: { ...state.ball, pos: { x: 30, y: FIELD.HEIGHT / 2 }, vel: { x: -PHYS.BALL_MAX_SPEED, y: 0 }, lastTouchedBy: 'teamB-0' },
    };
    const result = step(state, commands(), DT);
    expect(result.state.score.teamB).toBe(1);
    expect(result.state.stats.goalsByPlayer['teamB-0']).toBe(1);
  });

  it('NÃO credita o jogador em gol contra (último toque foi do time que sofreu o gol)', () => {
    let state = createMatchState(1, 1, ROSTER);
    state = playThroughKickoff(state);
    state = {
      ...state,
      // teamA-0 tocou por último, mas a bola entra no gol da ESQUERDA
      // (defendido por teamA) — gol contra: teamB marca no placar, mas
      // teamA-0 não ganha crédito individual por isso.
      ball: { ...state.ball, pos: { x: 30, y: FIELD.HEIGHT / 2 }, vel: { x: -PHYS.BALL_MAX_SPEED, y: 0 }, lastTouchedBy: 'teamA-0' },
    };
    const result = step(state, commands(), DT);
    expect(result.state.score.teamB).toBe(1);
    expect(result.state.stats.goalsByPlayer['teamA-0']).toBe(0);
    expect(result.state.stats.goalsByPlayer['teamB-0']).toBe(0);
  });

  it('acumula tempo com a bola na metade direita do campo', () => {
    let state = createMatchState(1, 1, ROSTER);
    state = playThroughKickoff(state);
    state = { ...state, ball: { ...state.ball, pos: { x: FIELD.WIDTH * 0.75, y: FIELD.HEIGHT / 2 }, vel: { x: 0, y: 0 } } };

    const result = step(state, commands(), 1); // dt = 1s
    expect(result.state.stats.playingElapsedMs).toBeCloseTo(1000, 0);
    expect(result.state.stats.ballInRightHalfMs).toBeCloseTo(1000, 0);
  });

  it('não conta a metade direita quando a bola está na metade esquerda', () => {
    let state = createMatchState(1, 1, ROSTER);
    state = playThroughKickoff(state);
    state = { ...state, ball: { ...state.ball, pos: { x: FIELD.WIDTH * 0.25, y: FIELD.HEIGHT / 2 }, vel: { x: 0, y: 0 } } };

    const result = step(state, commands(), 1);
    expect(result.state.stats.playingElapsedMs).toBeCloseTo(1000, 0);
    expect(result.state.stats.ballInRightHalfMs).toBe(0);
  });
});
