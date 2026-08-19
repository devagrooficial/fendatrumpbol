// Cliente WebSocket do 1v1 online — conecta no servidor autoritativo
// (server/), manda os Commands do jogador local e repassa o GameState/
// eventos que o servidor manda de volta. Zero física/regras aqui: quem
// decide o que acontece é sempre o servidor (ver server/src/index.ts).

import type { AvatarColor, Command, GameState, MatchEvent, MatchSettings, PlayerId, TeamId } from '../core/types';
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
  // Só depois disso o socket aceita send() — é aqui que o chamador manda o
  // "modo" de pareamento (requestQuickMatch/requestCreateRoom/requestJoinRoom).
  onOpen: () => void;
  onAssigned: (playerId: PlayerId, names: Record<PlayerId, string>, colors: Record<PlayerId, AvatarColor>) => void;
  onRoomCreated: (code: string) => void;
  onRoomNotFound: () => void;
  onLobbyUpdate: (teamSize: number, filled: Record<TeamId, number>, capacity: number) => void;
  onState: (state: GameState, events: MatchEvent[]) => void;
  onOpponentLeft: () => void;
  // Email (via authToken) bate com public.admin_bans — servidor recusou a
  // entrada e já fechou a conexão em seguida (ver server/src/index.ts).
  onBanned: () => void;
  onClose: () => void;
};

export class OnlineClient {
  private ws: WebSocket | null = null;

  connect(callbacks: OnlineClientCallbacks): void {
    const ws = new WebSocket(getWsUrl());
    this.ws = ws;

    ws.addEventListener('open', () => callbacks.onOpen());

    ws.addEventListener('message', (ev) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      if (message.type === 'assigned') callbacks.onAssigned(message.playerId, message.names, message.colors);
      else if (message.type === 'roomCreated') callbacks.onRoomCreated(message.code);
      else if (message.type === 'roomNotFound') callbacks.onRoomNotFound();
      else if (message.type === 'lobbyUpdate') callbacks.onLobbyUpdate(message.teamSize, message.filled, message.capacity);
      else if (message.type === 'state') callbacks.onState(message.state, message.events);
      else if (message.type === 'opponentLeft') callbacks.onOpponentLeft();
      else if (message.type === 'banned') callbacks.onBanned();
    });

    ws.addEventListener('close', () => callbacks.onClose());
  }

  private sendRaw(message: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(message));
  }

  // `authToken` (access_token da sessão Supabase, se estiver logado) deixa
  // o servidor confirmar de verdade quem está entrando — usado só pra
  // banimento e pro painel de admin ver o email de quem está jogando (ver
  // protocol.ts). Quem não está logado manda undefined e continua jogando
  // normalmente como convidado.
  requestQuickMatch(teamSize: number, name: string, matchSettings: MatchSettings, avatarColor: AvatarColor, authToken?: string): void {
    this.sendRaw({ type: 'quickMatch', teamSize, name, matchSettings, avatarColor, authToken });
  }

  requestCreateRoom(teamSize: number, name: string, matchSettings: MatchSettings, avatarColor: AvatarColor, authToken?: string): void {
    this.sendRaw({ type: 'createRoom', teamSize, name, matchSettings, avatarColor, authToken });
  }

  requestJoinRoom(code: string, name: string, avatarColor: AvatarColor, authToken?: string): void {
    this.sendRaw({ type: 'joinRoom', code, name, avatarColor, authToken });
  }

  requestStartNow(): void {
    this.sendRaw({ type: 'startNow' });
  }

  sendCommand(command: Command): void {
    this.sendRaw({ type: 'command', command });
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
