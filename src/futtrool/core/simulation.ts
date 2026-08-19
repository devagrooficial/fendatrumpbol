// step(state, commands, dt) -> { state, events } : função pura,
// determinística. Mesmo estado + mesmos comandos = mesmo resultado, sempre
// (decisões 1 e 2 da seção 13 da spec — pré-requisito pro multiplayer da
// entrega 2). `events` é efêmero (não faz parte do estado persistido), só
// pra UI/áudio/replay reagirem sem comparar dois estados.
//
// Generalizado pra N jogadores por time (1v1, 2v2, ...) — em vez de p1/p2
// fixos, itera sobre `Object.keys(state.players)`. Colisão jogador-jogador
// é par-a-par entre TODO mundo em campo, incluindo companheiros de time
// (fisicamente faz sentido poder esbarrar no seu próprio parceiro).

import type { Ball, Command, GameState, MatchEvent, Player, PlayerId, TeamId } from './types';
import { teamOf } from './types';
import { FIELD, MATCH, PHYS } from './constants';
import {
  resolveCircleCollision,
  resolveWallCollision,
  stepBallMovement,
  stepDash,
  stepKick,
  stepPlayerMovement,
} from './physics';
import { checkGoal, createKickoffFormation, stepAntiStall } from './rules';

const NEUTRAL_COMMAND: Command = { tick: 0, move: { x: 0, y: 0 }, kickHeld: false, dash: false, boost: false };

function resolvePlayerBall(player: Player, ball: Ball): { player: Player; ball: Ball } {
  const result = resolveCircleCollision(
    { pos: player.pos, vel: player.vel, radius: player.radius, mass: PHYS.PLAYER_MASS },
    { pos: ball.pos, vel: ball.vel, radius: ball.radius, mass: PHYS.BALL_MASS },
    PHYS.BALL_PLAYER_RESTITUTION,
  );

  return {
    player: { ...player, pos: result.a.pos, vel: result.a.vel },
    ball: {
      ...ball,
      pos: result.b.pos,
      vel: result.b.vel,
      lastTouchedBy: result.collided ? player.id : ball.lastTouchedBy,
    },
  };
}

function resolvePlayerPlayer(a: Player, b: Player): { a: Player; b: Player; collided: boolean } {
  const result = resolveCircleCollision(
    { pos: a.pos, vel: a.vel, radius: a.radius, mass: PHYS.PLAYER_MASS },
    { pos: b.pos, vel: b.vel, radius: b.radius, mass: PHYS.PLAYER_MASS },
    PHYS.PLAYER_RESTITUTION,
  );

  let nextA: Player = { ...a, pos: result.a.pos, vel: result.a.vel };
  let nextB: Player = { ...b, pos: result.b.pos, vel: result.b.vel };

  // Dash atropela: quem está com dashTimer ativo atordoa o outro no contato.
  // Simplificação conhecida do M2: reaplica o stun a cada tick de overlap
  // (ver docs/NOTES.md) — polimento pendente pro M9, não bloqueia o resto.
  if (result.collided) {
    if (a.dashTimer > 0 && b.dashTimer <= 0) {
      nextB = { ...nextB, stunTimer: PHYS.DASH_STUN_ON_HIT };
    } else if (b.dashTimer > 0 && a.dashTimer <= 0) {
      nextA = { ...nextA, stunTimer: PHYS.DASH_STUN_ON_HIT };
    }
  }

  return { a: nextA, b: nextB, collided: result.collided };
}

function applyWallBounce<T extends { pos: Player['pos']; vel: Player['vel']; radius: number }>(
  entity: T,
  restitution: number,
): { entity: T; bounced: boolean } {
  const result = resolveWallCollision({ pos: entity.pos, vel: entity.vel, radius: entity.radius }, restitution);
  return { entity: { ...entity, pos: result.pos, vel: result.vel }, bounced: result.bounced };
}

