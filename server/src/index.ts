// Servidor autoritativo do multiplayer do FutTrool (1v1 e 2v2) — reaproveita
// a mesma simulação determinística do cliente (core/simulation.ts) e a
// mesma IA (core/ai/brain.ts) que já roda contra o jogador offline, sem
// duplicar física/regras/comportamento. Cada partida roda a
// FIXED_TIMESTEP_S (60Hz, igual ao cliente) num setInterval próprio; o
// estado resultante é o único que vale (o cliente em modo online não
// simula localmente — só desenha o último GameState recebido). Fora do
// escopo desta entrega, de propósito: previsão no cliente, reconexão
// automática (o heartbeat só ENCERRA a partida direito quando a conexão
// morre — não tenta retomar), fila de pareamento persistente, validação
// anti-trapaça da física, e IA com coordenação de time (cada bot mira só o
// adversário mais próximo, sem noção de "companheiro").

import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { step } from '../../src/futtrool/core/simulation';
import { createMatchState } from '../../src/futtrool/core/rules';
import { createAiState, decideCommand, type AiState } from '../../src/futtrool/core/ai/brain';
import { AI_PROFILES } from '../../src/futtrool/core/ai/profiles';
import { AVATAR_COLOR_PALETTE, DEFAULT_AVATAR_COLOR, FIXED_TIMESTEP_S, MATCH, MATCH_SETTINGS_OPTIONS } from '../../src/futtrool/core/constants';
import type { AvatarColor, AvatarColorMode, Command, GameState, MatchResult, MatchSettings, PlayerId, TeamId } from '../../src/futtrool/core/types';
import type {
  AdminPlayerSnapshot,
  AdminRoomSnapshot,
  ClientMessage,
  ServerMessage,
  TournamentMatchInfo,
  TournamentRound,
  TournamentSnapshot,
  TournamentTeamFormationSnapshot,
  TournamentTeamInfo,
} from '../../src/futtrool/net/protocol';
import { ADMIN_EMAIL } from './adminConfig';

// Cliente Supabase do PRÓPRIO servidor (não confundir com o do navegador,
// em src/auth/supabaseClient.ts) — só a anon key, igual ao cliente; usado
// pra (a) verificar o authToken que o jogador manda ao entrar numa
// partida (supabase.auth.getUser() só CONFIRMA que o token é válido e
// devolve o email associado, não precisa de privilégio nenhum além da
// anon key pra isso) e (b) ler a lista pública de banidos
// (public.admin_bans, RLS de leitura liberada pra todo mundo de
// propósito, ver a migration). Sem service_role key aqui — de propósito,
// pra não introduzir um segredo capaz de ignorar RLS só pra isso.
const supabase: SupabaseClient | null =
  process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
    : null;

// Verifica um access_token de sessão Supabase e devolve o email de quem é
// dono dele — `null` se não tiver token, o token for inválido/expirado, ou
// o Supabase não estiver configurado nesse ambiente (dev local sem
// SUPABASE_URL/SUPABASE_ANON_KEY: multiplayer continua funcionando, só sem
// identificar ninguém, igual sempre foi antes dessa mudança).
async function verifyEmail(token: string | undefined): Promise<string | null> {
  if (!token || !supabase) return null;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user?.email) return null;
    return data.user.email;
  } catch {
    return null;
  }
}

// Cache local da lista de banidos (public.admin_bans) — consultar o banco
// a cada quickMatch/createRoom/joinRoom seria um round-trip a mais por
// jogador só pra isso; em vez disso, atualiza a cada 30s. Uma pessoa recém
// banida pode demorar até 30s pra ser recusada — aceitável (não é
// anti-cheat em tempo real, é moderação).
let bannedEmails = new Set<string>();
async function refreshBannedEmails(): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.from('admin_bans').select('email');
  if (error || !data) return;
  bannedEmails = new Set((data as { email: string }[]).map((row) => row.email.toLowerCase()));
}
void refreshBannedEmails();
setInterval(() => void refreshBannedEmails(), 30_000);

const PORT = Number(process.env.PORT ?? 8787);
const MAX_TEAM_SIZE = 3; // 1v1, 2v2 e 3v3 — pra ir além é só subir esse número de novo

// Mobile derruba conexão sem avisar (troca de wifi/4G, tela bloqueando) —
// sem isso o servidor keeps reaplicando o ÚLTIMO comando válido pra sempre
// (o bug do "trava indo pra um lado só"). Ping a cada 15s; quem não
// respondeu ATÉ o ping seguinte (ou seja, ficou ~15-30s mudo) é considerado
// morto e derrubado — o que já aciona a limpeza normal de desconexão.
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS ?? 15000);
const ROOM_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem O/0, I/1, L (ambíguos ao ditar/digitar)
const ROOM_CODE_LENGTH = 6;
const MAX_NAME_LENGTH = 20;

function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Jogador';
  const trimmed = raw.trim().slice(0, MAX_NAME_LENGTH);
  return trimmed.length > 0 ? trimmed : 'Jogador';
}

const DEFAULT_MATCH_SETTINGS: MatchSettings = { durationMs: MATCH.DURATION_MS, goalsToWin: MATCH.GOALS_TO_WIN };

// Só aceita valores que batem com as opções oficiais (ver
// core/constants.ts MATCH_SETTINGS_OPTIONS) — cai no padrão pra qualquer
// coisa fora disso (cliente com bug, ou mensagem forjada).
function sanitizeMatchSettings(raw: unknown): MatchSettings {
  const value = raw as Partial<MatchSettings> | undefined;
  const durationMs = MATCH_SETTINGS_OPTIONS.durationsMs.includes(value?.durationMs as number)
    ? (value!.durationMs as number)
    : DEFAULT_MATCH_SETTINGS.durationMs;
  const goalsToWin = MATCH_SETTINGS_OPTIONS.goalLimits.includes(value?.goalsToWin as number)
    ? (value!.goalsToWin as number)
    : DEFAULT_MATCH_SETTINGS.goalsToWin;
  return { durationMs, goalsToWin };
}

const AVATAR_COLOR_MODE_COUNT: Record<AvatarColorMode, number> = { solid: 1, duo: 2, gradient: 2 };

