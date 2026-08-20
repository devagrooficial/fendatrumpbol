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
  | { type: 'adminAuth'; token: string }
  // Só aceito numa conexão que já passou por 'adminAuth' (ver
  // server/src/index.ts) — pede pra receber 'state' (o mesmo GameState que
  // os jogadores de verdade recebem, só que sem poder mandar 'command'
  // nenhum, é modo espectador) de UMA partida em andamento específica.
  // `unspectate` para de receber (não fecha a conexão do canal admin,
  // ela continua recebendo 'adminRooms' normalmente).
  | { type: 'spectate'; roomId: string }
  | { type: 'unspectate' }
  // Entra SOZINHO na fila de um campeonato 1v1 (torneio de eliminação
  // simples: quartas → semifinal → final, 8 vagas). Igual quickMatch,
  // entra num torneio já esperando gente do mesmo teamSize, ou cria um
  // novo se não tiver nenhum. Pra teamSize > 1 (dupla/trio), ver
  // 'tournamentCreateTeam'/'tournamentJoinTeam' abaixo — uma vaga da chave
  // só é formada por várias PESSOAS JUNTAS (não pareamento aleatório tipo
  // quickMatch), então precisa de um passo a mais antes de entrar na fila
  // de verdade. Mesma regra de authToken do quickMatch: opcional,
  // convidado continua podendo jogar torneio, só não aparece com nome/
  // email de verdade no bracket.
  | { type: 'tournamentJoin'; name: string; avatarColor: AvatarColor; authToken?: string }
  // Cria um GRUPO pra formar uma vaga de campeonato em dupla/trio — igual
  // ao "Chamar amigo" das partidas normais (createRoom/joinRoom): gera um
  // código curto, e só quando `teamSize` pessoas tiverem entrado com esse
  // código (ver 'tournamentJoinTeam') a vaga INTEIRA entra de vez na fila
  // do torneio (ver 'tournamentJoin' acima). teamSize=1 aqui não faz
  // sentido (não tem o que "esperar") — o servidor trata como entrada
  // direta, igual 'tournamentJoin'.
  | { type: 'tournamentCreateTeam'; teamSize: number; name: string; avatarColor: AvatarColor; authToken?: string }
  | { type: 'tournamentJoinTeam'; code: string; name: string; avatarColor: AvatarColor; authToken?: string }
  // Sai da fila ENQUANTO ainda espera vaga (torneio não começou pra
  // valer, ou o GRUPO ainda não encheu) — depois que a chave já foi
  // montada, sair vira W.O. de verdade (ver 'opponentLeft'/regras de
  // walkover no servidor), não dá mais pra "desistir da fila" sem
  // consequência.
  | { type: 'tournamentLeaveQueue' }
  // Assiste à chave de um torneio (ativo ou já encerrado) sem participar
  // — usado tanto por quem já foi eliminado (continua vendo o resto) e
  // quer acompanhar, quanto por quem só quer ver o campeonato de fora.
  | { type: 'tournamentSpectate'; tournamentId: string };

