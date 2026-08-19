// Máquina de estados da IA (spec seção 5.1): Percepção -> Decisão -> Comando.
// A IA só enxerga o mesmo GameState que qualquer jogador veria e só produz
// um Command — sem acesso privilegiado (nem à posição "real" sem atraso do
// adversário, nem a cooldowns escondidos).
//
// Simplificação registrada em docs/NOTES.md: o atraso de reactionMs vale
// pra ESTRATÉGIA (qual estado da FSM, pra onde correr), reavaliada a cada
// 100ms como a spec pede. O gatilho fino de "a bola está no alcance do meu
// chute agora" usa a posição atual de verdade — do contrário a IA erraria
// contatos triviais por causa do próprio atraso que deveria só afetar
// leitura estratégica, não a coordenação motor-mão do próprio corpo.

import type { Command, GameState, Player, PlayerId, TeamId, Vec2 } from '../types';
import { teamOf } from '../types';
import { FIELD, PHYS } from '../constants';
import { createRngState, nextRandom, nextRange, type RngState } from '../rng';
import { add, length, normalize, scale, sub } from '../vec2';
import { getDelayedSnapshot, predictInterceptPoint, pushSnapshot, type AiSnapshot } from './perception';
import type { AiProfile } from './profiles';

export type AiFsmState = 'kickoff' | 'chase' | 'intercept' | 'attack' | 'defend' | 'recover' | 'celebrate';

type KickPlan = {
  holdSecondsTarget: number;
  holdSecondsElapsed: number;
  aimDir: Vec2;
};

export type AiState = {
  history: AiSnapshot[];
  fsmState: AiFsmState;
  targetPoint: Vec2;
  msSinceEval: number;
  idleTimer: number;
  kicking: KickPlan | null;
  rngState: RngState;
};

export function createAiState(seed: number): AiState {
  return {
    history: [],
    fsmState: 'kickoff',
    targetPoint: { x: FIELD.WIDTH / 2, y: FIELD.HEIGHT / 2 },
    msSinceEval: Number.POSITIVE_INFINITY, // força avaliação no primeiro tick
    idleTimer: 0,
    kicking: null,
    rngState: createRngState(seed),
  };
}

const EVAL_INTERVAL_MS = 100;
const IDLE_MIN_S = 0.2;
const IDLE_MAX_S = 0.5;
const NO_COMMAND: Omit<Command, 'tick'> = { move: { x: 0, y: 0 }, kickHeld: false, dash: false, boost: false };

function goalCenter(side: 'left' | 'right'): Vec2 {
  return { x: side === 'left' ? 0 : FIELD.WIDTH, y: FIELD.HEIGHT / 2 };
}

// progresso 0 = na própria linha de fundo, FIELD.WIDTH = na linha do
// adversário — normaliza os dois lados do campo pro mesmo raciocínio.
function attackProgress(x: number, mySide: 'left' | 'right'): number {
  return mySide === 'left' ? x : FIELD.WIDTH - x;
}

function bestShotTarget(oppGoalX: number, defenderPos: Vec2): Vec2 {
  const inset = 15; // mira um pouco pra dentro da trave, não em cima dela
  const top = { x: oppGoalX, y: FIELD.HEIGHT / 2 - FIELD.GOAL_OPENING / 2 + inset };
  const bottom = { x: oppGoalX, y: FIELD.HEIGHT / 2 + FIELD.GOAL_OPENING / 2 - inset };
  return Math.abs(defenderPos.y - top.y) > Math.abs(defenderPos.y - bottom.y) ? top : bottom;
}

function rotate(dir: Vec2, radians: number): Vec2 {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: dir.x * cos - dir.y * sin, y: dir.x * sin + dir.y * cos };
}

type FsmDecision = {
  fsmState: AiFsmState;
  targetPoint: Vec2;
  wantsToShoot: boolean;
  shootPower: number; // 0..1, carga alvo ANTES do ruído de chargeAccuracy
  rngState: RngState;
};