// Mesma validação do lado do cliente (progression/avatarColor.ts) —
// repetida aqui porque o servidor nunca confia no que o cliente manda: só
// aceita cor da paleta oficial, com a quantidade certa pro modo escolhido.
function sanitizeAvatarColor(raw: unknown): AvatarColor {
  const value = raw as Partial<AvatarColor> | undefined;
  const mode: AvatarColorMode =
    value?.mode === 'solid' || value?.mode === 'duo' || value?.mode === 'gradient' ? value.mode : DEFAULT_AVATAR_COLOR.mode;
  const needed = AVATAR_COLOR_MODE_COUNT[mode];
  const valid = Array.isArray(value?.colors) ? value.colors.filter((c): c is string => AVATAR_COLOR_PALETTE.includes(c)) : [];
  const colors = Array.from({ length: needed }, (_, i) => valid[i] ?? AVATAR_COLOR_PALETTE[i % AVATAR_COLOR_PALETTE.length]!); // módulo garante índice válido
  return { mode, colors };
}

const NEUTRAL_COMMAND: Command = { tick: 0, move: { x: 0, y: 0 }, kickHeld: false, dash: false, boost: false };
// Dificuldade dos bots que preenchem time incompleto (ver Lobby.start) —
// sem seletor pra isso hoje, "Profissional" é um meio-termo razoável.
const BOT_PROFILE = AI_PROFILES.profissional;

function isValidCommand(value: unknown): value is Command {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  const move = c.move as Record<string, unknown> | undefined;
  return (
    typeof c.tick === 'number' &&
    !!move &&
    typeof move.x === 'number' &&
    typeof move.y === 'number' &&
    typeof c.kickHeld === 'boolean' &&
    typeof c.dash === 'boolean' &&
    typeof c.boost === 'boolean'
  );
}

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(message));
}

function slotToPlayerId(teamSize: number, slot: number): PlayerId {
  return slot < teamSize ? `teamA-${slot}` : `teamB-${slot - teamSize}`;
}

function buildRoster(teamSize: number): Record<TeamId, PlayerId[]> {
  const teamA: PlayerId[] = [];
  const teamB: PlayerId[] = [];
  for (let i = 0; i < teamSize; i++) {
    teamA.push(`teamA-${i}`);
    teamB.push(`teamB-${i}`);
  }
  return { teamA, teamB };
}

// Motivo do fim de uma Room — precisa disso (em vez de só chamar
// onEnded() sem argumento nenhum, como era antes) porque o campeonato
// (ver seção mais abaixo) precisa saber EXATAMENTE por que a partida
// acabou pra decidir quem avança: vitória de verdade em campo, alguém
// desconectando no meio (W.O. pro outro lado), ou o servidor caindo
// (nesse caso não decide nada — o torneio inteiro se perde mesmo, é um
// processo em memória, sem retomada entre reinícios, limitação conhecida).
type RoomEndInfo =
  | { reason: 'completed'; result: MatchResult; score: Record<TeamId, number> }
  | { reason: 'disconnect'; disconnectedPlayerId: PlayerId }
  | { reason: 'shutdown' };

// ---------------------------------------------------------------------------
// Room: uma partida em andamento — humanos mandam Command via WebSocket,
// slots sem humano (sala que começou incompleta, ver Lobby.start) são
// controlados por um bot local, tudo dentro do MESMO tick determinístico.
// ---------------------------------------------------------------------------

class Room {
  readonly id: string;
  private state: GameState;
  private readonly commands: Record<PlayerId, Command>;
  private readonly timer: ReturnType<typeof setInterval>;
  private readonly humanSockets: Partial<Record<PlayerId, WebSocket>>;
  private readonly names: Record<PlayerId, string>;
  private readonly emails: Record<PlayerId, string | null>;
  private readonly teamSize: number;
  private readonly botStates = new Map<PlayerId, AiState>();
  // Conexões do admin assistindo essa partida em modo espectador (ver
  // 'spectate' no protocolo) — recebem os mesmos 'state' que os jogadores
  // de verdade, nunca mandam 'command' nenhum (o servidor simplesmente não
  // ouve 'message' delas pra esse fim, ver wss.on('connection') abaixo).
  private readonly spectators = new Set<WebSocket>();
  // Handler de 'close' de cada jogador humano — guardado pra dar
  // ws.off(...) só NESSE listener quando a Room acaba sem fechar o socket
  // (partida de campeonato, ver `closeSocketsOnEnd`). Sem isso, o listener
  // antigo continuava pendurado no socket pra sempre e disparava de novo
  // (chamando stop() uma SEGUNDA vez, processando o fim da partida em
  // duplicata) numa desconexão bem mais tarde, já noutra rodada.
  private readonly closeListeners = new Map<WebSocket, () => void>();
  private readonly closeSocketsOnEnd: boolean;
  private readonly onEnded: (info: RoomEndInfo) => void;
  private ended = false;

  constructor(
    id: string,
    roster: Record<TeamId, PlayerId[]>,
    humanSockets: Partial<Record<PlayerId, WebSocket>>,
    names: Record<PlayerId, string>,
    colors: Record<PlayerId, AvatarColor>,
    emails: Record<PlayerId, string | null>,
    matchSettings: MatchSettings,
    closeSocketsOnEnd: boolean,
    onEnded: (info: RoomEndInfo) => void,
  ) {
    this.id = id;
    this.humanSockets = humanSockets;
    this.names = names;
    this.emails = emails;
    this.teamSize = roster.teamA.length;
    this.closeSocketsOnEnd = closeSocketsOnEnd;
    this.onEnded = onEnded;
    this.state = createMatchState(Date.now(), MATCH.KICKOFF_COUNTDOWN_MS, roster, matchSettings);

    const allIds = [...roster.teamA, ...roster.teamB];
    this.commands = {} as Record<PlayerId, Command>;

    allIds.forEach((id, index) => {
      this.commands[id] = NEUTRAL_COMMAND;
      const ws = humanSockets[id];
      if (ws) {
        send(ws, { type: 'assigned', playerId: id, names, colors, voiceRoomId: `futtrool-${this.id}` });
        // Substitui o listener de 'message' que o pareamento usava (join
        // request) — a partir daqui só interessa 'command'.
        ws.removeAllListeners('message');
        ws.on('message', (raw) => this.handleMessage(id, raw.toString()));
        const onClose = () => this.handleDisconnect(id);
        this.closeListeners.set(ws, onClose);
        ws.on('close', onClose);
      } else {
        this.botStates.set(id, createAiState(Date.now() + index * 7919)); // seeds diferentes por bot
      }
    });

    this.timer = setInterval(() => this.tick(), FIXED_TIMESTEP_S * 1000);
  }

  private handleMessage(playerId: PlayerId, raw: string): void {
    let parsed: ClientMessage;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (parsed.type !== 'command' || !isValidCommand(parsed.command)) return;
    this.commands[playerId] = parsed.command;
  }

