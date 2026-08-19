// Percepção da IA (spec seção 5.1/5.2): a IA não lê o GameState ao vivo —
// ela guarda um histórico curto e decide com base num snapshot de
// `reactionMs` atrás, o que evita que ela pareça robótica/onisciente. Além
// disso, prevê o ponto de interceptação da bola simulando sua trajetória
// (com arrasto) por `predictionHorizon` segundos.

import type { TeamId, Vec2 } from '../types';
import { PHYS } from '../constants';

export type AiSnapshot = {
  tMs: number;
  ball: { pos: Vec2; vel: Vec2 };
  self: { pos: Vec2; vel: Vec2; facing: number };
  // Adversário mais próximo (não necessariamente o único — em 2v2 é quem
  // decide mirar/marcar; ver decideCommand em brain.ts) — a IA continua sem
  // noção de "time todo", só do inimigo mais relevante agora.
  opponent: { pos: Vec2; vel: Vec2 };
  score: Record<TeamId, number>;
  timeLeftMs: number;
};

// Cobre com folga o maior reactionMs da tabela 5.3 (Novato, 340ms).
export const HISTORY_MAX_MS = 600;

export function pushSnapshot(history: AiSnapshot[], snapshot: AiSnapshot): AiSnapshot[] {
  const next = [...history, snapshot];
  const cutoff = snapshot.tMs - HISTORY_MAX_MS;
  const trimmed = next.filter((s) => s.tMs >= cutoff);
  return trimmed.length > 0 ? trimmed : next;
}

// Acha o snapshot mais próximo de `nowMs - reactionMs`. Se o histórico ainda
// não é fundo o bastante (começo da partida), usa o mais antigo disponível —
// nunca olha pro futuro.
export function getDelayedSnapshot(history: AiSnapshot[], reactionMs: number, nowMs: number): AiSnapshot | null {
  if (history.length === 0) return null;
  const targetMs = nowMs - reactionMs;

  let best = history[0];
  if (!best) return null;
  let bestDiff = Math.abs(best.tMs - targetMs);

  for (const snapshot of history) {
    const diff = Math.abs(snapshot.tMs - targetMs);
    if (diff < bestDiff) {
      best = snapshot;
      bestDiff = diff;
    }
  }
  return best;
}

// Posição da bola em t segundos à frente, sob arrasto exponencial — mesma
// física de stepBallMovement, só que resolvida analiticamente (integral de
// v0*exp(-drag*t)) em vez de simular tick a tick.
function ballPositionAt(pos: Vec2, vel: Vec2, t: number): Vec2 {
  const drag = PHYS.BALL_DRAG;
  const decay = drag > 1e-6 ? (1 - Math.exp(-drag * t)) / drag : t;
  return { x: pos.x + vel.x * decay, y: pos.y + vel.y * decay };
}

// Spec 5.2: simula a trajetória da bola por `horizonS` segundos e acha o
// primeiro instante t em que distância(aiPos, ballPos(t)) <= aiMaxSpeed*t —
// ou seja, o primeiro ponto que a IA consegue alcançar a tempo. Se não achar
// nenhum dentro do horizonte, devolve a posição da bola no fim do horizonte
// (melhor estimativa disponível).
const PREDICTION_STEPS = 24;

export function predictInterceptPoint(
  ballPos: Vec2,
  ballVel: Vec2,
  aiPos: Vec2,
  aiMaxSpeed: number,
  horizonS: number,
): Vec2 {
  for (let i = 1; i <= PREDICTION_STEPS; i++) {
    const t = (i / PREDICTION_STEPS) * horizonS;
    const p = ballPositionAt(ballPos, ballVel, t);
    const dist = Math.hypot(p.x - aiPos.x, p.y - aiPos.y);
    if (dist <= aiMaxSpeed * t) return p;
  }
  return ballPositionAt(ballPos, ballVel, horizonS);
}
