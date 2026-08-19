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
import { step } from '../../src/futtrool/core/simulation';
import { createMatchState } from '../../src/futtrool/core/rules';
import { createAiState, decideCommand, type AiState } from '../../src/futtrool/core/ai/brain';
import { AI_PROFILES } from '../../src/futtrool/core/ai/profiles';
import { FIXED_TIMESTEP_S, MATCH } from '../../src/futtrool/core/constants';
import type { Command, GameState, PlayerId, TeamId } from '../../src/futtrool/core/types';
import type { ClientMessage, ServerMessage } from '../../src/futtrool/net/protocol';

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
  private readonly botStates = new Map<PlayerId, AiState>();
  private readonly onEnded: () => void;

  constructor(roster: Record<TeamId, PlayerId[]>, humanSockets: Partial<Record<PlayerId, WebSocket>>, onEnded: () => void) {
    this.humanSockets = humanSockets;
    this.onEnded = onEnded;
    this.state = createMatchState(Date.now(), MATCH.KICKOFF_COUNTDOWN_MS, roster);

    const allIds = [...roster.teamA, ...roster.teamB];
    this.commands = {} as Record<PlayerId, Command>;

    allIds.forEach((id, index) => {
      this.commands[id] = NEUTRAL_COMMAND;
      const ws = humanSockets[id];
      if (ws) {
        send(ws, { type: 'assigned', playerId: id });
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

type Lobby = {
  teamSize: number;
  code: string | null; // null = fila pública (quickMatch)
  sockets: WebSocket[]; // ordem de entrada = ordem de slot
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
  lobby.sockets.forEach((_, i) => {
    const id = slotToPlayerId(lobby.teamSize, i);
    filled[id.startsWith('teamA') ? 'teamA' : 'teamB']++;
  });
  const message: ServerMessage = { type: 'lobbyUpdate', teamSize: lobby.teamSize, filled, capacity: lobbyCapacity(lobby) };
  for (const ws of lobby.sockets) send(ws, message);
}

function removeLobbyFromPools(lobby: Lobby): void {
  if (lobby.code) privateLobbies.delete(lobby.code);
  else if (publicLobbies.get(lobby.teamSize) === lobby) publicLobbies.delete(lobby.teamSize);
}

function startLobby(lobby: Lobby): void {
  removeLobbyFromPools(lobby);
  for (const ws of lobby.sockets) socketLobby.delete(ws);

  const roster = buildRoster(lobby.teamSize);
  const humanSockets: Partial<Record<PlayerId, WebSocket>> = {};
  lobby.sockets.forEach((ws, i) => {
    humanSockets[slotToPlayerId(lobby.teamSize, i)] = ws;
  });

  const room = new Room(roster, humanSockets, () => rooms.delete(room));
  rooms.add(room);
}

function joinLobby(lobby: Lobby, ws: WebSocket): void {
  lobby.sockets.push(ws);
  socketLobby.set(ws, lobby);
  if (lobby.sockets.length >= lobbyCapacity(lobby)) {
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
  const idx = lobby.sockets.indexOf(ws);
  if (idx !== -1) lobby.sockets.splice(idx, 1);
  if (lobby.sockets.length === 0) removeLobbyFromPools(lobby);
  else broadcastLobbyUpdate(lobby);
}

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws) => {
  // Primeira mensagem decide o modo de pareamento (ver protocol.ts); depois
  // que a Room assume a conexão, ela troca esse listener por um só de
  // 'command' (ws.removeAllListeners('message') no construtor da Room).
  ws.on('message', (raw) => {
    let parsed: ClientMessage;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (parsed.type === 'quickMatch') {
      const teamSize = clampTeamSize(parsed.teamSize);
      let lobby = publicLobbies.get(teamSize);
      if (!lobby) {
        lobby = { teamSize, code: null, sockets: [] };
        publicLobbies.set(teamSize, lobby);
      }
      joinLobby(lobby, ws);
      return;
    }

    if (parsed.type === 'createRoom') {
      const teamSize = clampTeamSize(parsed.teamSize);
      const code = generateRoomCode();
      const lobby: Lobby = { teamSize, code, sockets: [] };
      privateLobbies.set(code, lobby);
      send(ws, { type: 'roomCreated', code });
      joinLobby(lobby, ws);
      return;
    }

    if (parsed.type === 'joinRoom') {
      const lobby = privateLobbies.get(parsed.code);
      if (!lobby) {
        send(ws, { type: 'roomNotFound' });
        return;
      }
      joinLobby(lobby, ws);
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