  private handleDisconnect(playerId: PlayerId): void {
    for (const [id, ws] of Object.entries(this.humanSockets) as [PlayerId, WebSocket][]) {
      if (id !== playerId) send(ws, { type: 'opponentLeft' });
    }
    this.stop({ reason: 'disconnect', disconnectedPlayerId: playerId });
  }

  private tick(): void {
    for (const [id, aiState] of this.botStates) {
      const decision = decideCommand(this.state, aiState, BOT_PROFILE, id, FIXED_TIMESTEP_S);
      this.botStates.set(id, decision.aiState);
      this.commands[id] = decision.command;
    }

    const result = step(this.state, this.commands, FIXED_TIMESTEP_S);
    this.state = result.state;

    const message: ServerMessage = { type: 'state', state: this.state, events: result.events };
    for (const ws of this.allHumanSockets()) send(ws, message);
    for (const ws of this.spectators) send(ws, message);

    if (this.state.phase === 'ended') {
      this.stop({ reason: 'completed', result: this.state.result!, score: this.state.score });
    }
  }

  private allHumanSockets(): WebSocket[] {
    return Object.values(this.humanSockets).filter((ws): ws is WebSocket => ws !== undefined);
  }

  // Retrato pro painel "Ao vivo" do admin (ver protocol.ts
  // AdminRoomSnapshot) — só humanos (bot não tem WebSocket, então nem
  // entra em humanSockets pra começo de conversa).
  getSnapshot(): AdminRoomSnapshot {
    const players: AdminPlayerSnapshot[] = (Object.entries(this.humanSockets) as [PlayerId, WebSocket | undefined][])
      .filter((entry): entry is [PlayerId, WebSocket] => entry[1] !== undefined)
      .map(([id]) => ({ playerId: id, name: this.names[id] ?? id, email: this.emails[id] ?? null }));
    return { status: 'playing', teamSize: this.teamSize, code: null, roomId: this.id, players };
  }

  addSpectator(ws: WebSocket): void {
    this.spectators.add(ws);
    send(ws, { type: 'spectateStarted', roomId: this.id, players: this.getSnapshot().players });
    send(ws, { type: 'state', state: this.state, events: [] });
  }

  removeSpectator(ws: WebSocket): void {
    this.spectators.delete(ws);
  }

  stop(info: RoomEndInfo): void {
    if (this.ended) return; // idempotente por segurança extra, além da remoção de listener abaixo
    this.ended = true;

    clearInterval(this.timer);
    for (const [ws, onClose] of this.closeListeners) ws.off('close', onClose);
    this.closeListeners.clear();

    if (this.closeSocketsOnEnd) {
      for (const ws of this.allHumanSockets()) {
        if (ws.readyState === WebSocket.OPEN) ws.close();
      }
    }
    for (const ws of this.spectators) send(ws, { type: 'spectateEnded' });
    this.spectators.clear();
    this.onEnded(info);
  }
}

// ---------------------------------------------------------------------------
// Lobby: sala esperando gente antes da partida começar — tanto fila
// aleatória (quickMatch) quanto sala privada (createRoom/joinRoom) usam a
// mesma estrutura, só muda como alguém chega até ela. Preenche teamA
// primeiro (então convidar um amigo pelo mesmo link bota os dois no mesmo
// time, contra bots, se mais ninguém entrar) — vira uma Room assim que
// enche, ou antes disso se alguém mandar 'startNow' (slots vazios ficam com
// bot).
// ---------------------------------------------------------------------------

type LobbyEntry = { ws: WebSocket; name: string; avatarColor: AvatarColor; email: string | null };

type Lobby = {
  teamSize: number;
  code: string | null; // null = fila pública (quickMatch)
  entries: LobbyEntry[]; // ordem de entrada = ordem de slot
  matchSettings: MatchSettings; // escolha de quem criou a sala/entrou na fila primeiro
};

const publicLobbies = new Map<number, Lobby>(); // teamSize -> lobby aberto agora
const privateLobbies = new Map<string, Lobby>();
const socketLobby = new Map<WebSocket, Lobby>();
const rooms = new Map<string, Room>(); // roomId -> Room (ver 'spectate' no protocolo)

function lobbyCapacity(lobby: Lobby): number {
  return lobby.teamSize * 2;
}

function broadcastLobbyUpdate(lobby: Lobby): void {
  const filled: Record<TeamId, number> = { teamA: 0, teamB: 0 };
  lobby.entries.forEach((_, i) => {
    const id = slotToPlayerId(lobby.teamSize, i);
    filled[id.startsWith('teamA') ? 'teamA' : 'teamB']++;
  });
  const message: ServerMessage = { type: 'lobbyUpdate', teamSize: lobby.teamSize, filled, capacity: lobbyCapacity(lobby) };
  for (const { ws } of lobby.entries) send(ws, message);
}

function removeLobbyFromPools(lobby: Lobby): void {
  if (lobby.code) privateLobbies.delete(lobby.code);
  else if (publicLobbies.get(lobby.teamSize) === lobby) publicLobbies.delete(lobby.teamSize);
}

function startLobby(lobby: Lobby): void {
  removeLobbyFromPools(lobby);
  for (const { ws } of lobby.entries) socketLobby.delete(ws);

  const roster = buildRoster(lobby.teamSize);
  const humanSockets: Partial<Record<PlayerId, WebSocket>> = {};
  const names = {} as Record<PlayerId, string>;
  const colors = {} as Record<PlayerId, AvatarColor>;
  const emails = {} as Record<PlayerId, string | null>;
  lobby.entries.forEach(({ ws, name, avatarColor, email }, i) => {
    const id = slotToPlayerId(lobby.teamSize, i);
    humanSockets[id] = ws;
    names[id] = name;
    colors[id] = avatarColor;
    emails[id] = email;
  });

  const roomId = randomUUID();
  const room = new Room(roomId, roster, humanSockets, names, colors, emails, lobby.matchSettings, true, () => rooms.delete(roomId));
  rooms.set(roomId, room);
}

function joinLobby(lobby: Lobby, ws: WebSocket, name: string, avatarColor: AvatarColor, email: string | null): void {
  lobby.entries.push({ ws, name, avatarColor, email });
  socketLobby.set(ws, lobby);
  if (lobby.entries.length >= lobbyCapacity(lobby)) {
    startLobby(lobby);
  } else {
    broadcastLobbyUpdate(lobby);
  }
}

function generateRoomCode(): string {
  let code: string;
  do {
    code = Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]).join('');
  } while (privateLobbies.has(code));
  return code;
}

function clampTeamSize(raw: unknown): number {
  const n = typeof raw === 'number' ? Math.floor(raw) : 1;
  return Math.min(MAX_TEAM_SIZE, Math.max(1, n));
}