function evaluateFsm(
  perceived: AiSnapshot,
  mySide: 'left' | 'right',
  profile: AiProfile,
  rngState: RngState,
): FsmDecision {
  const ownGoal = goalCenter(mySide);
  const aiMaxSpeed = PHYS.PLAYER_MAX_SPEED * profile.speedFactor;

  const distSelfToBall = length(sub(perceived.ball.pos, perceived.self.pos));
  const distOppToBall = length(sub(perceived.ball.pos, perceived.opponent.pos));
  const ballProgress = attackProgress(perceived.ball.pos.x, mySide);
  const selfProgress = attackProgress(perceived.self.pos.x, mySide);

  const CLOSER_MARGIN = 40; // u — evita alternar estado por diferença insignificante
  const iAmCloser = distSelfToBall <= distOppToBall + CLOSER_MARGIN;
  const beatenByOpponent = ballProgress < selfProgress - 60 && !iAmCloser;

  let fsmState: AiFsmState;
  if (beatenByOpponent) {
    fsmState = 'recover';
  } else if (ballProgress < FIELD.WIDTH / 3 && !iAmCloser) {
    fsmState = 'defend';
  } else if (iAmCloser) {
    if (ballProgress > (FIELD.WIDTH * 2) / 3) {
      fsmState = 'attack';
    } else {
      const ballSpeed = length(perceived.ball.vel);
      fsmState = ballSpeed > 40 ? 'intercept' : 'chase';
    }
  } else {
    fsmState = 'defend';
  }

  let targetPoint: Vec2;
  switch (fsmState) {
    case 'recover': {
      const toGoal = sub(ownGoal, perceived.ball.pos);
      targetPoint = add(perceived.ball.pos, scale(normalize(toGoal), length(toGoal) * 0.7));
      break;
    }
    case 'defend': {
      const anchor =
        profile.defensivePositioning === 'anticipate'
          ? predictInterceptPoint(perceived.ball.pos, perceived.ball.vel, perceived.self.pos, aiMaxSpeed, profile.predictionHorizon)
          : perceived.ball.pos;
      if (profile.defensivePositioning === 'weak') {
        targetPoint = anchor;
      } else {
        const depthFraction = profile.defensivePositioning === 'anticipate' ? 0.55 : 0.4;
        targetPoint = add(ownGoal, scale(sub(anchor, ownGoal), depthFraction));
      }
      break;
    }
    case 'intercept':
      targetPoint = predictInterceptPoint(
        perceived.ball.pos,
        perceived.ball.vel,
        perceived.self.pos,
        aiMaxSpeed,
        profile.predictionHorizon,
      );
      break;
    case 'attack': {
      // Não anda direto pra cima da bola — se posiciona do lado oposto ao
      // gol adversário (um "standoff" atrás da bola), pra quando chegar lá
      // já estar de frente pro alvo do chute com a bola no meio do caminho.
      // Sem isso, o facing do chute (mira) e a posição real da bola raramente
      // coincidem dentro do cone de KICK_ARC, e o chute falha em silêncio.
      const oppGoalX = mySide === 'left' ? FIELD.WIDTH : 0;
      const shotTarget = bestShotTarget(oppGoalX, perceived.opponent.pos);
      const shotDir = normalize(sub(shotTarget, perceived.ball.pos));
      const standoff = PHYS.PLAYER_RADIUS + PHYS.BALL_RADIUS + 12;
      targetPoint = sub(perceived.ball.pos, scale(shotDir, standoff));
      break;
    }
    case 'chase':
      targetPoint = perceived.ball.pos;
      break;
    default:
      targetPoint = perceived.self.pos;
  }

  const wantsToShoot = fsmState === 'attack' || (fsmState === 'defend' && distSelfToBall <= PHYS.KICK_RANGE * 1.5);
  const shootPower = fsmState === 'attack' ? 0.9 : 0.35;

  return { fsmState, targetPoint, wantsToShoot, shootPower, rngState };
}

