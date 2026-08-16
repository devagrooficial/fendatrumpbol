// Funções puras de física (spec seção 3.5): integração de movimento,
// colisão círculo-círculo com impulso, colisão círculo-parede, chute com
// carga e dash. Nada aqui lê DOM, Math.random() ou Date.now() — regra de
// ouro da seção 1/13 da spec.

import type { Ball, Player, Vec2 } from './types';
import { FIELD, PHYS } from './constants';
import { add, clampLength, dot, length, normalize, scale, sub } from './vec2';

function angleDiff(a: number, b: number): number {
  let diff = a - b;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

// ---------------------------------------------------------------------------
// Movimento do jogador (aceleração + arrasto + clamp de velocidade máxima)
// ---------------------------------------------------------------------------

const MOVE_DEADZONE = 0.05;

export function stepPlayerMovement(player: Player, move: Vec2, dt: number): Player {
  const canAct = player.stunTimer <= 0;
  const isDashing = player.dashTimer > 0;
  const moveLen = length(move);

  let vel = player.vel;
  let facing = player.facing;

  if (canAct && !isDashing && moveLen > MOVE_DEADZONE) {
    const dir = normalize(move);
    const magnitude = Math.min(moveLen, 1);
    vel = add(vel, scale(dir, PHYS.PLAYER_ACCEL * magnitude * dt));
    facing = Math.atan2(dir.y, dir.x);
  }

  // Arrasto sempre atua — inclusive durante dash/stun. É o que traz a
  // velocidade do dash de volta ao normal sem precisar de um caso especial
  // (com DRAG=6.0, o burst de DASH_IMPULSE decai pra perto de
  // PLAYER_MAX_SPEED dentro de ~DASH_DURATION segundos, naturalmente).
  vel = scale(vel, Math.exp(-PHYS.PLAYER_DRAG * dt));

  if (!isDashing) {
    vel = clampLength(vel, PHYS.PLAYER_MAX_SPEED);
  }

  const pos = add(player.pos, scale(vel, dt));

  return {
    ...player,
    pos,
    vel,
    facing,
    kickCooldown: Math.max(0, player.kickCooldown - dt),
    dashCooldown: Math.max(0, player.dashCooldown - dt),
    dashTimer: Math.max(0, player.dashTimer - dt),
    stunTimer: Math.max(0, player.stunTimer - dt),
  };
}

// ---------------------------------------------------------------------------
// Dash
// ---------------------------------------------------------------------------

export function stepDash(player: Player, dashRequested: boolean): Player {
  const canAct = player.stunTimer <= 0;
  if (!dashRequested || !canAct || player.dashCooldown > 0) return player;

  const dir = { x: Math.cos(player.facing), y: Math.sin(player.facing) };
  return {
    ...player,
    vel: scale(dir, PHYS.DASH_IMPULSE),
    dashTimer: PHYS.DASH_DURATION,
    dashCooldown: PHYS.DASH_COOLDOWN,
  };
}

// ---------------------------------------------------------------------------
// Chute: carrega enquanto o botão está segurado, dispara na borda de soltar.
// ---------------------------------------------------------------------------

function isBallInKickRange(player: Player, ball: Ball): boolean {
  const toBall = sub(ball.pos, player.pos);
  const dist = length(toBall);
  if (dist > PHYS.KICK_RANGE) return false;
  if (dist < 1e-6) return true;

  const angleToBall = Math.atan2(toBall.y, toBall.x);
  return Math.abs(angleDiff(angleToBall, player.facing)) <= PHYS.KICK_ARC / 2;
}

function applyKickImpulse(player: Player, ball: Ball, charge: number): Ball {
  const magnitude = PHYS.KICK_MIN_IMPULSE + (PHYS.KICK_MAX_IMPULSE - PHYS.KICK_MIN_IMPULSE) * charge;
  const dir = { x: Math.cos(player.facing), y: Math.sin(player.facing) };
  const vel = clampLength(add(ball.vel, scale(dir, magnitude / PHYS.BALL_MASS)), PHYS.BALL_MAX_SPEED);
  return { ...ball, vel, lastTouchedBy: player.id };
}

export function stepKick(
  player: Player,
  ball: Ball,
  kickHeld: boolean,
  dt: number,
): { player: Player; ball: Ball; kicked: boolean; chargeUsed: number } {
  const canAct = player.stunTimer <= 0 && player.dashTimer <= 0;

  if (!canAct) {
    return { player: { ...player, kickHeldPrev: kickHeld, kickCharge: 0 }, ball, kicked: false, chargeUsed: 0 };
  }

  const releasedThisTick = player.kickHeldPrev && !kickHeld;
  let kickCharge = player.kickCharge;
  let kickCooldown = player.kickCooldown;
  let nextBall = ball;
  let kicked = false;
  const chargeUsed = kickCharge;

  if (releasedThisTick && kickCooldown <= 0) {
    if (isBallInKickRange(player, ball)) {
      nextBall = applyKickImpulse(player, ball, kickCharge);
      kicked = true;
    }
    kickCharge = 0;
    kickCooldown = PHYS.KICK_COOLDOWN;
  } else if (kickHeld && kickCooldown <= 0) {
    kickCharge = Math.min(1, kickCharge + dt / PHYS.KICK_CHARGE_TIME);
  } else if (!kickHeld) {
    kickCharge = 0;
  }

  return {
    player: { ...player, kickCharge, kickCooldown, kickHeldPrev: kickHeld },
    ball: nextBall,
    kicked,
    chargeUsed,
  };
}

// ---------------------------------------------------------------------------
// Bola: só arrasto + integração de posição (colisões são resolvidas à parte).
// ---------------------------------------------------------------------------

export function stepBallMovement(ball: Ball, dt: number): Ball {
  const vel = clampLength(scale(ball.vel, Math.exp(-PHYS.BALL_DRAG * dt)), PHYS.BALL_MAX_SPEED);
  const pos = add(ball.pos, scale(vel, dt));
  return { ...ball, pos, vel };
}

// ---------------------------------------------------------------------------
// Colisão círculo × círculo: separação proporcional à massa + impulso ao
// longo da normal com o restitution informado.
// ---------------------------------------------------------------------------

export type CircleBody = { pos: Vec2; vel: Vec2; radius: number; mass: number };

export function resolveCircleCollision(
  a: CircleBody,
  b: CircleBody,
  restitution: number,
): { a: CircleBody; b: CircleBody; collided: boolean } {
  const delta = sub(b.pos, a.pos);
  const dist = length(delta);
  const minDist = a.radius + b.radius;

  if (dist >= minDist || dist < 1e-6) {
    return { a, b, collided: false };
  }

  const normal = scale(delta, 1 / dist);
  const overlap = minDist - dist;
  const totalMass = a.mass + b.mass;

  const posA = sub(a.pos, scale(normal, overlap * (b.mass / totalMass)));
  const posB = add(b.pos, scale(normal, overlap * (a.mass / totalMass)));

  const relVel = sub(b.vel, a.vel);
  const velAlongNormal = dot(relVel, normal);

  // Já se afastando: só corrige a posição (evita "grudar"), sem impulso.
  if (velAlongNormal > 0) {
    return { a: { ...a, pos: posA }, b: { ...b, pos: posB }, collided: true };
  }

  const impulseMag = (-(1 + restitution) * velAlongNormal) / (1 / a.mass + 1 / b.mass);
  const impulse = scale(normal, impulseMag);

  return {
    a: { ...a, pos: posA, vel: sub(a.vel, scale(impulse, 1 / a.mass)) },
    b: { ...b, pos: posB, vel: add(b.vel, scale(impulse, 1 / b.mass)) },
    collided: true,
  };
}

// ---------------------------------------------------------------------------
// Colisão círculo × parede (AABB do campo). Dentro da boca do gol o limite
// lateral vira o fundo da rede (GOAL_DEPTH atrás da linha) em vez da própria
// linha — permite entrar no gol sem sair do mundo. A regra "isso é gol" é do
// M3; aqui é só a física da parede.
// ---------------------------------------------------------------------------

export type WallBody = { pos: Vec2; vel: Vec2; radius: number };

export function resolveWallCollision(body: WallBody, restitution: number): WallBody & { bounced: boolean } {
  let pos = body.pos;
  let vel = body.vel;
  const { radius } = body;
  let bounced = false;

  if (pos.y - radius < 0) {
    pos = { ...pos, y: radius };
    if (vel.y < 0) {
      vel = { ...vel, y: -vel.y * restitution };
      bounced = true;
    }
  } else if (pos.y + radius > FIELD.HEIGHT) {
    pos = { ...pos, y: FIELD.HEIGHT - radius };
    if (vel.y > 0) {
      vel = { ...vel, y: -vel.y * restitution };
      bounced = true;
    }
  }

  const openingTop = FIELD.HEIGHT / 2 - FIELD.GOAL_OPENING / 2;
  const openingBottom = FIELD.HEIGHT / 2 + FIELD.GOAL_OPENING / 2;
  const insideGoalMouth = pos.y - radius >= openingTop && pos.y + radius <= openingBottom;

  const leftBound = insideGoalMouth ? -FIELD.GOAL_DEPTH : 0;
  const rightBound = insideGoalMouth ? FIELD.WIDTH + FIELD.GOAL_DEPTH : FIELD.WIDTH;

  if (pos.x - radius < leftBound) {
    pos = { ...pos, x: leftBound + radius };
    if (vel.x < 0) {
      vel = { ...vel, x: -vel.x * restitution };
      bounced = true;
    }
  } else if (pos.x + radius > rightBound) {
    pos = { ...pos, x: rightBound - radius };
    if (vel.x > 0) {
      vel = { ...vel, x: -vel.x * restitution };
      bounced = true;
    }
  }

  return { ...body, pos, vel, bounced };
}