function removeFromPendingLobby(ws: WebSocket): void {
  const lobby = socketLobby.get(ws);
  if (!lobby) return;
  socketLobby.delete(ws);
  const idx = lobby.entries.findIndex((entry) => entry.ws === ws);
  if (idx !== -1) lobby.entries.splice(idx, 1);
  if (lobby.entries.length === 0) removeLobbyFromPools(lobby);
  else broadcastLobbyUpdate(lobby);
}

// ---------------------------------------------------------------------------
// Painel "Ao vivo" do admin (admin.html): uma conexão WS separada (não é
// partida nenhuma) que passa por 'adminAuth' — só quem verifica pro email
// de ADMIN_EMAIL (ver adminConfig.ts) vira observador e recebe um retrato
// de todas as salas/filas ativas a cada BROADCAST_INTERVAL_MS. Ninguém mais
// tem esse email pra usar, então nem vale a pena o cliente tentar adivinhar
// — o servidor sempre reverifica o token de novo aqui, nunca confia num
// "eu sou admin" que o cliente afirme.
// ---------------------------------------------------------------------------

const adminObservers = new Set<WebSocket>();
const ADMIN_BROADCAST_INTERVAL_MS = 2000;

function lobbySnapshot(lobby: Lobby): AdminRoomSnapshot {
  const players: AdminPlayerSnapshot[] = lobby.entries.map((entry, i) => ({
    playerId: slotToPlayerId(lobby.teamSize, i),
    name: entry.name,
    email: entry.email,
  }));
  return { status: 'waiting', teamSize: lobby.teamSize, code: lobby.code, roomId: null, players };
}

function collectAdminSnapshots(): AdminRoomSnapshot[] {
  const snapshots: AdminRoomSnapshot[] = [];
  for (const lobby of publicLobbies.values()) snapshots.push(lobbySnapshot(lobby));
  for (const lobby of privateLobbies.values()) snapshots.push(lobbySnapshot(lobby));
  for (const room of rooms.values()) snapshots.push(room.getSnapshot());
  return snapshots;
}

// Espectador (admin) -> Room que ele está assistindo agora, se alguma —
// usado só pra limpar direito quando ele troca de sala ou desconecta.
const spectating = new Map<WebSocket, Room>();

function stopSpectating(ws: WebSocket): void {
  spectating.get(ws)?.removeSpectator(ws);
  spectating.delete(ws);
}

setInterval(() => {
  if (adminObservers.size === 0) return;
  const message: ServerMessage = { type: 'adminRooms', rooms: collectAdminSnapshots() };
  for (const ws of adminObservers) send(ws, message);
}, ADMIN_BROADCAST_INTERVAL_MS);

// ---------------------------------------------------------------------------
// Campeonato: torneio de eliminação simples de 8 vagas — quartas (4
// partidas) -> semifinal (2) -> final (1). Cada partida é uma Room comum
// (mesma simulação/física de sempre), só que orquestrada em cadeia: o
// vencedor de cada partida entra automaticamente na próxima rodada, e só
// COMEÇA a jogar quando a vaga do outro lado também estiver decidida
// (pedido explícito: "vencedor avança e espera o outro terminar pra
// continuar"). Quem desconecta no meio de uma partida de torneio dá W.O.
// pro adversário na hora (não vira bot, diferente do quickMatch — não
// faria sentido um bot "carregar" alguém pra frente numa chave
// competitiva); quem desconecta ENQUANTO espera a próxima rodada também
// perde por W.O. assim que a vaga dele seria necessária.
//
// 1v1, 2v2 e 3v3: uma vaga da chave é sempre um GRUPO de pessoas de
// verdade jogando junto (nunca pareamento aleatório tipo quickMatch) — em
// dupla/trio, primeiro se forma o GRUPO por código ('tournamentCreateTeam'/
// 'tournamentJoinTeam', igual ao "Chamar amigo" das partidas normais), e
// só quando o grupo completa `teamSize` gente é que ele vira uma vaga de
// verdade na fila do torneio (registerTeamInTournament). 1v1 pula essa
// etapa (não tem o que "esperar" — uma pessoa já é o grupo inteiro),
// entra direto ('tournamentJoin').
//
// Estado 100% em memória, sem retomada entre reinícios do processo (igual
// qualquer partida em andamento hoje) — public.tournaments (Supabase) é
// só o REGISTRO público pro histórico/bracket, não uma fonte de retomada.
// ---------------------------------------------------------------------------

const TOURNAMENT_SLOTS = 8;
const TOURNAMENT_MATCH_SETTINGS: MatchSettings = { durationMs: MATCH.DURATION_MS, goalsToWin: MATCH.GOALS_TO_WIN };

// Cada torneio ativo pode ter até 4 partidas de quartas rodando ao mesmo
// tempo — mesmo custo de simulação (física 2D simples a 60Hz) que 4
// partidas quickMatch 1v1 comuns já suportam sem problema hoje, sem limite
// nenhum. Limitar quantos TORNEIOS simultâneos o servidor aceita é o que
// protege o resto do que roda nessa mesma VPS (Chatwoot, n8n, Evolution
// API, Supabase self-hosted, Postgres, MinIO, Portainer, Traefik) de um
// pico repentino de gente entrando em campeonato ao mesmo tempo — 4
// torneios ativos ao mesmo tempo = até 16 partidas de quartas simultâneas
// na pior hipótese (fora o tráfego normal de quickMatch/createRoom por
// cima disso), margem generosa mas ainda contida. Fácil subir esse número
// depois se o servidor aguentar mais sem sentir.
const MAX_CONCURRENT_TOURNAMENTS = 4;

type TournamentTeam = {
  slot: number;
  sockets: WebSocket[]; // teamSize itens, na ordem de entrada
  names: string[];
  emails: (string | null)[];
  avatarColors: AvatarColor[];
};

type TournamentMatch = {
  round: TournamentRound;
  index: number;
  teamSlotA: number | null;
  teamSlotB: number | null;
  winnerTeamSlot: number | null;
  scoreA: number;
  scoreB: number;
  status: 'pending' | 'playing' | 'completed';
  forfeitedTeamSlot: number | null;
  room: Room | null;
};

type Tournament = {
  id: string;
  teamSize: number;
  status: 'waiting' | 'active' | 'completed';
  teams: TournamentTeam[];
  matches: TournamentMatch[];
  championSlot: number | null;
};

// Um único membro (ainda não formando um TournamentTeam de verdade) —
// usado só enquanto um GRUPO de dupla/trio está se formando via código
// (ver 'tournamentCreateTeam'/'tournamentJoinTeam'), antes de virar uma
// vaga de verdade na fila do campeonato.
type PendingTeamMember = { ws: WebSocket; name: string; email: string | null; avatarColor: AvatarColor };

