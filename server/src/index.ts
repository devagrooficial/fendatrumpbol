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

import { WebSocket, WebSocketServer } from 'ws';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { step } from '../../src/futtrool/core/simulation';
import { createMatchState } from '../../src/futtrool/core/rules';
import { createAiState, decideCommand, type AiState } from '../../src/futtrool/core/ai/brain';
import { AI_PROFILES } from '../../src/futtrool/core/ai/profiles';
import { AVATAR_COLOR_PALETTE, DEFAULT_AVATAR_COLOR, FIXED_TIMESTEP_S, MATCH, MATCH_SETTINGS_OPTIONS } from '../../src/futtrool/core/constants';
import type { AvatarColor, AvatarColorMode, Command, GameState, MatchSettings, PlayerId, TeamId } from '../../src/futtrool/core/types';
import type { AdminPlayerSnapshot, AdminRoomSnapshot, ClientMessage, ServerMessage } from '../../src/futtrool/net/protocol';
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

// ---------------------------------------------------------------------------
// Room: uma partida em andamento — humanos mandam Command via WebSocket,
// slots sem humano (sala que começou incompleta, ver Lobby.start) são
// controlados por um bot local, tudo dentro do MESMO tick determinístico.
// ---------------------------------------------------------------------------

class Room {
  private state: GameState;
  private readonly commands: Record<PlayerId, Command>;
  private readonly timer: ReturnType<typeof setInterval>;
  private readonly humanSockets: Partial<Record<PlayerId, WebSocket>>;
  private readonly names: Record<PlayerId, string>;
  private readonly emails: Record<PlayerId, string | null>;
  private readonly teamSize: number;
  private readonly botStates = new Map<PlayerId, AiState>();
  private readonly onEnded: () => void;

  constructor(
    roster: Record<TeamId, PlayerId[]>,
    humanSockets: Partial<Record<PlayerId, WebSocket>>,
    names: Record<PlayerId, string>,
    colors: Record<PlayerId, AvatarColor>,
    emails: Record<PlayerId, string | null>,
    matchSettings: MatchSettings,
    onEnded: () => void,
  ) {
    this.humanSockets = humanSockets;
    this.names = names;
    this.emails = emails;
    this.teamSize = roster.teamA.length;
    this.onEnded = onEnded;
    this.state = createMatchState(Date.now(), MATCH.KICKOFF_COUNTDOWN_MS, roster, matchSettings);

    const allIds = [...roster.teamA, ...roster.teamB];
    this.commands = {} as Record<PlayerId, Command>;

    allIds.forEach((id, index) => {
      this.commands[id] = NEUTRAL_COMMAND;
      const ws = humanSockets[id];
      if (ws) {
        send(ws, { type: 'assigned', playerId: id, names, colors });
        // Substitui o listener de 'message' que o pareamento usava (join
        // request) — a partir daqui só interessa 'command'.
        ws.removeAllListeners('message');
        ws.on('message', (raw) => this.handleMessage(id, raw.toString()));
        ws.on('close', () => this.handleDisconnect(id));
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
    this.stop();
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

    if (this.state.phase === 'ended') this.stop();
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
    return { status: 'playing', teamSize: this.teamSize, code: null, players };
  }

  stop(): void {
    clearInterval(this.timer);
    for (const ws of this.allHumanSockets()) {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    }
    this.onEnded();
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
const rooms = new Set<Room>();

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

  const room = new Room(roster, humanSockets, names, colors, emails, lobby.matchSettings, () => rooms.delete(room));
  rooms.add(room);
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
  return { status: 'waiting', teamSize: lobby.teamSize, code: lobby.code, players };
}

function collectAdminSnapshots(): AdminRoomSnapshot[] {
  const snapshots: AdminRoomSnapshot[] = [];
  for (const lobby of publicLobbies.values()) snapshots.push(lobbySnapshot(lobby));
  for (const lobby of privateLobbies.values()) snapshots.push(lobbySnapshot(lobby));
  for (const room of rooms) snapshots.push(room.getSnapshot());
  return snapshots;
}

setInterval(() => {
  if (adminObservers.size === 0) return;
  const message: ServerMessage = { type: 'adminRooms', rooms: collectAdminSnapshots() };
  for (const ws of adminObservers) send(ws, message);
}, ADMIN_BROADCAST_INTERVAL_MS);

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
  });

  ws.on('close', () => {
    removeFromPendingLobby(ws);
    adminObservers.delete(ws);
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
  for (const room of rooms) room.stop();
  wss.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
