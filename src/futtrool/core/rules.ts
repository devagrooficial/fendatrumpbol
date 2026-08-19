// Regras da partida (spec seção 4): detecção de gol com swept collision,
// formação de kickoff e anti-degenerescência (seção 3.6). Puro — sem DOM,
// sem Math.random, sem Date.now.

import type { Ball, GameState, Player, PlayerId, TeamId, Vec2 } from './types';
import { FIELD, PHYS, STALL } from './constants';
import { createRngState } from './rng';
import { length, normalize, scale } from './vec2';

// ---------------------------------------------------------------------------
// Gol: teste "swept" contra o segmento percorrido no tick, não só a posição
// final — senão a bola em velocidade máxima (25 u/tick a 1500 u/s) pode
// cruzar a linha entre um frame e outro sem nunca ser detectada. Interpola
// linearmente a borda da bola entre a posição anterior e a atual, acha o t
// exato em que ela cruza x=0 (gol de teamA, esquerda) ou x=FIELD.WIDTH (gol
// de teamB, direita), e confere se o y interpolado nesse instante cai dentro
// da abertura.
// ---------------------------------------------------------------------------

export function checkGoal(prevPos: Vec2, nextPos: Vec2, radius: number): TeamId | null {
  const openingTop = FIELD.HEIGHT / 2 - FIELD.GOAL_OPENING / 2;
  const openingBottom = FIELD.HEIGHT / 2 + FIELD.GOAL_OPENING / 2;

  const leftEdgePrev = prevPos.x - radius;
  const leftEdgeNext = nextPos.x - radius;
  if (leftEdgePrev >= 0 && leftEdgeNext < 0) {
    const t = leftEdgePrev / (leftEdgePrev - leftEdgeNext);
    const y = prevPos.y + (nextPos.y - prevPos.y) * t;
    // Bola entrou pelo gol da esquerda: quem marca é teamB (teamA defende esse lado).
    if (y >= openingTop && y <= openingBottom) return 'teamB';
  }

  const rightEdgePrev = prevPos.x + radius;
  const rightEdgeNext = nextPos.x + radius;
  if (rightEdgePrev <= FIELD.WIDTH && rightEdgeNext > FIELD.WIDTH) {
    const t = (FIELD.WIDTH - rightEdgePrev) / (rightEdgeNext - rightEdgePrev);
    const y = prevPos.y + (nextPos.y - prevPos.y) * t;
    // Bola entrou pelo gol da direita: quem marca é teamA (teamB defende esse lado).
    if (y >= openingTop && y <= openingBottom) return 'teamA';
  }

  return null;
}

// ---------------------------------------------------------------------------
// Formação de kickoff
// ---------------------------------------------------------------------------

export function createKickoffPlayer(id: PlayerId, teamId: TeamId, x: number, facing: number, y: number): Player {
  return {
    id,
    teamId,
    pos: { x, y },
    vel: { x: 0, y: 0 },
    radius: PHYS.PLAYER_RADIUS,
    facing,
    kickCharge: 0,
    kickCooldown: 0,
    dashCooldown: 0,
    dashTimer: 0,
    stunTimer: 0,
    kickHeldPrev: false,
    boostStamina: 1,
  };
}

export function createKickoffBall(): Ball {
  return {
    pos: { x: FIELD.WIDTH / 2, y: FIELD.HEIGHT / 2 },
    vel: { x: 0, y: 0 },
    radius: PHYS.BALL_RADIUS,
    lastTouchedBy: null,
    stallTimer: 0,
  };
}

// Espalha `count` jogadores verticalmente dentro do campo, igualmente
// distribuídos (1 jogador = centro; 2 = 35%/65%; 3 = 25/50/75%, etc.) — pra
// times de mais de 1 jogador não nascerem empilhados um em cima do outro.
function spreadY(count: number, index: number): number {
  return (FIELD.HEIGHT * (index + 1)) / (count + 1);
}

export function createKickoffFormation(roster: Record<TeamId, PlayerId[]>): { players: Record<PlayerId, Player>; ball: Ball } {
  const players: Record<PlayerId, Player> = {};

  // teamA fica na metade esquerda olhando pro gol adversário (direita);
  // teamB o espelho. Fixo por enquanto — não há mecânica de "quem toca
  // primeiro" nem troca de lado entre kickoffs (a spec não pede isso).
  roster.teamA.forEach((id, i) => {
    players[id] = createKickoffPlayer(id, 'teamA', FIELD.WIDTH * 0.25, 0, spreadY(roster.teamA.length, i));
  });
  roster.teamB.forEach((id, i) => {
    players[id] = createKickoffPlayer(id, 'teamB', FIELD.WIDTH * 0.75, Math.PI, spreadY(roster.teamB.length, i));
  });

  return { players, ball: createKickoffBall() };
}

export function createMatchState(seed: number, phaseTimerMs: number, roster: Record<TeamId, PlayerId[]>): GameState {
  const { players, ball } = createKickoffFormation(roster);
  return {
    tick: 0,
    phase: 'kickoff',
    phaseTimer: phaseTimerMs,
    timeLeftMs: 0, // só começa a contar de verdade quando phase vira 'playing'
    overtime: false,
    result: null,
    score: { teamA: 0, teamB: 0 },
    roster,
    players,
    ball,
    rngState: createRngState(seed),
  };
}

// ---------------------------------------------------------------------------
// Anti-degenerescência (seção 3.6): bola "morta" (devagar e sem ninguém
// perto) por tempo demais leva um empurrãozinho pro centro do campo.
// ---------------------------------------------------------------------------

export function stepAntiStall(ball: Ball, players: Record<PlayerId, Player>, dt: number): Ball {
  const speed = length(ball.vel);
  const nearAnyPlayer = (Object.keys(players) as PlayerId[]).some((id) => {
    const p = players[id]!; // id veio de Object.keys(players) — sempre existe
    const dist = length({ x: p.pos.x - ball.pos.x, y: p.pos.y - ball.pos.y });
    return dist <= p.radius + ball.radius + STALL.PROXIMITY_MARGIN;
  });

  if (speed >= STALL.SPEED_THRESHOLD || nearAnyPlayer) {
    return ball.stallTimer === 0 ? ball : { ...ball, stallTimer: 0 };
  }

  const stallTimer = ball.stallTimer + dt;
  if (stallTimer < STALL.TIME_THRESHOLD_S) {
    return { ...ball, stallTimer };
  }

  const center = { x: FIELD.WIDTH / 2, y: FIELD.HEIGHT / 2 };
  const toCenter = normalize({ x: center.x - ball.pos.x, y: center.y - ball.pos.y });
  return { ...ball, vel: scale(toCenter, STALL.NUDGE_SPEED), stallTimer: 0 };
}