type PendingTournamentTeam = {
  code: string;
  teamSize: number;
  members: PendingTeamMember[];
};

const openTournaments = new Map<number, Tournament>(); // teamSize -> torneio ainda esperando gente
const allTournaments = new Map<string, Tournament>();
const tournamentSpectators = new Map<string, Set<WebSocket>>();
// vaga de torneio de cada socket ENQUANTO ainda espera vaga (status
// 'waiting') — depois que a chave começa pra valer, quem sabe a vaga de
// cada um é a própria Room (igual quickMatch). Todo mundo de uma MESMA
// vaga (dupla/trio) aponta pro mesmo {tournamentId, slot}.
const socketTournamentQueueSlot = new Map<WebSocket, { tournamentId: string; slot: number }>();
// Grupo (dupla/trio) ainda se formando por código, antes de virar vaga —
// ver PendingTournamentTeam acima.
const pendingTournamentTeams = new Map<string, PendingTournamentTeam>();
const socketPendingTeamCode = new Map<WebSocket, string>();
// Handler de 'close' de quem já GANHOU a rodada e está esperando a outra
// partida da mesma chave terminar — precisa disso separado do
// socketTournamentQueueSlot de cima (que é só pra fase de fila).
const tournamentWaitCloseHandlers = new Map<WebSocket, () => void>();

function activeTournamentCount(): number {
  let count = 0;
  for (const t of allTournaments.values()) {
    if (t.status !== 'completed') count++;
  }
  return count;
}

// Pra onde o vencedor de uma partida vai — QF0+QF1 alimentam SF0, QF2+QF3
// alimentam SF1, SF0+SF1 alimentam a final; final não alimenta nada (é o
// fim da chave).
function feedsInto(round: TournamentRound, index: number): { round: TournamentRound; index: number; side: 'A' | 'B' } | null {
  if (round === 'quarterfinal') return { round: 'semifinal', index: Math.floor(index / 2), side: index % 2 === 0 ? 'A' : 'B' };
  if (round === 'semifinal') return { round: 'final', index: 0, side: index % 2 === 0 ? 'A' : 'B' };
  return null;
}

function buildEmptyMatches(): TournamentMatch[] {
  const matches: TournamentMatch[] = [];
  const push = (round: TournamentRound, index: number): void => {
    matches.push({
      round,
      index,
      teamSlotA: null,
      teamSlotB: null,
      winnerTeamSlot: null,
      scoreA: 0,
      scoreB: 0,
      status: 'pending',
      forfeitedTeamSlot: null,
      room: null,
    });
  };
  for (let i = 0; i < 4; i++) push('quarterfinal', i);
  for (let i = 0; i < 2; i++) push('semifinal', i);
  push('final', 0);
  return matches;
}

function findMatch(t: Tournament, round: TournamentRound, index: number): TournamentMatch {
  // buildEmptyMatches() sempre cria as 7 combinações válidas de
  // round/index — chamar isso com uma combinação que não existe é erro de
  // programação, não entrada de usuário (nunca vem direto do cliente).
  return t.matches.find((m) => m.round === round && m.index === index)!;
}

function toSnapshot(t: Tournament): TournamentSnapshot {
  const teams: TournamentTeamInfo[] = t.teams.map((team) => ({
    slot: team.slot,
    names: team.names,
    emails: team.emails,
    connected: team.sockets.every((ws) => ws.readyState === WebSocket.OPEN),
  }));
  const matches: TournamentMatchInfo[] = t.matches.map((m) => ({
    round: m.round,
    index: m.index,
    teamSlotA: m.teamSlotA,
    teamSlotB: m.teamSlotB,
    winnerTeamSlot: m.winnerTeamSlot,
    scoreA: m.scoreA,
    scoreB: m.scoreB,
    status: m.status,
    forfeitedTeamSlot: m.forfeitedTeamSlot,
  }));
  return { id: t.id, teamSize: t.teamSize, status: t.status, teams, matches, championSlot: t.championSlot };
}

// Registro público (histórico/bracket) — nunca a fonte de verdade de quem
// ganhou (isso é sempre a Room, em memória). Falha em silêncio (Supabase
// fora do ar não pode derrubar o torneio de verdade).
async function persistTournament(t: Tournament): Promise<void> {
  if (!supabase) return;
  const snapshot = toSnapshot(t);
  const championName = t.championSlot !== null ? (t.teams[t.championSlot]?.names.join(' & ') ?? null) : null;
  try {
    await supabase.from('tournaments').upsert({
      id: t.id,
      team_size: t.teamSize,
      status: t.status,
      teams: snapshot.teams,
      matches: snapshot.matches,
      champion_name: championName,
      updated_at: new Date().toISOString(),
    });
  } catch {
    // idem — só o registro público, nunca trava o torneio de verdade.
  }
}

function broadcastTournament(t: Tournament): void {
  const snapshot = toSnapshot(t);
  for (const team of t.teams) {
    for (const ws of team.sockets) send(ws, { type: 'tournament', tournament: snapshot, yourSlot: team.slot });
  }
  for (const ws of tournamentSpectators.get(t.id) ?? []) send(ws, { type: 'tournament', tournament: snapshot, yourSlot: null });
  void persistTournament(t);
}

function removeTournamentFromOpenPool(t: Tournament): void {
  if (openTournaments.get(t.teamSize) === t) openTournaments.delete(t.teamSize);
}

function clearTournamentWaitWatcher(ws: WebSocket): void {
  const handler = tournamentWaitCloseHandlers.get(ws);
  if (handler) {
    ws.off('close', handler);
    tournamentWaitCloseHandlers.delete(ws);
  }
}

// Vigia quem GANHOU a rodada e está esperando a outra partida da mesma
// chave terminar — se essa pessoa cair enquanto espera, já resolve a
// vaga dela como W.O. na hora que a próxima partida for tentada montar
// (ver startTournamentMatch), sem precisar ficar esperando ela "aparecer"
// de novo (não existe reconexão automática nesse servidor, ver topo do
// arquivo).
function watchTournamentDisconnect(ws: WebSocket, tournamentId: string, teamSlot: number): void {
  clearTournamentWaitWatcher(ws);
  const handler = (): void => {
    tournamentWaitCloseHandlers.delete(ws);
    const t = allTournaments.get(tournamentId);
    if (!t || t.status === 'completed') return;
    const pending = t.matches.find((m) => m.status === 'pending' && (m.teamSlotA === teamSlot || m.teamSlotB === teamSlot));
    if (!pending) return;
    const winnerSlot = pending.teamSlotA === teamSlot ? pending.teamSlotB : pending.teamSlotA;
    if (winnerSlot === null) return; // a partida nem tem os dois lados decididos ainda
    resolveMatchForfeit(t, pending, winnerSlot);
  };
  tournamentWaitCloseHandlers.set(ws, handler);
  ws.on('close', handler);
}

