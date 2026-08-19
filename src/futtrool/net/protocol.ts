// Protocolo de rede do multiplayer (1v1 e 2v2) — mensagens trocadas entre
// cliente e servidor autoritativo via WebSocket. Só tipos e primitivos
// (mesma regra do GameState em core/types.ts), pra dar pra usar tanto no
// navegador quanto no servidor Node sem depender de nada de DOM.

import type { Command, GameState, MatchEvent, PlayerId, TeamId } from '../core/types';

// Primeira mensagem que o cliente manda depois de conectar, decidindo como
// quer ser pareado: fila aleatória (quickMatch), criar uma sala privada pra
// convidar gente específica (createRoom — servidor gera um código curto e
// já bota quem criou na sala, esperando o resto entrar com esse código), ou
// entrar numa sala existente (joinRoom). `startNow` força o início da
// partida mesmo com a sala incompleta (times de mais de 1 jogador só —
// slots vazios viram bot; ver server/src/index.ts). Depois de pareado, só
// troca mensagens 'command'.
export type ClientMessage =
  | { type: 'quickMatch'; teamSize: number; name: string }
  | { type: 'createRoom'; teamSize: number; name: string }
  | { type: 'joinRoom'; code: string; name: string }
  | { type: 'startNow' }
  | { type: 'command'; command: Command };

export type ServerMessage =
  // `names` cobre TODOS os slots com humano de verdade nessa partida
  // (inclusive quem está recebendo a mensagem) — quem não aparece aqui é
  // bot (o cliente gera um apelido fictício localmente pra esses, ver
  // ui/botNames.ts).
  | { type: 'assigned'; playerId: PlayerId; names: Record<PlayerId, string> }
  | { type: 'roomCreated'; code: string }
  | { type: 'roomNotFound' }
  // Progresso de uma sala (privada ou fila pública) ainda esperando gente —
  // `filled` conta só humanos já pareados em cada time; slots vazios
  // viram bot quando a partida começar (cheia ou via startNow).
  | { type: 'lobbyUpdate'; teamSize: number; filled: Record<TeamId, number>; capacity: number }
  | { type: 'state'; state: GameState; events: MatchEvent[] }
  // Adversário caiu ou fechou a conexão — partida não continua (reconexão
  // automática é fora do escopo desta entrega, ver plano de multiplayer).
  | { type: 'opponentLeft' };
