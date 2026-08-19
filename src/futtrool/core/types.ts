// Tipos da simulação. Só números e primitivos — nada de classes com método
// nem referências circulares, porque GameState precisa ser serializável
// (decisão 3 da seção 13 da spec: pré-requisito pro multiplayer da entrega 2).

export type Vec2 = { x: number; y: number };

// Times de tamanho fixo por partida (1 jogador em cada = 1v1, 2 = 2v2 — ver
// GameState.roster) — teamA sempre defende o lado esquerdo do campo, teamB
// o direito (mesma convenção do antigo p1/p2, generalizada pra N jogadores
// por lado; 3v3 é só aumentar o roster, sem mexer em mais nada aqui).
export type TeamId = 'teamA' | 'teamB';
export type PlayerId = `${TeamId}-${number}`;

export function teamOf(playerId: PlayerId): TeamId {
  return playerId.startsWith('teamA') ? 'teamA' : 'teamB';
}

export type Player = {
  id: PlayerId;
  teamId: TeamId;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  facing: number; // radianos
  kickCharge: number; // 0..1
  kickCooldown: number; // segundos restantes
  dashCooldown: number; // segundos restantes
  stunTimer: number; // segundos restantes após levar dash
  // Dois campos além do esboço da seção 3.2 da spec, necessários pra
  // step() continuar uma função pura sem estado externo escondido:
  dashTimer: number; // segundos restantes do impulso ativo do dash (spec 3.4: DASH_DURATION) — enquanto > 0, ignora o clamp de PLAYER_MAX_SPEED, deixando o arrasto dissipar o burst naturalmente
  kickHeldPrev: boolean; // valor de kickHeld no tick anterior, pra detectar a borda de soltar o botão (carrega -> chuta) sem precisar comparar Commands entre ticks
  boostStamina: number; // 0..1 — combustível do turbo (segurar o botão de boost pra correr mais rápido); drena enquanto usa, recarrega sozinho quando não usa (ver PHYS.BOOST_*)
};

export type Ball = {
  pos: Vec2;
  vel: Vec2;
  radius: number;
  lastTouchedBy: PlayerId | null;
  // Além do esboço da seção 3.2: segundos acumulados com velocidade abaixo
  // de STALL.SPEED_THRESHOLD e nenhum jogador por perto — usado pelo
  // anti-degenerescência da seção 3.6 (rules.ts), zera quando a bola volta
  // a se mover ou alguém chega perto.
  stallTimer: number;
};

export type MatchPhase = 'kickoff' | 'playing' | 'goal' | 'ended';

export type MatchResult = TeamId | 'draw';

export type GameState = {
  tick: number;
  phase: MatchPhase;
  // ms restantes na fase atual: contagem do kickoff (spec 4) ou soma de
  // congelamento+replay pós-gol — não existe no esboço da seção 3.2, mas é
  // necessário pra step() fazer a transição de fase sem estado escondido.
  phaseTimer: number;
  timeLeftMs: number;
  // true durante a prorrogação de morte súbita (seção 4) — timeLeftMs nesse
  // modo conta os 60s de OVERTIME_MS, e qualquer gol encerra a partida.
  overtime: boolean;
  result: MatchResult | null;
  score: Record<TeamId, number>;
  // Quem joga em cada time nessa partida (1 elemento por time = 1v1, 2 =
  // 2v2) — precisa estar no próprio estado (não só derivável de
  // `players`) porque a formação de kickoff (rules.ts) precisa saber quem
  // reposicionar sem depender de ordem de iteração de objeto.
  roster: Record<TeamId, PlayerId[]>;
  players: Record<PlayerId, Player>;
  ball: Ball;
  rngState: number;
};

// Eventos que step() reporta a cada tick, pra UI/áudio/replay (M5+) reagirem
// sem precisar comparar dois GameState pra descobrir o que aconteceu. Não
// fazem parte do estado persistido — são efêmeros, devolvidos ao lado dele.
export type MatchEvent =
  | { type: 'goal'; scorer: TeamId }
  | { type: 'kickoffStarted' }
  | { type: 'kickoffEnded' }
  | { type: 'overtimeStarted' }
  | { type: 'matchEnded'; result: MatchResult }
  // Eventos de M5 (FX/áudio) — `pos`/`dir` em unidades de mundo, não pixels.
  | { type: 'kick'; playerId: PlayerId; pos: Vec2; dir: Vec2; charge: number }
  | { type: 'dash'; playerId: PlayerId }
  | { type: 'ballWallBounce' }
  | { type: 'playerCollision' };

// Único input aceito pela simulação (decisão 2 da seção 13): o jogador local
// e a IA nunca movem entidades diretamente, só produzem um Command.
export type Command = {
  tick: number;
  move: Vec2; // vetor normalizado, magnitude 0..1
  kickHeld: boolean; // segurar carrega, soltar chuta
  dash: boolean;
  boost: boolean; // segurar pra correr mais rápido enquanto durar o combustível (boostStamina)
};