function resolveMatchWinner(t: Tournament, match: TournamentMatch, winnerSlot: number, forfeitedTeamSlot: number | null): void {
  match.winnerTeamSlot = winnerSlot;
  match.status = 'completed';
  match.forfeitedTeamSlot = forfeitedTeamSlot;

  if (match.round === 'final') {
    t.championSlot = winnerSlot;
    t.status = 'completed';
    broadcastTournament(t);
    return;
  }

  const next = feedsInto(match.round, match.index);
  if (!next) return; // nunca acontece (só 'final' devolve null, já tratado acima), só pro TS não reclamar
  const nextMatch = findMatch(t, next.round, next.index);
  if (next.side === 'A') nextMatch.teamSlotA = winnerSlot;
  else nextMatch.teamSlotB = winnerSlot;

  broadcastTournament(t);

  if (nextMatch.teamSlotA !== null && nextMatch.teamSlotB !== null) {
    startTournamentMatch(t, nextMatch);
  } else {
    // ainda esperando a OUTRA partida dessa rodada terminar — fica de
    // olho se quem já ganhou desconectar nesse meio tempo.
    const winnerTeam = t.teams[winnerSlot]!;
    for (const ws of winnerTeam.sockets) watchTournamentDisconnect(ws, t.id, winnerSlot);
  }
}

function resolveMatchForfeit(t: Tournament, match: TournamentMatch, winnerSlot: number): void {
  match.scoreA = 0;
  match.scoreB = 0;
  const forfeitedSlot = winnerSlot === match.teamSlotA ? match.teamSlotB! : match.teamSlotA!;
  resolveMatchWinner(t, match, winnerSlot, forfeitedSlot);
}

function disconnectedTeamSlot(match: TournamentMatch, playerId: PlayerId): number {
  return playerId.startsWith('teamA') ? match.teamSlotA! : match.teamSlotB!;
}

function handleTournamentMatchEnded(t: Tournament, match: TournamentMatch, info: RoomEndInfo): void {
  match.room = null;
  match.status = 'completed';

  if (info.reason === 'shutdown') return; // torneio se perde com o processo, nada a resolver

  if (info.reason === 'disconnect') {
    const loserSlot = disconnectedTeamSlot(match, info.disconnectedPlayerId);
    const winnerSlot = loserSlot === match.teamSlotA ? match.teamSlotB! : match.teamSlotA!;
    resolveMatchForfeit(t, match, winnerSlot);
    return;
  }

  // completou de verdade
  match.scoreA = info.score.teamA;
  match.scoreB = info.score.teamB;
  const winnerSlot = info.result === 'teamA' ? match.teamSlotA : info.result === 'teamB' ? match.teamSlotB : null;
  if (winnerSlot === null) {
    // Empate de verdade (prorrogação também esgotou, ver core/simulation.ts)
    // — raríssimo (MATCH.OVERTIME_MS de morte súbita), mas uma chave não
    // pode ficar travada esperando um resultado que nunca vem: desempata
    // pro menor slot, sempre determinístico.
    resolveMatchWinner(t, match, Math.min(match.teamSlotA!, match.teamSlotB!), null);
    return;
  }
  resolveMatchWinner(t, match, winnerSlot, null);
}

function startTournamentMatch(t: Tournament, match: TournamentMatch): void {
  if (match.teamSlotA === null || match.teamSlotB === null) return; // ainda não decidido
  const teamA = t.teams[match.teamSlotA]!;
  const teamB = t.teams[match.teamSlotB]!;

  const aConnected = teamA.sockets.every((ws) => ws.readyState === WebSocket.OPEN);
  const bConnected = teamB.sockets.every((ws) => ws.readyState === WebSocket.OPEN);
  if (!aConnected || !bConnected) {
    // Alguém já sumiu enquanto esperava a vaga anterior terminar — nem
    // cria a partida, já é W.O. na hora. Se os dois sumiram (caso
    // raríssimo), dá o jogo por perdido pro lado B só pra ter um
    // resultado determinístico, sem travar a chave.
    resolveMatchForfeit(t, match, aConnected ? match.teamSlotA : bConnected ? match.teamSlotB : match.teamSlotB);
    return;
  }

  for (const ws of [...teamA.sockets, ...teamB.sockets]) clearTournamentWaitWatcher(ws);
  match.status = 'playing';
  broadcastTournament(t);

  const roster = buildRoster(t.teamSize);
  const humanSockets: Partial<Record<PlayerId, WebSocket>> = {};
  const names = {} as Record<PlayerId, string>;
  const colors = {} as Record<PlayerId, AvatarColor>;
  const emails = {} as Record<PlayerId, string | null>;
  teamA.sockets.forEach((ws, i) => {
    const id = `teamA-${i}` as PlayerId;
    humanSockets[id] = ws;
    names[id] = teamA.names[i] ?? 'Jogador';
    colors[id] = teamA.avatarColors[i] ?? DEFAULT_AVATAR_COLOR;
    emails[id] = teamA.emails[i] ?? null;
  });
  teamB.sockets.forEach((ws, i) => {
    const id = `teamB-${i}` as PlayerId;
    humanSockets[id] = ws;
    names[id] = teamB.names[i] ?? 'Jogador';
    colors[id] = teamB.avatarColors[i] ?? DEFAULT_AVATAR_COLOR;
    emails[id] = teamB.emails[i] ?? null;
  });

  const roomId = randomUUID();
  const room = new Room(roomId, roster, humanSockets, names, colors, emails, TOURNAMENT_MATCH_SETTINGS, false, (info) => {
    rooms.delete(roomId);
    handleTournamentMatchEnded(t, match, info);
  });
  rooms.set(roomId, room);
  match.room = room;
}

function startTournament(t: Tournament): void {
  removeTournamentFromOpenPool(t);
  t.status = 'active';
  // Quartas: vaga0 vs vaga1, vaga2 vs vaga3, vaga4 vs vaga5, vaga6 vs
  // vaga7 — ordem de chegada na fila, sem seed especial (não tem ranking
  // pra basear isso ainda).
  for (let i = 0; i < 4; i++) {
    const match = findMatch(t, 'quarterfinal', i);
    match.teamSlotA = i * 2;
    match.teamSlotB = i * 2 + 1;
  }
  broadcastTournament(t);
  for (let i = 0; i < 4; i++) startTournamentMatch(t, findMatch(t, 'quarterfinal', i));
}

