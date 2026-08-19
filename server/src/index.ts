// Servidor autoritativo do 1v1 online do FutTrool — reaproveita a mesma
// simulação determinística do cliente (core/simulation.ts), sem duplicar
// física/regras. Cada partida roda a FIXED_TIMESTEP_S (60Hz, igual ao
// cliente) num setInterval próprio; o estado resultante é o único que vale
// (o cliente em modo online não simula localmente — só desenha o último
// GameState recebido). Fora do escopo desta entrega, de propósito: previsão
// no cliente, reconexão automática (o heartbeat só ENCERRA a partida direito
// quando a conexão morre — não tenta retomar), fila de pareamento
// persistente e validação anti-trapaça da física (ver plano de multiplayer).

import { WebSocket, WebSocketServer } from 'ws';
import { step } from '../../src/futtrool/core/simulation';
import { createMatchState } from '../../src/futtrool/core/rules';
import { FIXED_TIMESTEP_S, MATCH } from '../../src/futtrool/core/constants';
import type { Command, GameState, PlayerId } from '../../src/futtrool/core/types';
import type { ClientMessage, ServerMessage } from '../../src/futtrool/net/protocol';

const PORT = Number(process.env.PORT ?? 8787);

// Mobile derruba conexão sem avisar (troca de wifi/4G, tela bloqueando) —
// sem isso o servidor keeps reaplicando o ÚLTIMO comando válido pra sempre
// (o bug do "trava indo pra um lado só"). Ping a cada 15s; quem não
// respondeu ATÉ o ping seguinte (ou seja, ficou ~15-30s mudo) é considerado
// morto e derrubado — o que já aciona a limpeza normal de desconexão.
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS ?? 15000);
const ROOM_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem O/0, I/1, L (ambíguos ao ditar/digitar)
const ROOM_CODE_LENGTH = 6;

const NEUTRAL_COMMAND: Command = { tick: 0, move: { x: 0, y: 0 }, kickHeld: false, dash: false, boost: false };

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

class Room {
  private state: GameState;
  private readonly commands: Record<PlayerId, Command> = { p1: NEUTRAL_COMMAND, p2: NEUTRAL_COMMAND };
  private readonly timer: ReturnType<typeof setInterval>;
  private readonly sockets: Record<PlayerId, WebSocket>;
  private readonly onEnded: () => void;

  constructor(sockets: Record<PlayerId, WebSocket>, onEnded: () => void) {
    this.sockets = sockets;
    this.onEnded = onEnded;
    this.state = createMatchState(Date.now(), MATCH.KICKOFF_COUNTDOWN_MS);

    (Object.entries(this.sockets) as [PlayerId, WebSocket][]).forEach(([playerId, ws]) => {
      send(ws, { type: 'assigned', playerId });

      // Substitui o listener de 'message' que o pareamento usava (join
      // request) — a partir daqui só interessa 'command'.
      ws.removeAllListeners('message');
      ws.on('message', (raw) => {
        this.handleMessage(playerId, raw.toString());
      });

      ws.on('close', () => {
        this.handleDisconnect(playerId);
      });
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
    const other: PlayerId = playerId === 'p1' ? 'p2' : 'p1';
    send(this.sockets[other], { type: 'opponentLeft' });
    this.stop();
  }

  private tick(): void {
    const result = step(this.state, this.commands, FIXED_TIMESTEP_S);
    this.state = result.state;

    const message: ServerMessage = { type: 'state', state: this.state, events: result.events };
    send(this.sockets.p1, message);
    send(this.sockets.p2, message);

    if (this.state.phase === 'ended') this.stop();
  }

  stop(): void {
    clearInterval(this.timer);
    for (const ws of Object.values(this.sockets)) {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    }
    this.onEnded();
  }
}

// Fila de pareamento aleatório (quickMatch) e salas privadas (createRoom /
// joinRoom, pra convidar alguém específico via link — ver plano de
// multiplayer) — ambos em memória, somem se o processo reiniciar (fila
// persistente é fora do escopo desta entrega).
const waiting: WebSocket[] = [];
const privateRooms = new Map<string, WebSocket>();
const rooms = new Set<Room>();

function pairPlayers(a: WebSocket, b: WebSocket): void {
  const room = new Room({ p1: a, p2: b }, () => rooms.delete(room));
  rooms.add(room);
}

function broadcastQueueStatus(): void {
  const message: ServerMessage = { type: 'queueStatus', waitingCount: waiting.length };
  for (const ws of waiting) send(ws, message);
}

function generateRoomCode(): string {
  let code: string;
  do {
    code = Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]).join('');
  } while (privateRooms.has(code));
  return code;
}

function removeFromWaitingPools(ws: WebSocket): void {
  const idx = waiting.indexOf(ws);
  if (idx !== -1) {
    waiting.splice(idx, 1);
    broadcastQueueStatus();
  }
  for (const [code, waitingWs] of privateRooms) {
    if (waitingWs === ws) privateRooms.delete(code);
  }
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
      waiting.push(ws);
      broadcastQueueStatus();
      if (waiting.length >= 2) {
        const a = waiting.shift();
        const b = waiting.shift();
        if (a && b) pairPlayers(a, b);
      }
      return;
    }

    if (parsed.type === 'createRoom') {
      const code = generateRoomCode();
      privateRooms.set(code, ws);
      send(ws, { type: 'roomCreated', code });
      return;
    }

    if (parsed.type === 'joinRoom') {
      const opponent = privateRooms.get(parsed.code);
      if (!opponent || opponent.readyState !== WebSocket.OPEN) {
        send(ws, { type: 'roomNotFound' });
        return;
      }
      privateRooms.delete(parsed.code);
      pairPlayers(opponent, ws);
      return;
    }
  });

  ws.on('close', () => {
    removeFromWaitingPools(ws);
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