function stepPlaying(
  state: GameState,
  commands: Record<PlayerId, Command>,
  dt: number,
): { state: GameState; events: MatchEvent[] } {
  const events: MatchEvent[] = [];
  const playerIds = Object.keys(state.players) as PlayerId[];

  let players: Record<PlayerId, Player> = {};
  let ball = state.ball;
  const prevBallPos = ball.pos;
  const prevLastTouchedBy = ball.lastTouchedBy;

  // 1) Dash/movimento/chute — por jogador, sem interação entre eles ainda.
  for (const id of playerIds) {
    let p = state.players[id]!; // id veio de Object.keys(state.players) — sempre existe
    const cmd = commands[id] ?? NEUTRAL_COMMAND;

    if (cmd.dash && p.dashCooldown <= 0 && p.stunTimer <= 0) events.push({ type: 'dash', playerId: id });
    p = stepDash(p, cmd.dash);
    p = stepPlayerMovement(p, cmd.move, cmd.boost, dt);

    const kickResult = stepKick(p, ball, cmd.kickHeld, dt);
    p = kickResult.player;
    ball = kickResult.ball;
    if (kickResult.kicked) {
      events.push({
        type: 'kick',
        playerId: id,
        pos: ball.pos,
        dir: { x: Math.cos(p.facing), y: Math.sin(p.facing) },
        charge: kickResult.chargeUsed,
      });
    }

    players[id] = p;
  }

  ball = stepBallMovement(ball, dt);

  // 2) Colisão jogador-jogador — todos os pares (inclui companheiros de time).
  for (let i = 0; i < playerIds.length; i++) {
    for (let j = i + 1; j < playerIds.length; j++) {
      const idA = playerIds[i]!;
      const idB = playerIds[j]!;
      const result = resolvePlayerPlayer(players[idA]!, players[idB]!);
      players[idA] = result.a;
      players[idB] = result.b;
      if (result.collided) events.push({ type: 'playerCollision' });
    }
  }

  // 3) Colisão jogador-bola.
  for (const id of playerIds) {
    const result = resolvePlayerBall(players[id]!, ball);
    players[id] = result.player;
    ball = result.ball;
  }

  // 4) Paredes.
  for (const id of playerIds) {
    players[id] = applyWallBounce(players[id]!, PHYS.PLAYER_RESTITUTION).entity;
  }
  {
    const wall = applyWallBounce(ball, PHYS.BALL_WALL_RESTITUTION);
    ball = wall.entity;
    if (wall.bounced) events.push({ type: 'ballWallBounce' });
  }

  ball = stepAntiStall(ball, players, dt);

  const scoringTeam = checkGoal(prevBallPos, ball.pos, ball.radius);

  // Estatísticas (menu > fim de jogo, ver core/types.ts MatchStats): toque
  // é só TROCA de posse (lastTouchedBy virando um jogador novo), não um por
  // tick — senão driblar do lado do adversário por 1s contaria uns 60
  // "toques". Metade direita/esquerda: ver comentário de ballInRightHalfMs
  // em types.ts.
  let stats = state.stats;
  {
    const touchedNow = ball.lastTouchedBy;
    const touches =
      touchedNow && touchedNow !== prevLastTouchedBy
        ? { ...stats.touches, [touchedNow]: (stats.touches[touchedNow] ?? 0) + 1 }
        : stats.touches;
    stats = {
      ...stats,
      touches,
      ballInRightHalfMs: stats.ballInRightHalfMs + (ball.pos.x >= FIELD.WIDTH / 2 ? dt * 1000 : 0),
      playingElapsedMs: stats.playingElapsedMs + dt * 1000,
    };
  }

  let { score, phase, phaseTimer, overtime, timeLeftMs, result } = state;
  phase = 'playing';

  if (scoringTeam) {
    score = { ...score, [scoringTeam]: score[scoringTeam] + 1 };

    // Só credita o jogador se ele mesmo é do time que marcou — bola que
    // entra por último toque de um jogador do time ADVERSÁRIO é gol
    // contra: o placar do time sobe do mesmo jeito (`score` acima), mas
    // ninguém ganha crédito individual por isso.
    const scorer = ball.lastTouchedBy;
    if (scorer && teamOf(scorer) === scoringTeam) {
      stats = { ...stats, goalsByPlayer: { ...stats.goalsByPlayer, [scorer]: (stats.goalsByPlayer[scorer] ?? 0) + 1 } };
    }

    const wonByGoals = !overtime && score[scoringTeam] >= state.matchSettings.goalsToWin;
    if (overtime || wonByGoals) {
      phase = 'ended';
      result = scoringTeam;
    } else {
      phase = 'goal';
      phaseTimer = MATCH.GOAL_FREEZE_MS + MATCH.GOAL_REPLAY_MS;
    }
  } else {
    timeLeftMs = Math.max(0, timeLeftMs - dt * 1000);
    if (timeLeftMs <= 0) {
      if (score.teamA === score.teamB) {
        if (!overtime) {
          overtime = true;
          timeLeftMs = MATCH.OVERTIME_MS;
        } else {
          phase = 'ended';
          result = 'draw';
        }
      } else {
        phase = 'ended';
        result = score.teamA > score.teamB ? 'teamA' : 'teamB';
      }
    }
  }

  return {
    state: {
      ...state,
      phase,
      phaseTimer,
      overtime,
      timeLeftMs,
      result,
      score,
      stats,
      players,
      ball,
    },
    events,
  };
}

