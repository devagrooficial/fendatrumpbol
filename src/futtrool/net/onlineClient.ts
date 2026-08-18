// Cliente WebSocket do 1v1 online — conecta no servidor autoritativo
// (server/), manda os Commands do jogador local e repassa o GameState/
// eventos que o servidor manda de volta. Zero física/regras aqui: quem
// decide o que acontece é sempre o servidor (ver server/src/index.ts).

import type { Command, GameState, MatchEvent, PlayerId } from '../core/types';
import type { ClientMessage, ServerMessage } from './protocol';

// wss:// em produção (o site já é HTTPS, então ws:// puro seria bloqueado
// como "conteúdo misto") — só cai pro localhost se alguém sobrescrever via
// VITE_FUTTROOL_WS_URL (ver .env.example), pra testar contra o servidor
// local em server/.
const DEFAULT_WS_URL = 'wss://mateus.sysalmeida.com.br';

export function getWsUrl(): string {
  return import.meta.env.VITE_FUTTROOL_WS_URL || DEFAULT_WS_URL;
}

export type OnlineClientCallbacks = {
  onAssigned: (playerId: PlayerId) => void;
  onState: (state: GameState, events: MatchEvent[]) => void;
  onOpponentLeft: () => void;
  onClose: () => void;
};

export class OnlineClient {
  private ws: WebSocket | null = null;

  connect(callbacks: OnlineClientCallbacks): void {
    const ws = new WebSocket(getWsUrl());
    this.ws = ws;

    ws.addEventListener('message', (ev) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      if (message.type === 'assigned') callbacks.onAssigned(message.playerId);
      else if (message.type === 'state') callbacks.onState(message.state, message.events);
      else if (message.type === 'opponentLeft') callbacks.onOpponentLeft();
    });

    ws.addEventListener('close', () => callbacks.onClose());
  }

  sendCommand(command: Command): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const message: ClientMessage = { type: 'command', command };
    this.ws.send(JSON.stringify(message));
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