function getOrCreateOpenTournament(teamSize: number): Tournament | 'full' {
  const existing = openTournaments.get(teamSize);
  if (existing) return existing;
  if (activeTournamentCount() >= MAX_CONCURRENT_TOURNAMENTS) return 'full';
  const t: Tournament = {
    id: randomUUID(),
    teamSize,
    status: 'waiting',
    teams: [],
    matches: buildEmptyMatches(),
    championSlot: null,
  };
  allTournaments.set(t.id, t);
  openTournaments.set(teamSize, t);
  return t;
}

// Registra um GRUPO JÁ COMPLETO (1, 2 ou 3 pessoas — sempre `teamSize`
// gente) como UMA vaga na fila de um campeonato aberto — usado tanto pelo
// caminho direto (1v1, ver 'tournamentJoin') quanto por um grupo que
// acabou de completar via código (ver joinTournamentTeam abaixo). Nunca
// chamado com um grupo pela metade.
function registerTeamInTournament(teamSize: number, members: PendingTeamMember[]): void {
  const result = getOrCreateOpenTournament(teamSize);
  if (result === 'full') {
    for (const m of members) send(m.ws, { type: 'tournamentFull' });
    return;
  }
  const t = result;
  const slot = t.teams.length;
  const team: TournamentTeam = {
    slot,
    sockets: members.map((m) => m.ws),
    names: members.map((m) => m.name),
    emails: members.map((m) => m.email),
    avatarColors: members.map((m) => m.avatarColor),
  };
  t.teams.push(team);
  for (const ws of team.sockets) socketTournamentQueueSlot.set(ws, { tournamentId: t.id, slot });

  if (t.teams.length >= TOURNAMENT_SLOTS) startTournament(t);
  else broadcastTournament(t);
}

function joinTournament(ws: WebSocket, name: string, email: string | null, avatarColor: AvatarColor): void {
  registerTeamInTournament(1, [{ ws, name, email, avatarColor }]);
}

function generateTeamCode(): string {
  let code: string;
  do {
    code = Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]).join('');
  } while (pendingTournamentTeams.has(code));
  return code;
}

function teamFormationSnapshot(team: PendingTournamentTeam): TournamentTeamFormationSnapshot {
  return { code: team.code, teamSize: team.teamSize, members: team.members.map((m) => ({ name: m.name, email: m.email })) };
}

function broadcastTeamWaiting(team: PendingTournamentTeam): void {
  const snapshot = teamFormationSnapshot(team);
  for (const m of team.members) send(m.ws, { type: 'tournamentTeamWaiting', team: snapshot });
}

// Cria um grupo (dupla/trio) esperando completar — igual createRoom pras
// partidas normais, mas o "código" aqui não abre uma partida, só junta
// gente até formar UMA vaga da chave (ver registerTeamInTournament).
// teamSize=1 não faz sentido de esperar nada — trata como entrada direta.
function createTournamentTeam(ws: WebSocket, teamSize: number, name: string, email: string | null, avatarColor: AvatarColor): void {
  if (teamSize <= 1) {
    joinTournament(ws, name, email, avatarColor);
    return;
  }
  const code = generateTeamCode();
  const team: PendingTournamentTeam = { code, teamSize, members: [{ ws, name, email, avatarColor }] };
  pendingTournamentTeams.set(code, team);
  socketPendingTeamCode.set(ws, code);
  send(ws, { type: 'tournamentTeamCreated', code });
  broadcastTeamWaiting(team);
}

function joinTournamentTeam(ws: WebSocket, code: string, name: string, email: string | null, avatarColor: AvatarColor): void {
  const team = pendingTournamentTeams.get(code);
  if (!team) {
    send(ws, { type: 'tournamentTeamNotFound' });
    return;
  }
  team.members.push({ ws, name, email, avatarColor });
  socketPendingTeamCode.set(ws, code);

  if (team.members.length >= team.teamSize) {
    pendingTournamentTeams.delete(code);
    for (const m of team.members) socketPendingTeamCode.delete(m.ws);
    registerTeamInTournament(team.teamSize, team.members);
  } else {
    broadcastTeamWaiting(team);
  }
}

// Sai do GRUPO ainda se formando (código, antes de completar) — chamado
// tanto por 'tournamentLeaveQueue' quanto no 'close' geral do socket.
function removeFromPendingTeam(ws: WebSocket): void {
  const code = socketPendingTeamCode.get(ws);
  if (!code) return;
  socketPendingTeamCode.delete(ws);
  const team = pendingTournamentTeams.get(code);
  if (!team) return;

  const idx = team.members.findIndex((m) => m.ws === ws);
  if (idx !== -1) team.members.splice(idx, 1);

  if (team.members.length === 0) {
    pendingTournamentTeams.delete(code);
  } else {
    broadcastTeamWaiting(team);
  }
}