function planKick(
  wantsToShoot: boolean,
  shootPower: number,
  fsmState: AiFsmState,
  ballPos: Vec2,
  oppPos: Vec2,
  mySide: 'left' | 'right',
  profile: AiProfile,
  rngState: RngState,
): { plan: KickPlan | null; rngState: RngState } {
  if (!wantsToShoot) return { plan: null, rngState };

  let state = rngState;
  const mistakeRoll = nextRandom(state);
  state = mistakeRoll.nextState;
  const madeMistake = mistakeRoll.value < profile.mistakeChance;

  let aimDir: Vec2;
  if (madeMistake) {
    const randomAngle = nextRange(state, 0, Math.PI * 2);
    state = randomAngle.nextState;
    aimDir = { x: Math.cos(randomAngle.value), y: Math.sin(randomAngle.value) };
  } else if (fsmState === 'attack') {
    // Mira a partir da BOLA, não do jogador — é a bola que precisa viajar
    // até o alvo, e o jogador já deveria estar posicionado atrás dela
    // nessa direção (ver o "standoff" calculado em evaluateFsm).
    const oppGoalX = mySide === 'left' ? FIELD.WIDTH : 0;
    const target = bestShotTarget(oppGoalX, oppPos);
    aimDir = normalize(sub(target, ballPos));
  } else {
    // Afastar da própria área — "clareia" pro meio-campo/frente.
    const upfield = mySide === 'left' ? { x: 1, y: 0 } : { x: -1, y: 0 };
    aimDir = upfield;
  }

  const errorRoll = nextRange(state, -profile.aimErrorDeg, profile.aimErrorDeg);
  state = errorRoll.nextState;
  aimDir = rotate(aimDir, (errorRoll.value * Math.PI) / 180);

  const chargeNoiseRoll = nextRange(state, -1, 1);
  state = chargeNoiseRoll.nextState;
  const noiseSpread = (1 - profile.chargeAccuracy) * 0.4;
  const targetCharge = Math.min(1, Math.max(0, shootPower + chargeNoiseRoll.value * noiseSpread));

  return {
    plan: { holdSecondsTarget: targetCharge * PHYS.KICK_CHARGE_TIME, holdSecondsElapsed: 0, aimDir },
    rngState: state,
  };
}

// Adversário mais próximo do jogador `self` (qualquer um do time contrário
// — ver comentário de AiSnapshot.opponent) — em 1v1 é sempre o único
// jogador do outro time, então o comportamento pra quem já jogava contra a
// IA não muda em nada.
function findNearestOpponent(world: GameState, self: Player): Player {
  const myTeam = self.teamId;
  const opponentTeam: TeamId = myTeam === 'teamA' ? 'teamB' : 'teamA';
  const opponentIds = world.roster[opponentTeam];

  let nearest = world.players[opponentIds[0]!]!; // roster de cada time nunca é vazio
  let nearestDist = length(sub(nearest.pos, self.pos));
  for (let i = 1; i < opponentIds.length; i++) {
    const candidate = world.players[opponentIds[i]!]!;
    const dist = length(sub(candidate.pos, self.pos));
    if (dist < nearestDist) {
      nearest = candidate;
      nearestDist = dist;
    }
  }
  return nearest;
}

