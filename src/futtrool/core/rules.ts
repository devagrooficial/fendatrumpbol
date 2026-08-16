// Regras da partida (spec seção 4): detecção de gol com swept collision,
// formação de kickoff e anti-degenerescência (seção 3.6). Puro — sem DOM,
// sem Math.random, sem Date.now.

import type { Ball, GameState, Player, PlayerId, Vec2 } from './types';
import { FIELD, PHYS, STALL } from './constants';
import { createRngState } from './rng';
import { length, normalize, scale } from './vec2';

// ---------------------------------------------------------------------------
// Gol: teste "swept" contra o segmento percorrido no tick, não só a posição
// final — senão a bola em velocidade máxima (25 u/tick a 1500 u/s) pode
// cruzar a linha entre um frame e outro sem nunca ser detectada. Interpola
// linearmente a borda da bola entre a posição anterior e a atual, acha o t
// exato em que ela cruza x=0 (gol de p1, esquerda) ou x=FIELD.WIDTH (gol de
// p2, direita), e confere se o y interpolado nesse instante cai dentro da
// abertura.
// ---------------------------------------------------------------------------

export function checkGoal(prevPos: Vec2, nextPos: Vec2, radius: number): PlayerId | null {
  const openingTop = FIELD.HEIGHT / 2 - FIELD.GOAL_OPENING / 2;
  const openingBottom = FIELD.HEIGHT / 2 + FIELD.GOAL_OPENING / 2;

  const leftEdgePrev = prevPos.x - radius;
  const leftEdgeNext = nextPos.x - radius;
  if (leftEdgePrev >= 0 && leftEdgeNext < 0) {
    const t = leftEdgePrev / (leftEdgePrev - leftEdgeNext);
    const y = prevPos.y + (nextPos.y - prevPos.y) * t;
    // Bola entrou pelo gol da esquerda: quem marca é p2 (p1 defende esse lado).
    if (y >= openingTop && y <= openingBottom) return 'p2';
  }

  const rightEdgePrev = prevPos.x + radius;
  const rightEdgeNext = nextPos.x + radius;
  if (rightEdgePrev <= FIELD.WIDTH && rightEdgeNext > FIELD.WIDTH) {
    const t = (FIELD.WIDTH - rightEdgePrev) / (rightEdgeNext - rightEdgePrev);
    const y = prevPos.y + (nextPos.y - prevPos.y) * t;
    // Bola entrou pelo gol da direita: quem marca é p1 (p2 defende esse lado).
    if (y >= openingTop && y <= openingBottom) return 'p1';
  }

  return null;
}

// ---------------------------------------------------------------------------
// Formação de kickoff
// ---------------------------------------------------------------------------

export function createKickoffPlayer(id: PlayerId, x: number, facing: number): Player {
  return {
    id,
    pos: { x, y: FIELD.HEIGHT / 2 },
    vel: { x: 0, y: 0 },
    radius: PHYS.PLAYER_RADIUS,
    facing,
    kickCharge: 0,
    kickCooldown: 0,
    dashCooldown: 0,
    dashTimer: 0,
    stunTimer: 0,
    kickHeldPrev: false,
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

export function createKickoffFormation(): { players: Record<PlayerId, Player>; ball: Ball } {
  return {
    // p1 fica na metade esquerda olhando pro gol adversário (direita); p2 o
    // espelho. Fixo por enquanto — não há mecânica de "quem toca primeiro"
    // nem troca de lado entre kickoffs (a spec não pede isso).
    players: {
      p1: createKickoffPlayer('p1', FIELD.WIDTH * 0.25, 0),
      p2: createKickoffPlayer('p2', FIELD.WIDTH * 0.75, Math.PI),
    },
    ball: createKickoffBall(),
  };
}

export function createMatchState(seed: number, phaseTimerMs: number): GameState {
  const { players, ball } = createKickoffFormation();
  return {
    tick: 0,
    phase: 'kickoff',
    phaseTimer: phaseTimerMs,
    timeLeftMs: 0, // só começa a contar de verdade quando phase vira 'playing'
    overtime: false,
    result: null,
    score: { p1: 0, p2: 0 },
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
    const p = players[id];
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