// Sai da fila ENQUANTO ainda espera vaga (chamado tanto por
// 'tournamentLeaveQueue' quanto no 'close' geral do socket) — não faz
// nada se o torneio já começou pra valer (nesse ponto, sair é W.O. de
// verdade, tratado por handleDisconnect/watchTournamentDisconnect). Como
// uma vaga pode ser um GRUPO de várias pessoas, qualquer uma delas saindo
// tira a vaga INTEIRA (não dá pra jogar faltando gente) — todo mundo da
// mesma vaga aponta pro mesmo {tournamentId, slot}.
function removeFromTournamentQueue(ws: WebSocket): void {
  const info = socketTournamentQueueSlot.get(ws);
  if (!info) return;
  const t = allTournaments.get(info.tournamentId);
  if (!t || t.status !== 'waiting') {
    socketTournamentQueueSlot.delete(ws);
    return;
  }

  const idx = t.teams.findIndex((team) => team.slot === info.slot);
  if (idx === -1) {
    socketTournamentQueueSlot.delete(ws);
    return;
  }
  const removedTeam = t.teams[idx]!;
  for (const s of removedTeam.sockets) socketTournamentQueueSlot.delete(s);
  t.teams.splice(idx, 1);
  // Renumera as vagas restantes (senão sobra buraco no meio da fila e o
  // pareamento das quartas, que assume vagas 0-7 contíguas, quebra).
  t.teams.forEach((team, i) => {
    team.slot = i;
    for (const s of team.sockets) socketTournamentQueueSlot.set(s, { tournamentId: t.id, slot: i });
  });

  if (t.teams.length === 0) {
    allTournaments.delete(t.id);
    removeTournamentFromOpenPool(t);
  } else {
    broadcastTournament(t);
  }
}

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws) => {
  // Primeira mensagem decide o modo de pareamento (ver protocol.ts); depois
  // que a Room assume a conexão, ela troca esse listener por um só de
  // 'command' (ws.removeAllListeners('message') no construtor da Room).
  ws.on('message', async (raw) => {
    let parsed: ClientMessage;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (parsed.type === 'adminAuth') {
      const email = await verifyEmail(parsed.token);
      if (email !== ADMIN_EMAIL) {
        send(ws, { type: 'adminDenied' });
        ws.close();
        return;
      }
      adminObservers.add(ws);
      send(ws, { type: 'adminRooms', rooms: collectAdminSnapshots() });
      return;
    }

    if (parsed.type === 'quickMatch') {
      const email = await verifyEmail(parsed.authToken);
      if (email && bannedEmails.has(email.toLowerCase())) {
        send(ws, { type: 'banned' });
        ws.close();
        return;
      }
      const teamSize = clampTeamSize(parsed.teamSize);
      let lobby = publicLobbies.get(teamSize);
      if (!lobby) {
        lobby = { teamSize, code: null, entries: [], matchSettings: sanitizeMatchSettings(parsed.matchSettings) };
        publicLobbies.set(teamSize, lobby);
      }
      joinLobby(lobby, ws, sanitizeName(parsed.name), sanitizeAvatarColor(parsed.avatarColor), email);
      return;
    }

    if (parsed.type === 'createRoom') {
      const email = await verifyEmail(parsed.authToken);
      if (email && bannedEmails.has(email.toLowerCase())) {
        send(ws, { type: 'banned' });
        ws.close();
        return;
      }
      const teamSize = clampTeamSize(parsed.teamSize);
      const code = generateRoomCode();
      const lobby: Lobby = { teamSize, code, entries: [], matchSettings: sanitizeMatchSettings(parsed.matchSettings) };
      privateLobbies.set(code, lobby);
      send(ws, { type: 'roomCreated', code });
      joinLobby(lobby, ws, sanitizeName(parsed.name), sanitizeAvatarColor(parsed.avatarColor), email);
      return;
    }

    if (parsed.type === 'joinRoom') {
      const email = await verifyEmail(parsed.authToken);
      if (email && bannedEmails.has(email.toLowerCase())) {
        send(ws, { type: 'banned' });
        ws.close();
        return;
      }
      const lobby = privateLobbies.get(parsed.code);
      if (!lobby) {
        send(ws, { type: 'roomNotFound' });
        return;
      }
      joinLobby(lobby, ws, sanitizeName(parsed.name), sanitizeAvatarColor(parsed.avatarColor), email);
      return;
    }

    if (parsed.type === 'startNow') {
      const lobby = socketLobby.get(ws);
      if (lobby) startLobby(lobby);
      return;
    }

    if (parsed.type === 'spectate') {
      // Só quem já provou ser o admin (via 'adminAuth' na MESMA conexão)
      // pode pedir isso — nunca aceito de qualquer WebSocket que decida
      // mandar essa mensagem por conta própria.
      if (!adminObservers.has(ws)) return;
      stopSpectating(ws);
      const room = rooms.get(parsed.roomId);
      if (!room) {
        send(ws, { type: 'spectateEnded' });
        return;
      }
      room.addSpectator(ws);
      spectating.set(ws, room);
      return;
    }

    if (parsed.type === 'unspectate') {
      stopSpectating(ws);
      return;
    }

    if (parsed.type === 'tournamentJoin') {
      const email = await verifyEmail(parsed.authToken);
      if (email && bannedEmails.has(email.toLowerCase())) {
        send(ws, { type: 'banned' });
        ws.close();
        return;
      }
      joinTournament(ws, sanitizeName(parsed.name), email, sanitizeAvatarColor(parsed.avatarColor));
      return;
    }

    if (parsed.type === 'tournamentCreateTeam') {
      const email = await verifyEmail(parsed.authToken);
      if (email && bannedEmails.has(email.toLowerCase())) {
        send(ws, { type: 'banned' });
        ws.close();
        return;
      }
      createTournamentTeam(ws, clampTeamSize(parsed.teamSize), sanitizeName(parsed.name), email, sanitizeAvatarColor(parsed.avatarColor));
      return;
    }

    if (parsed.type === 'tournamentJoinTeam') {
      const email = await verifyEmail(parsed.authToken);
      if (email && bannedEmails.has(email.toLowerCase())) {
        send(ws, { type: 'banned' });
        ws.close();
        return;
      }
      joinTournamentTeam(ws, parsed.code, sanitizeName(parsed.name), email, sanitizeAvatarColor(parsed.avatarColor));
      return;
    }

    if (parsed.type === 'tournamentLeaveQueue') {
      removeFromPendingTeam(ws);
      removeFromTournamentQueue(ws);
      return;
    }

    if (parsed.type === 'tournamentSpectate') {
      const t = allTournaments.get(parsed.tournamentId);
      if (!t) return;
      let set = tournamentSpectators.get(t.id);
      if (!set) {
        set = new Set();
        tournamentSpectators.set(t.id, set);
      }
      set.add(ws);
      send(ws, { type: 'tournament', tournament: toSnapshot(t), yourSlot: null });
      return;
    }
  });

  ws.on('close', () => {
    removeFromPendingLobby(ws);
    adminObservers.delete(ws);
    stopSpectating(ws);
    removeFromPendingTeam(ws);
    removeFromTournamentQueue(ws);
    clearTournamentWaitWatcher(ws);
    for (const set of tournamentSpectators.values()) set.delete(ws);
  });
});

// Ping/pong padrão da lib `ws` pra achar conexão morta que nunca manda
// 'close' de verdade (ver comentário de HEARTBEAT_INTERVAL_MS acima).
// WeakMap em vez de propriedade solta no WebSocket — evita estender o tipo
// só pra isso.
const alive = new WeakMap<WebSocket, { ok: boolean }>();

wss.on('connection', (ws) => {
  alive.set(ws, { ok: true });
  ws.on('pong', () => {
    const state = alive.get(ws);
    if (state) state.ok = true;
  });
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    const state = alive.get(ws);
    if (!state) continue;
    if (!state.ok) {
      ws.terminate(); // dispara 'close' — a limpeza normal (fila/sala/Room) cuida do resto
      continue;
    }
    state.ok = false;
    ws.ping();
  }
}, HEARTBEAT_INTERVAL_MS);

console.log(`[futtrool-server] ouvindo em ws://0.0.0.0:${PORT}`);

function shutdown(): void {
  clearInterval(heartbeat);
  for (const room of rooms.values()) room.stop({ reason: 'shutdown' });
  wss.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
