// Servidor autoritativo do 1v1 online do FutTrool — reaproveita a mesma
// simulação determinística do cliente (core/simulation.ts), sem duplicar
// física/regras. Cada partida roda a FIXED_TIMESTEP_S (60Hz, igual ao
// cliente) num setInterval próprio; o estado resultante é o único que vale
// (o cliente em modo online não simula localmente — só desenha o último
// GameState recebido). Fora do escopo desta entrega, de propósito: previsão
// no cliente, reconexão automática, fila de pareamento persistente e
// validação anti-trapaça da física (ver plano de multiplayer).

import { WebSocket, WebSocketServer } from 'ws';
import { step } from '../../src/futtrool/core/simulation';
import { createMatchState } from '../../src/futtrool/core/rules';
import { FIXED_TIMESTEP_S, MATCH } from '../../src/futtrool/core/constants';
import type { Command, GameState, PlayerId } from '../../src/futtrool/core/types';
import type { ClientMessage, ServerMessage } from '../../src/futtrool/net/protocol';

const PORT = Number(process.env.PORT ?? 8787);

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

const waiting: WebSocket[] = [];
const rooms = new Set<Room>();

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws) => {
  waiting.push(ws);

  ws.on('close', () => {
    const idx = waiting.indexOf(ws);
    if (idx !== -1) waiting.splice(idx, 1);
  });

  if (waiting.length >= 2) {
    const p1 = waiting.shift();
    const p2 = waiting.shift();
    if (!p1 || !p2) return;
    const room = new Room({ p1, p2 }, () => rooms.delete(room));
    rooms.add(room);
  }
});

console.log(`[futtrool-server] ouvindo em ws://0.0.0.0:${PORT}`);

function shutdown(): void {
  for (const room of rooms) room.stop();
  wss.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
