// Buffer circular dos últimos REPLAY.BUFFER_SECONDS segundos de estado
// (spec seção 8). Guarda só o essencial (posições, velocidades, facing,
// placar, tick) — não o GameState inteiro, pra caber tranquilo em memória
// e em localStorage quando salvo (~poucos KB pro clipe de gol).
//
// Fica fora de core/ de propósito: não é parte da simulação determinística,
// é um artefato de gravação do lado de quem está rodando o jogo (o mesmo
// raciocínio da seção 8 sobre "salvar seed + comandos" seria uma
// alternativa mais barata, citada lá como otimização futura).

import type { Ball, GameState, Player, PlayerId, Vec2 } from '../core/types';
import { FIXED_TIMESTEP_S, PHYS, REPLAY } from '../core/constants';

export type ReplaySnapshot = {
  tick: number;
  ball: { pos: Vec2; vel: Vec2 };
  players: Record<PlayerId, { pos: Vec2; vel: Vec2; facing: number; stunned: boolean }>;
  score: Record<PlayerId, number>;
};

function toPlayerSnapshot(player: Player): ReplaySnapshot['players'][PlayerId] {
  return { pos: player.pos, vel: player.vel, facing: player.facing, stunned: player.stunTimer > 0 };
}

export function snapshotFromState(state: GameState): ReplaySnapshot {
  return {
    tick: state.tick,
    ball: { pos: state.ball.pos, vel: state.ball.vel },
    players: { p1: toPlayerSnapshot(state.players.p1), p2: toPlayerSnapshot(state.players.p2) },
    score: state.score,
  };
}

const MAX_SNAPSHOTS = Math.round(REPLAY.BUFFER_SECONDS / FIXED_TIMESTEP_S);

export class ReplayBuffer {
  private snapshots: ReplaySnapshot[] = [];

  record(state: GameState): void {
    this.snapshots.push(snapshotFromState(state));
    if (this.snapshots.length > MAX_SNAPSHOTS) this.snapshots.shift();
  }

  // Devolve os últimos `seconds` segundos gravados (ou tudo, se o buffer
  // ainda não tiver tanto conteúdo assim — início da partida).
  getLastSeconds(seconds: number): ReplaySnapshot[] {
    const count = Math.min(this.snapshots.length, Math.round(seconds / FIXED_TIMESTEP_S));
    return this.snapshots.slice(this.snapshots.length - count);
  }

  getAll(): ReplaySnapshot[] {
    return this.snapshots;
  }

  clear(): void {
    this.snapshots = [];
  }
}

// Reconstrói um Ball/players "achatados" pra renderizar, sem precisar de
// um GameState completo (o replay não roda a simulação de novo, só mostra
// o que já aconteceu).
export function ballFromSnapshot(snapshot: ReplaySnapshot): Ball {
  return { pos: snapshot.ball.pos, vel: snapshot.ball.vel, radius: PHYS.BALL_RADIUS, lastTouchedBy: null, stallTimer: 0 };
}

// Idem pro jogador — só os campos que o renderer usa (posição, facing,
// stun) importam pra reprodução visual; o resto (chute, dash, cooldowns)
// não faz sentido fora de uma simulação rodando de verdade.
export function playerFromSnapshot(id: PlayerId, snapshot: ReplaySnapshot): Player {
  const p = snapshot.players[id];
  return {
    id,
    pos: p.pos,
    vel: p.vel,
    radius: PHYS.PLAYER_RADIUS,
    facing: p.facing,
    kickCharge: 0,
    kickCooldown: 0,
    dashCooldown: 0,
    dashTimer: 0,
    stunTimer: p.stunned ? 1 : 0,
    kickHeldPrev: false,
    boostStamina: 1,
  };
}
