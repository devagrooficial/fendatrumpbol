// step(state, commands, dt) -> { state, events } : função pura,
// determinística. Mesmo estado + mesmos comandos = mesmo resultado, sempre
// (decisões 1 e 2 da seção 13 da spec — pré-requisito pro multiplayer da
// entrega 2). `events` é efêmero (não faz parte do estado persistido), só
// pra UI/áudio/replay reagirem sem comparar dois estados.

import type { Ball, Command, GameState, MatchEvent, Player, PlayerId } from './types';
import { MATCH, PHYS } from './constants';
import {
  resolveCircleCollision,
  resolveWallCollision,
  stepBallMovement,
  stepDash,
  stepKick,
  stepPlayerMovement,
} from './physics';
import { checkGoal, createKickoffFormation, stepAntiStall } from './rules';

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

function resolvePlayerPlayer(p1: Player, p2: Player): { p1: Player; p2: Player; collided: boolean } {
  const result = resolveCircleCollision(
    { pos: p1.pos, vel: p1.vel, radius: p1.radius, mass: PHYS.PLAYER_MASS },
    { pos: p2.pos, vel: p2.vel, radius: p2.radius, mass: PHYS.PLAYER_MASS },
    PHYS.PLAYER_RESTITUTION,
  );

  let nextP1: Player = { ...p1, pos: result.a.pos, vel: result.a.vel };
  let nextP2: Player = { ...p2, pos: result.b.pos, vel: result.b.vel };

  // Dash atropela: quem está com dashTimer ativo atordoa o outro no contato.
  // Simplificação conhecida do M2: reaplica o stun a cada tick de overlap
  // (ver docs/NOTES.md) — polimento pendente pro M9, não bloqueia o resto.
  if (result.collided) {
    if (p1.dashTimer > 0 && p2.dashTimer <= 0) {
      nextP2 = { ...nextP2, stunTimer: PHYS.DASH_STUN_ON_HIT };
    } else if (p2.dashTimer > 0 && p1.dashTimer <= 0) {
      nextP1 = { ...nextP1, stunTimer: PHYS.DASH_STUN_ON_HIT };
    }
  }

  return { p1: nextP1, p2: nextP2, collided: result.collided };
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

  let p1 = state.players.p1;
  let p2 = state.players.p2;
  let ball = state.ball;
  const prevBallPos = ball.pos;

  if (commands.p1.dash && p1.dashCooldown <= 0 && p1.stunTimer <= 0) events.push({ type: 'dash', playerId: 'p1' });
  p1 = stepDash(p1, commands.p1.dash);
  p1 = stepPlayerMovement(p1, commands.p1.move, dt);
  {
    const kickResult = stepKick(p1, ball, commands.p1.kickHeld, dt);
    p1 = kickResult.player;
    ball = kickResult.ball;
    if (kickResult.kicked) {
      events.push({
        type: 'kick',
        playerId: 'p1',
        pos: ball.pos,
        dir: { x: Math.cos(p1.facing), y: Math.sin(p1.facing) },
        charge: kickResult.chargeUsed,
      });
    }
  }

  if (commands.p2.dash && p2.dashCooldown <= 0 && p2.stunTimer <= 0) events.push({ type: 'dash', playerId: 'p2' });
  p2 = stepDash(p2, commands.p2.dash);
  p2 = stepPlayerMovement(p2, commands.p2.move, dt);
  {
    const kickResult = stepKick(p2, ball, commands.p2.kickHeld, dt);
    p2 = kickResult.player;
    ball = kickResult.ball;
    if (kickResult.kicked) {
      events.push({
        type: 'kick',
        playerId: 'p2',
        pos: ball.pos,
        dir: { x: Math.cos(p2.facing), y: Math.sin(p2.facing) },
        charge: kickResult.chargeUsed,
      });
    }
  }

  ball = stepBallMovement(ball, dt);

  {
    const result = resolvePlayerPlayer(p1, p2);
    p1 = result.p1;
    p2 = result.p2;
    if (result.collided) events.push({ type: 'playerCollision' });
  }
  ({ player: p1, ball } = resolvePlayerBall(p1, ball));
  ({ player: p2, ball } = resolvePlayerBall(p2, ball));

  p1 = applyWallBounce(p1, PHYS.PLAYER_RESTITUTION).entity;
  p2 = applyWallBounce(p2, PHYS.PLAYER_RESTITUTION).entity;
  {
    const wall = applyWallBounce(ball, PHYS.BALL_WALL_RESTITUTION);
    ball = wall.entity;
    if (wall.bounced) events.push({ type: 'ballWallBounce' });
  }

  ball = stepAntiStall(ball, { p1, p2 }, dt);

  const scorer = checkGoal(prevBallPos, ball.pos, ball.radius);

  let { score, phase, phaseTimer, overtime, timeLeftMs, result } = state;
  phase = 'playing';

  if (scorer) {
    score = { ...score, [scorer]: score[scorer] + 1 };

    const wonByGoals = !overtime && score[scorer] >= MATCH.GOALS_TO_WIN;
    if (overtime || wonByGoals) {
      phase = 'ended';
      result = scorer;
    } else {
      phase = 'goal';
      phaseTimer = MATCH.GOAL_FREEZE_MS + MATCH.GOAL_REPLAY_MS;
    }
  } else {
    timeLeftMs = Math.max(0, timeLeftMs - dt * 1000);
    if (timeLeftMs <= 0) {
      if (score.p1 === score.p2) {
        if (!overtime) {
          overtime = true;
          timeLeftMs = MATCH.OVERTIME_MS;
        } else {
          phase = 'ended';
          result = 'draw';
        }
      } else {
        phase = 'ended';
        result = score.p1 > score.p2 ? 'p1' : 'p2';
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
      players: { p1, p2 },
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
      const timeLeftMs = state.timeLeftMs > 0 ? state.timeLeftMs : MATCH.DURATION_MS;
      events.push({ type: 'kickoffEnded' });
      return { state: { ...state, tick: state.tick + 1, phase: 'playing', phaseTimer: 0, timeLeftMs }, events };
    }
    return { state: { ...state, tick: state.tick + 1, phaseTimer }, events };
  }

  if (state.phase === 'goal') {
    const phaseTimer = state.phaseTimer - dt * 1000;
    if (phaseTimer <= 0) {
      const { players, ball } = createKickoffFormation();
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

  if (after.score.p1 !== before.score.p1) events.push({ type: 'goal', scorer: 'p1' });
  if (after.score.p2 !== before.score.p2) events.push({ type: 'goal', scorer: 'p2' });
  if (before.overtime !== after.overtime && after.overtime) events.push({ type: 'overtimeStarted' });
  if (after.phase === 'ended' && after.result) events.push({ type: 'matchEnded', result: after.result });

  return { state: { ...after, tick: after.tick + 1 }, events };
}