// Quem no MEU time está mais perto da bola agora — só esse (rank 0) age
// como "respondente" e persegue/disputa a jogada; os outros seguram
// posição (ver holdingPosition). Sem isso, cada bot só olha pro adversário
// mais próximo (evaluateFsm) e ignora os PRÓPRIOS companheiros, então todo
// mundo do time converge pro mesmo ponto — a bola — e empilha em cima um
// do outro (foi literalmente o que o Mateus viu e reportou num 3v3). Usa
// posição em tempo real dos companheiros (não a percepção com atraso) —
// a regra de "sem acesso privilegiado" (seção 5 da spec) é sobre enxergar
// o ADVERSÁRIO sem o mesmo atraso que um humano teria, não sobre saber
// onde o próprio time está, que qualquer jogador de verdade também sabe.
function computeTeamRole(world: GameState, playerId: PlayerId): { isPrimaryResponder: boolean; rank: number } {
  const teammateIds = world.roster[teamOf(playerId)];
  const byDistance = teammateIds
    .map((id) => ({ id, dist: length(sub(world.ball.pos, world.players[id]!.pos)) }))
    .sort((a, b) => a.dist - b.dist);
  const rank = byDistance.findIndex((entry) => entry.id === playerId);
  return { isPrimaryResponder: rank === 0, rank };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Duas formações nomeadas pros companheiros que NÃO são o respondente da
// vez (ver computeTeamRole) — cada uma dá um papel DIFERENTE por posição
// (rank 1 = mais central/de cobertura, rank 2 = quem varia mais entre
// defender e apoiar), em vez da faixa genérica de antes onde todo mundo
// fazia a mesma coisa só que numa altura diferente (por isso pareciam
// "perdidos" mesmo já acompanhando o andamento da jogada). `xFrac` é
// fração do campo (0 = própria linha de fundo, 1 = linha de fundo
// adversária) do ponto de vista de quem ataca pra x crescente — ver
// holdingPosition pra o espelhamento por lado.
//
// "Linha defensiva": os dois ficam baixos e centrais, cobrindo a boca do
// gol quando o time está se defendendo.
type FormationSlot = { xFrac: number; yFrac: number };

const DEFENSIVE_FORMATION: FormationSlot[] = [
  { xFrac: 0.16, yFrac: 0.42 },
  { xFrac: 0.16, yFrac: 0.62 },
];

// "Apoio ofensivo": um fica central e avançado (opção de passe/sobra perto
// do ataque), o outro abre mais pro lado e sobe menos — dá pra "triangular"
// em vez de todo mundo ir pro mesmo ponto. Nunca avança até a área de
// verdade (fica bem aquém dos 2/3 do campo onde evaluateFsm libera o
// estado 'attack') — isso continua sendo só trabalho do respondente.
const ATTACKING_FORMATION: FormationSlot[] = [
  { xFrac: 0.5, yFrac: 0.5 },
  { xFrac: 0.4, yFrac: 0.22 },
];

// Interpola suavemente entre as duas formações conforme o andamento da
// jogada (attackProgress 0=defendendo, 1=atacando) — troca gradual, sem
// "teleporte" quando a bola cruza um limiar. `rank` 1, 2, ... vira slot 0,
// 1 (se algum dia tiver time maior que os 2 slots definidos, repete o
// padrão em vez de estourar índice).
function holdingPosition(mySide: 'left' | 'right', rank: number, ballPos: Vec2): Vec2 {
  const attackProgress =
    mySide === 'left' ? clamp(ballPos.x / (FIELD.WIDTH / 2), 0, 1) : clamp((FIELD.WIDTH - ballPos.x) / (FIELD.WIDTH / 2), 0, 1);

  const slotIndex = (rank - 1) % DEFENSIVE_FORMATION.length;
  const defensiveSlot = DEFENSIVE_FORMATION[slotIndex]!;
  const attackingSlot = ATTACKING_FORMATION[slotIndex]!;

  const xFrac = lerp(defensiveSlot.xFrac, attackingSlot.xFrac, attackProgress);
  const yFrac = lerp(defensiveSlot.yFrac, attackingSlot.yFrac, attackProgress);

  const depthX = mySide === 'left' ? FIELD.WIDTH * xFrac : FIELD.WIDTH * (1 - xFrac);
  const laneY = FIELD.HEIGHT * yFrac;
  // Ainda acompanha um pouco o Y de verdade da bola (fica "de olho" na
  // jogada), sem abandonar de vez o slot da formação.
  return { x: depthX, y: laneY * 0.7 + ballPos.y * 0.3 };
}

export function decideCommand(
  world: GameState,
  aiState: AiState,
  profile: AiProfile,
  playerId: PlayerId,
  dt: number,
): { command: Command; aiState: AiState } {
  const self = world.players[playerId]!; // playerId sempre vem do roster da partida
  const mySide: 'left' | 'right' = teamOf(playerId) === 'teamA' ? 'left' : 'right';
  const nowMs = world.tick * dt * 1000;

  const opponent = findNearestOpponent(world, self);

  const snapshot: AiSnapshot = {
    tMs: nowMs,
    ball: { pos: world.ball.pos, vel: world.ball.vel },
    self: { pos: self.pos, vel: self.vel, facing: self.facing },
    opponent: { pos: opponent.pos, vel: opponent.vel },
    score: world.score,
    timeLeftMs: world.timeLeftMs,
  };
  const history = pushSnapshot(aiState.history, snapshot);

  if (world.phase !== 'playing') {
    const fsmState: AiFsmState = world.phase === 'goal' ? 'celebrate' : 'kickoff';
    return {
      command: { tick: world.tick, ...NO_COMMAND },
      aiState: { ...aiState, history, fsmState, kicking: null },
    };
  }

  let { fsmState, targetPoint, msSinceEval, idleTimer, kicking, rngState } = aiState;
  msSinceEval += dt * 1000;

  if (msSinceEval >= EVAL_INTERVAL_MS && self.stunTimer <= 0) {
    msSinceEval = 0;
    const perceived = getDelayedSnapshot(history, profile.reactionMs, nowMs) ?? snapshot;

    // Time de 1 (1v1 offline/online) sempre cai aqui como respondente único
    // — comportamento idêntico ao de sempre, essa regra só muda alguma
    // coisa quando há companheiro de verdade (2v2/3v3).
    const role = computeTeamRole(world, playerId);
    const ballIsRightHere = length(sub(world.ball.pos, self.pos)) <= PHYS.KICK_RANGE * 1.5;
    const decision =
      role.isPrimaryResponder || ballIsRightHere
        ? evaluateFsm(perceived, mySide, profile, rngState)
        : {
            fsmState: 'defend' as AiFsmState,
            targetPoint: holdingPosition(mySide, role.rank, perceived.ball.pos),
            wantsToShoot: false,
            shootPower: 0,
            rngState,
          };
    fsmState = decision.fsmState;
    targetPoint = decision.targetPoint;
    rngState = decision.rngState;

    if (idleTimer <= 0) {
      const idleRoll = nextRandom(rngState);
      rngState = idleRoll.nextState;
      if (idleRoll.value < profile.idleChance) {
        const durationRoll = nextRange(rngState, IDLE_MIN_S, IDLE_MAX_S);
        rngState = durationRoll.nextState;
        idleTimer = durationRoll.value;
      }
    }

    if (!kicking) {
      const kickPlan = planKick(decision.wantsToShoot, decision.shootPower, fsmState, world.ball.pos, opponent.pos, mySide, profile, rngState);
      kicking = kickPlan.plan;
      rngState = kickPlan.rngState;
    }
  }

  idleTimer = Math.max(0, idleTimer - dt);

  const baseAiState = { ...aiState, history, fsmState, targetPoint, msSinceEval, idleTimer, rngState };

  if (idleTimer > 0 || self.stunTimer > 0) {
    return { command: { tick: world.tick, ...NO_COMMAND }, aiState: { ...baseAiState, kicking } };
  }

  // Chute em andamento: alinha o facing na direção da mira (movendo um
  // pouco nela) e segura até bater a carga alvo, aí solta.
  if (kicking) {
    const ballInRange =
      length(sub(world.ball.pos, self.pos)) <= PHYS.KICK_RANGE &&
      Math.abs(angleBetween(sub(world.ball.pos, self.pos), kicking.aimDir)) < Math.PI / 2;

    if (!ballInRange) {
      return {
        command: { tick: world.tick, ...NO_COMMAND },
        aiState: { ...baseAiState, kicking: null },
      };
    }

    const holdSecondsElapsed = kicking.holdSecondsElapsed + dt;
    const releasing = holdSecondsElapsed >= kicking.holdSecondsTarget;

    return {
      command: { tick: world.tick, move: scale(kicking.aimDir, 0.15), kickHeld: !releasing, dash: false, boost: false },
      aiState: { ...baseAiState, kicking: releasing ? null : { ...kicking, holdSecondsElapsed } },
    };
  }

  // Movimento normal em direção ao alvo decidido pela FSM.
  const toTarget = sub(targetPoint, self.pos);
  const move = length(toTarget) > 4 ? scale(normalize(toTarget), profile.speedFactor) : { x: 0, y: 0 };

  let dash = false;
  if (self.dashCooldown <= 0 && (fsmState === 'recover' || fsmState === 'intercept') && length(toTarget) > PHYS.PLAYER_RADIUS * 3) {
    const dashRoll = nextRandom(rngState);
    rngState = dashRoll.nextState;
    dash = dashRoll.value < profile.dashUsage;
  }

  // Turbo: perseguindo algo de verdade (não em micro-ajustes de
  // posicionamento) e com combustível de sobra — decidido junto do dash,
  // mas é uma rolagem independente (pode usar os dois, ou nenhum).
  let boost = false;
  if (self.boostStamina > 0.2 && length(toTarget) > PHYS.PLAYER_RADIUS * 3) {
    const boostRoll = nextRandom(rngState);
    rngState = boostRoll.nextState;
    boost = boostRoll.value < profile.boostUsage;
  }

  return {
    command: { tick: world.tick, move, kickHeld: false, dash, boost },
    aiState: { ...baseAiState, rngState },
  };
}

function angleBetween(a: Vec2, b: Vec2): number {
  const angleA = Math.atan2(a.y, a.x);
  const angleB = Math.atan2(b.y, b.x);
  let diff = angleA - angleB;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}
