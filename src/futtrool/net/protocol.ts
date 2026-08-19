// Protocolo de rede do multiplayer (1v1 e 2v2) — mensagens trocadas entre
// cliente e servidor autoritativo via WebSocket. Só tipos e primitivos
// (mesma regra do GameState em core/types.ts), pra dar pra usar tanto no
// navegador quanto no servidor Node sem depender de nada de DOM.

import type { AvatarColor, Command, GameState, MatchEvent, MatchSettings, PlayerId, TeamId } from '../core/types';

// Primeira mensagem que o cliente manda depois de conectar, decidindo como
// quer ser pareado: fila aleatória (quickMatch), criar uma sala privada pra
// convidar gente específica (createRoom — servidor gera um código curto e
// já bota quem criou na sala, esperando o resto entrar com esse código), ou
// entrar numa sala existente (joinRoom). `startNow` força o início da
// partida mesmo com a sala incompleta (times de mais de 1 jogador só —
// slots vazios viram bot; ver server/src/index.ts). Depois de pareado, só
// troca mensagens 'command'. `matchSettings` em quickMatch/createRoom é a
// escolha de quem inicia a sala (duração/limite de gol) — mesma regra já
// usada pro tamanho do time; quem entra via joinRoom herda o que a sala já
// tem, não manda o próprio. `avatarColor`, diferente de `matchSettings`, é
// por PESSOA (não por sala) — por isso vai em quickMatch/createRoom E
// joinRoom, sempre a cor de quem está mandando a mensagem. `authToken`
// (opcional — quem não está logado manda undefined e continua jogando
// normalmente como convidado) é o access_token da sessão Supabase de quem
// está mandando; o servidor verifica ele com supabase.auth.getUser() antes
// de aceitar a entrada — usado pra (a) recusar gente banida
// (public.admin_bans) e (b) saber o email de verdade de quem está jogando,
// pro painel de admin (ver 'adminAuth'/'adminRooms' abaixo). Nunca é
// confiado sem verificar: um cliente forjando esse campo só engana quem
// não checou a assinatura do token, e o servidor sempre checa.
export type ClientMessage =
  | { type: 'quickMatch'; teamSize: number; name: string; matchSettings: MatchSettings; avatarColor: AvatarColor; authToken?: string }
  | { type: 'createRoom'; teamSize: number; name: string; matchSettings: MatchSettings; avatarColor: AvatarColor; authToken?: string }
  | { type: 'joinRoom'; code: string; name: string; avatarColor: AvatarColor; authToken?: string }
  | { type: 'startNow' }
  | { type: 'command'; command: Command }
  // Canal separado do admin.html (não é uma partida) — o servidor verifica
  // se `token` pertence ao email de admin (ver server/src/adminConfig.ts) e,
  // se sim, passa a mandar 'adminRooms' periodicamente pra essa conexão até
  // ela fechar. Qualquer outro email (ou token inválido) recebe
  // 'adminDenied' e a conexão é encerrada — verificação sempre no servidor,
  // nunca confiada do que o cliente afirma ser.
  | { type: 'adminAuth'; token: string };

export type ServerMessage =
  // `names`/`colors` cobrem TODOS os slots com humano de verdade nessa
  // partida (inclusive quem está recebendo a mensagem) — quem não aparece
  // aqui é bot (o cliente gera apelido fictício e mantém a cor do time pra
  // esses, ver ui/botNames.ts e render/theme.ts).
  | { type: 'assigned'; playerId: PlayerId; names: Record<PlayerId, string>; colors: Record<PlayerId, AvatarColor> }
  | { type: 'roomCreated'; code: string }
  | { type: 'roomNotFound' }
  // Progresso de uma sala (privada ou fila pública) ainda esperando gente —
  // `filled` conta só humanos já pareados em cada time; slots vazios
  // viram bot quando a partida começar (cheia ou via startNow).
  | { type: 'lobbyUpdate'; teamSize: number; filled: Record<TeamId, number>; capacity: number }
  | { type: 'state'; state: GameState; events: MatchEvent[] }
  // Adversário caiu ou fechou a conexão — partida não continua (reconexão
  // automática é fora do escopo desta entrega, ver plano de multiplayer).
  | { type: 'opponentLeft' }
  // Email (via authToken) bate com public.admin_bans — servidor recusa a
  // entrada e fecha a conexão logo em seguida.
  | { type: 'banned' }
  | { type: 'adminDenied' }
  | { type: 'adminRooms'; rooms: AdminRoomSnapshot[] };

// Retrato de UMA sala/fila ativa (esperando gente OU já jogando), pro
// painel "Ao vivo" do admin — nunca mandado pra ninguém além de uma
// conexão que passou por 'adminAuth'.
export type AdminPlayerSnapshot = { playerId: PlayerId; name: string; email: string | null };
export type AdminRoomSnapshot = {
  status: 'waiting' | 'playing';
  teamSize: number;
  code: string | null; // sala privada tem código; fila pública/partida em andamento não
  players: AdminPlayerSnapshot[];
};
