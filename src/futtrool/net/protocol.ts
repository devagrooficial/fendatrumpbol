// Protocolo de rede do multiplayer 1v1 — mensagens trocadas entre cliente e
// servidor autoritativo via WebSocket. Só tipos e primitivos (mesma regra do
// GameState em core/types.ts), pra dar pra usar tanto no navegador quanto no
// servidor Node sem depender de nada de DOM.

import type { Command, GameState, MatchEvent, PlayerId } from '../core/types';

export type ClientMessage = { type: 'command'; command: Command };

export type ServerMessage =
  | { type: 'assigned'; playerId: PlayerId }
  | { type: 'state'; state: GameState; events: MatchEvent[] }
  // Adversário caiu ou fechou a conexão — partida não continua (reconexão
  // automática é fora do escopo desta entrega, ver plano de multiplayer).
  | { type: 'opponentLeft' };
