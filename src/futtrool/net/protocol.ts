// Protocolo de rede do multiplayer 1v1 — mensagens trocadas entre cliente e
// servidor autoritativo via WebSocket. Só tipos e primitivos (mesma regra do
// GameState em core/types.ts), pra dar pra usar tanto no navegador quanto no
// servidor Node sem depender de nada de DOM.

import type { Command, GameState, MatchEvent, PlayerId } from '../core/types';

// Primeira mensagem que o cliente manda depois de conectar, decidindo como
// quer ser pareado: fila aleatória (quickMatch), criar uma sala privada pra
// convidar alguém específico (createRoom — servidor gera um código curto e
// espera outra pessoa entrar com ele), ou entrar numa sala existente
// (joinRoom). Depois de pareado, só troca mensagens 'command'.
export type ClientMessage =
  | { type: 'quickMatch' }
  | { type: 'createRoom' }
  | { type: 'joinRoom'; code: string }
  | { type: 'command'; command: Command };

export type ServerMessage =
  | { type: 'assigned'; playerId: PlayerId }
  | { type: 'roomCreated'; code: string }
  | { type: 'roomNotFound' }
  // Só relevante em quickMatch — quantas outras conexões estão esperando
  // pareamento aleatório agora (não conta quem está numa sala privada).
  | { type: 'queueStatus'; waitingCount: number }
  | { type: 'state'; state: GameState; events: MatchEvent[] }
  // Adversário caiu ou fechou a conexão — partida não continua (reconexão
  // automática é fora do escopo desta entrega, ver plano de multiplayer).
  | { type: 'opponentLeft' };