export function step(
  state: GameState,
  commands: Record<PlayerId, Command>,
  dt: number,
): { state: GameState; events: MatchEvent[] } {
  const events: MatchEvent[] = [];

  if (state.phase === 'ended') {
    return { state, events };
  }

  if (state.phase === 'kickoff') {
    const phaseTimer = state.phaseTimer - dt * 1000;
    if (phaseTimer <= 0) {
      // timeLeftMs só é 0 no kickoff inicial (createMatchState começa
      // assim); qualquer kickoff pós-gol retoma o relógio de onde parou —
      // nunca volta a ser 0 nesse ponto (ver stepPlaying: ou o relógio some
      // com o placar decidindo o jogo, ou vira prorrogação já com
      // OVERTIME_MS > 0).
      const timeLeftMs = state.timeLeftMs > 0 ? state.timeLeftMs : state.matchSettings.durationMs;
      events.push({ type: 'kickoffEnded' });
      return { state: { ...state, tick: state.tick + 1, phase: 'playing', phaseTimer: 0, timeLeftMs }, events };
    }
    return { state: { ...state, tick: state.tick + 1, phaseTimer }, events };
  }

  if (state.phase === 'goal') {
    const phaseTimer = state.phaseTimer - dt * 1000;
    if (phaseTimer <= 0) {
      const { players, ball } = createKickoffFormation(state.roster);
      events.push({ type: 'kickoffStarted' });
      return {
        state: { ...state, tick: state.tick + 1, phase: 'kickoff', phaseTimer: MATCH.KICKOFF_COUNTDOWN_MS, players, ball },
        events,
      };
    }
    return { state: { ...state, tick: state.tick + 1, phaseTimer }, events };
  }

  // phase === 'playing'
  const before = state;
  const playingResult = stepPlaying(state, commands, dt);
  const after = playingResult.state;
  events.push(...playingResult.events);

  (['teamA', 'teamB'] as TeamId[]).forEach((teamId) => {
    if (after.score[teamId] !== before.score[teamId]) events.push({ type: 'goal', scorer: teamId });
  });
  if (before.overtime !== after.overtime && after.overtime) events.push({ type: 'overtimeStarted' });
  if (before.timeLeftMs > MATCH.FINAL_COUNTDOWN_MS && after.timeLeftMs <= MATCH.FINAL_COUNTDOWN_MS) {
    events.push({ type: 'finalCountdown' });
  }
  if (after.phase === 'ended' && after.result) events.push({ type: 'matchEnded', result: after.result });

  return { state: { ...after, tick: after.tick + 1 }, events };
}