export type ServerMessage =
  // `names`/`colors` cobrem TODOS os slots com humano de verdade nessa
  // partida (inclusive quem está recebendo a mensagem) — quem não aparece
  // aqui é bot (o cliente gera apelido fictício e mantém a cor do time pra
  // esses, ver ui/botNames.ts e render/theme.ts). `voiceRoomId` é o nome da
  // sala de voz (Jitsi, ver src/futtrool/voice/) dessa partida — igual pra
  // todo mundo nela (o próprio roomId interno da Room, ver
  // server/src/index.ts), então basta todo mundo entrar na mesma sala de
  // voz sem precisar de nenhuma outra combinação entre cliente e servidor.
  | { type: 'assigned'; playerId: PlayerId; names: Record<PlayerId, string>; colors: Record<PlayerId, AvatarColor>; voiceRoomId: string }
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
  | { type: 'adminRooms'; rooms: AdminRoomSnapshot[] }
  // Resposta a 'spectate' bem-sucedido — manda o roster (nome/email por
  // slot) uma vez só, antes da enxurrada de 'state' começar (senão o
  // espectador não sabe de quem é cada bolinha em campo).
  | { type: 'spectateStarted'; roomId: string; players: AdminPlayerSnapshot[] }
  // A partida espectada acabou/sumiu (terminou de verdade, ou o roomId
  // pedido nem existia mais) — o cliente volta pra lista de salas.
  | { type: 'spectateEnded' }
  // Todos os torneios abertos já estão no limite de capacidade do
  // servidor (ver MAX_CONCURRENT_TOURNAMENTS) — tenta de novo mais tarde.
  | { type: 'tournamentFull' }
  // Resposta a 'tournamentCreateTeam' bem-sucedido — código pra compartilhar
  // com quem mais vai completar o time (mesma ideia do link de
  // "Chamar amigo").
  | { type: 'tournamentTeamCreated'; code: string }
  | { type: 'tournamentTeamNotFound' }
  // Progresso de um GRUPO se formando (antes de entrar na fila do torneio
  // de verdade — ver 'tournamentCreateTeam'/'tournamentJoinTeam') —
  // mandado toda vez que alguém entra, até completar `teamSize` gente.
  | { type: 'tournamentTeamWaiting'; team: TournamentTeamFormationSnapshot }
  // Estado completo do torneio — mandado sempre que algo muda (gente
  // entra na fila, partida começa/termina, campeão é decidido). O mesmo
  // tipo serve tanto pra "ainda esperando gente" (status 'waiting') quanto
  // pra "chave em andamento/encerrada" — o cliente decide qual tela
  // mostrar a partir de `tournament.status`. `yourSlot` é só preenchido
  // pra quem está DENTRO do torneio (jogando); espectador recebe `null`.
  | { type: 'tournament'; tournament: TournamentSnapshot; yourSlot: number | null };

export type TournamentRound = 'quarterfinal' | 'semifinal' | 'final';

export type TournamentTeamInfo = {
  slot: number; // 0-7, ordem de entrada na fila
  names: string[]; // 1 nome por jogador da vaga (hoje sempre length 1)
  emails: (string | null)[];
  // Só existe enquanto a vaga ainda está esperando o torneio começar —
  // depois que vira partida de verdade, isso é sempre `false` (o estado
  // de conexão durante a partida já é tratado pelo Room normal).
  connected: boolean;
};

export type TournamentMatchInfo = {
  round: TournamentRound;
  index: number; // posição dentro da rodada: quartas 0-3, semi 0-1, final 0
  teamSlotA: number | null; // índice em tournament.teams — null até a vaga ser decidida
  teamSlotB: number | null;
  winnerTeamSlot: number | null;
  scoreA: number;
  scoreB: number;
  status: 'pending' | 'playing' | 'completed';
  // Preenchido só quando o motivo do fim foi alguém sair no meio (W.O.),
  // não uma vitória de verdade em campo.
  forfeitedTeamSlot: number | null;
};

// Grupo se formando pra virar UMA vaga do campeonato (dupla/trio) — antes
// de entrar na fila de verdade, ver 'tournamentCreateTeam'/
// 'tournamentJoinTeam' acima.
export type TournamentTeamFormationSnapshot = {
  code: string;
  teamSize: number;
  members: { name: string; email: string | null }[];
};

export type TournamentSnapshot = {
  id: string;
  teamSize: number;
  status: 'waiting' | 'active' | 'completed';
  teams: TournamentTeamInfo[];
  matches: TournamentMatchInfo[]; // sempre 7: 4 quartas + 2 semi + 1 final
  championSlot: number | null;
};

// Retrato de UMA sala/fila ativa (esperando gente OU já jogando), pro
// painel "Ao vivo" do admin — nunca mandado pra ninguém além de uma
// conexão que passou por 'adminAuth'.
export type AdminPlayerSnapshot = { playerId: PlayerId; name: string; email: string | null };
export type AdminRoomSnapshot = {
  status: 'waiting' | 'playing';
  teamSize: number;
  code: string | null; // sala privada tem código; fila pública/partida em andamento não
  // Só partida EM ANDAMENTO tem isso (ver 'spectate') — sala esperando
  // gente ainda não tem GameState nenhum pra assistir.
  roomId: string | null;
  players: AdminPlayerSnapshot[];
};
