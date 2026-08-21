import './ui/styles.css';
import { Loop } from '../shared/Loop';
import { Camera } from './render/camera';
import {
  renderBall,
  renderBallTrail,
  renderField,
  renderGoalFlash,
  renderParticles,
  renderPlayer,
  renderPlayerLabel,
  renderTouchControls,
} from './render/renderer';
import { THEME } from './render/theme';
import { Fx } from './render/fx';
import { assignFictionalNames } from './ui/botNames';
import { FIXED_TIMESTEP_S, MATCH, REPLAY } from './core/constants';
import { step } from './core/simulation';
import { createMatchState } from './core/rules';
import type { AvatarColor, Command, GameState, MatchEvent, MatchSettings, PlayerId, TeamId } from './core/types';
import { teamOf } from './core/types';
import { OnlineClient } from './net/onlineClient';
import { KeyboardInput } from './input/keyboard';
import { TouchInput } from './input/joystick';
import { createAiState, decideCommand, type AiState } from './core/ai/brain';
import { AI_PROFILES, type AiDifficulty } from './core/ai/profiles';
import { Audio } from './audio/Audio';
import { t } from './i18n';
import { renderMatchHud } from './ui/hud';
import { MenuScreen } from './ui/screens/MenuScreen';
import { DifficultyScreen } from './ui/screens/DifficultyScreen';
import { MatchmakingScreen } from './ui/screens/MatchmakingScreen';
import { EndGameScreen } from './ui/screens/EndGameScreen';
import { SavedReplaysScreen } from './ui/screens/SavedReplaysScreen';
import { ReplayOverlay } from './ui/ReplayOverlay';
import { ProgressionStore, type ProgressionState } from './progression/storage';
import { MatchSettingsStore } from './progression/matchSettings';
import { MatchSettingsScreen } from './ui/screens/MatchSettingsScreen';
import { AvatarColorStore } from './progression/avatarColor';
import { AvatarColorScreen } from './ui/screens/AvatarColorScreen';
import { TournamentSetupScreen, type TournamentSetupChoice } from './ui/screens/TournamentSetupScreen';
import { TournamentWaitingScreen } from './ui/screens/TournamentWaitingScreen';
import { TournamentBracketScreen } from './ui/screens/TournamentBracketScreen';
import type { TournamentSnapshot } from './net/protocol';
import { applyXp, calculateMatchReward, splitExitReward, xpForLevel, type MatchOutcome } from './progression/economy';
import { supabase } from '../auth/supabaseClient';
import { getApelido } from '../auth/profile';
import { ballFromSnapshot, playerFromSnapshot, ReplayBuffer, type ReplaySnapshot } from './replay/buffer';
import { ReplayPlayer } from './replay/player';
import { ReplayStore, type SavedReplay } from './replay/storage';
import { MatchStatsStore } from './stats/storage';
import { adManager } from './ads/adManager';
import { loadAdsConfig } from './ads/loadAdsConfig';
import { startVoice, stopVoice } from './voice/jitsiVoice';
import { MatchVoiceHud } from './ui/MatchVoiceHud';

// Sistema de publicidade (spec seção 10) — carregado uma vez no boot, do
// Supabase (public.ad_creatives, editável ao vivo pelo painel de admin,
// sem rebuild — ver ads/loadAdsConfig.ts), com fallback pro JSON estático
// se o Supabase estiver fora do ar. O fetch dispara aqui em cima (cedo),
// mas o `.then()` que usa as telas só é registrado mais embaixo, depois
// delas existirem (a promise só resolve depois do script síncrono
// terminar de qualquer forma, então a ordem de declaração não importa pra
// corretude — só pra legibilidade).
const adsConfigPromise = loadAdsConfig();

const canvasEl = document.querySelector<HTMLCanvasElement>('#app');
if (!canvasEl) throw new Error('Canvas #app não encontrado');
const canvas: HTMLCanvasElement = canvasEl;

const context = canvas.getContext('2d');
if (!context) throw new Error('Contexto 2D indisponível');
const ctx: CanvasRenderingContext2D = context;

const camera = new Camera();
let fx = new Fx();

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  camera.resize(w, h);
  touch?.updateLayout(w, h);
}

const keyboard = new KeyboardInput();

// Controles touch (spec seção 6) só entram se o dispositivo suportar toque —
// em desktop o joystick/botões nem aparecem, fica só o teclado.
const hasTouch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
const touch = hasTouch ? new TouchInput(canvas, () => ({ w: window.innerWidth, h: window.innerHeight })) : null;

// Sempre lê o teclado como P1 (WASD/Espaço/Shift/Ctrl) mesmo quando o
// servidor online atribuiu o slot p2 pra esse jogador (ver localPlayerId) —
// cada pessoa está no seu próprio teclado, então não faz sentido usar o
// esquema de p2 (setas) só por causa de um detalhe interno da simulação.
function getP1Command(tick: number): Command {
  const fromKeyboard = keyboard.getCommand('primary', tick);
  if (!touch) return fromKeyboard;

  const fromTouch = touch.getCommand(tick);
  const keyboardMag = Math.hypot(fromKeyboard.move.x, fromKeyboard.move.y);
  const touchMag = Math.hypot(fromTouch.move.x, fromTouch.move.y);
  return {
    tick,
    move: touchMag > keyboardMag ? fromTouch.move : fromKeyboard.move,
    kickHeld: fromKeyboard.kickHeld || fromTouch.kickHeld,
    dash: fromKeyboard.dash || fromTouch.dash,
    boost: fromKeyboard.boost || fromTouch.boost,
  };
}

// ---------------------------------------------------------------------------
// Fluxo do app (spec seção 7): menu -> dificuldade -> matchmaking -> partida
// -> fim de jogo, mais a lista de replays salvos (seção 8) acessível pelo
// menu. Isso é estado do APP, diferente do GameState da partida (que só
// existe de verdade a partir de 'match').
// ---------------------------------------------------------------------------

type AppScreen =
  | 'menu'
  | 'difficulty'
  | 'matchSettings'
  | 'avatarColor'
  | 'matchmaking'
  | 'onlineMatchmaking'
  | 'tournamentSetup'
  | 'tournamentWaiting'
  | 'tournamentBracket'
  | 'match'
  | 'endgame'
  | 'replays'
  | 'watchingReplay';
let appScreen: AppScreen = 'menu';
let chosenDifficulty: AiDifficulty = 'profissional';

// Multiplayer 1v1 (server/, ver plano de multiplayer): quando onlineMode é
// true, a simulação NÃO roda localmente (nem em updateMatch nem em lugar
// nenhum) — o servidor autoritativo é quem chama step(), e o cliente só
// manda o Command do jogador local a cada tick e desenha o último GameState
// que o servidor mandou de volta. localPlayerId é 'p1' fora do modo online
// (humano sempre joga de p1 contra a IA).
let onlineMode = false;
// Time/roster do 1v1 contra a IA — sempre igual, o humano é sempre
// 'teamA-0'. Times online vêm de fora (o servidor decide o roster real, ver
// startOnlineMatch) — isso aqui só serve pro modo offline.
const SOLO_ROSTER: Record<TeamId, PlayerId[]> = { teamA: ['teamA-0'], teamB: ['teamB-0'] };
let localPlayerId: PlayerId = 'teamA-0';
let onlineClient: OnlineClient | null = null;
// Apelido de cada humano de verdade na partida online atual (inclusive eu
// mesmo — mas pro meu próprio rótulo sempre uso `displayName` direto, não
// esse mapa). Quem não aparece aqui é bot — ver nameFor() e ui/botNames.ts.
// Some sozinho quando volta pro modo offline (startMatch), senão um nome
// de uma partida online anterior poderia vazar pro rótulo do bot da IA.
let humanNames: Record<PlayerId, string> = {};
// Mesma ideia de `humanNames`, pra cor do avatar (menu > "Cor do avatar"):
// cor escolhida por cada humano de verdade na partida online atual, exceto
// eu mesmo (uso `avatarColor` direto pro meu próprio, ver colorFor()).
let humanColors: Record<PlayerId, AvatarColor> = {};
// Apelido fictício de cada BOT da partida atual — calculado uma vez só
// (não a cada frame) quando a partida começa, cobrindo todo mundo que não
// está em `humanNames` (ver startMatch/startOnlineMatch e nameFor()).
let botNameAssignment: Record<PlayerId, string> = {};
// Eventos ('goal', 'kick' etc.) que chegaram do servidor desde o último
// frame local — updateMatch() drena essa fila a cada chamada, do mesmo
// jeito que consumiria o retorno de step() no modo offline.
let pendingOnlineEvents: MatchEvent[] = [];

// Campeonato: a MESMA conexão WS toca várias partidas em sequência
// (quartas -> semi -> final), diferente de quickMatch/createRoom (1
// partida só por conexão) — precisa de estado próprio pra saber, quando a
// partida atual acaba, se volta pra tela da CHAVE (torneio) em vez da
// tela de fim de jogo comum (ver endTournamentMatchFlow). `lastTournament*`
// guarda o retrato mais recente pra a tela do bracket nunca ficar em
// branco no intervalo entre "minha partida acabou" e "o servidor mandou o
// bracket atualizado" (ver connectTournament: os dois chegam em mensagens
// separadas, quase juntas mas não atômicas).
let inTournamentMatch = false;
let lastTournamentSnapshot: TournamentSnapshot | null = null;
let lastTournamentYourSlot: number | null = null;
// Sala de voz do MEU TIME (dupla/trio) no campeonato — só entre parceiros
// de time, nunca com o adversário (diferente de assignedVoiceRoomId em
// connectTournament, que é a partida em si). `null` pra quem joga sozinho
// (1v1 não forma time nenhum, ver TournamentSetupScreen) — nesse caso
// syncTournamentTeamVoice() nunca liga a voz. Persiste do começo da
// formação do time até sair do torneio (mesmo código do convite, ver
// onTournamentTeamWaiting), sobrevivendo à transição pra fila e pro
// bracket — só quem PAUSA essa sala é a partida em si (startTournamentMatchPlay
// assume o canal de voz enquanto joga, com o adversário junto).
let tournamentTeamVoiceRoomId: string | null = null;

const progressionStore = new ProgressionStore();
let progression: ProgressionState = progressionStore.load();

const matchSettingsStore = new MatchSettingsStore();
let matchSettings = matchSettingsStore.load();

const avatarColorStore = new AvatarColorStore();
let avatarColor = avatarColorStore.load();

// Apelido escolhido pelo jogador (até 12 caracteres, ver src/auth/profile.ts)
// pra aparecer no lugar de "Você" no replay e na tela de fim de jogo. Cache
// local porque é usado no loop de render (não dá pra buscar de novo a
// cada frame) — atualizado no boot e sempre que a MenuScreen salva um
// apelido novo (ver `new MenuScreen(...)` mais abaixo).
let displayName = t('hud.you');

async function refreshDisplayName(): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return;
  const apelido = await getApelido(userId);
  if (apelido) displayName = apelido;
}
void refreshDisplayName();

// Nome a mostrar em cima de QUALQUER jogador em campo — eu mesmo uso
// `displayName` (apelido de verdade); outro humano de verdade (2v2/3v3
// online) usa o apelido que ele mandou ao entrar (humanNames); quem sobra
// é bot e ganha um apelido fictício estável (ui/botNames.ts).
function nameFor(playerId: PlayerId): string {
  if (playerId === localPlayerId) return displayName;
  return humanNames[playerId] ?? botNameAssignment[playerId] ?? playerId;
}

// Cor de exibição de QUALQUER jogador em campo — mesma regra de nameFor():
// eu mesmo uso a cor escolhida em `avatarColor`; outro humano de verdade
// usa a cor que ele mandou ao entrar (humanColors, ver protocol.ts
// 'assigned'); bot continua com a cor do time (nunca teve customização).
function colorFor(player: { id: PlayerId; teamId: TeamId }): AvatarColor {
  if (player.id === localPlayerId) return avatarColor;
  const custom = humanColors[player.id];
  if (custom) return custom;
  return { mode: 'solid', colors: [player.teamId === 'teamA' ? THEME.TEAM_1 : THEME.TEAM_2] };
}

// Guardado no fim da partida (ver economy.ts: splitExitReward) — só é
// creditado se a pessoa escolher "Mais uma!" em vez de "Sair". Zerado
// depois de aplicado, pra não acumular se o próximo fim de jogo não
// tiver bônus nenhum por algum motivo.
let pendingRematchBonus = 0;

const replayStore = new ReplayStore();
const matchStatsStore = new MatchStatsStore();
const replayBuffer = new ReplayBuffer();
const replayPlayer = new ReplayPlayer();
// true durante a janela de replay de verdade dentro da fase 'goal' (depois
// do congelamento de MATCH.GOAL_FREEZE_MS) — antes disso é só o congelamento
// mostrando o estado ao vivo parado, não o replay tocando.
let inGoalReplayWindow = false;

let state: GameState = createMatchState(1, MATCH.KICKOFF_COUNTDOWN_MS, SOLO_ROSTER, matchSettings);
let aiState: AiState = createAiState(Date.now());
let prevPhase = state.phase;

function hideAllScreens(): void {
  menuScreen.hide();
  difficultyScreen.hide();
  matchmakingScreen.hide();
  endGameScreen.hide();
  savedReplaysScreen.hide();
  replayOverlay.hide();
  matchSettingsScreen.hide();
  avatarColorScreen.hide();
  tournamentSetupScreen.hide();
  tournamentWaitingScreen.hide();
  tournamentBracketScreen.hide();
}

function goToMenu(): void {
  appScreen = 'menu';
  hideAllScreens();
  menuScreen.show(progression);
}

function goToDifficulty(): void {
  appScreen = 'difficulty';
  hideAllScreens();
  difficultyScreen.show();
}

function goToMatchSettings(): void {
  appScreen = 'matchSettings';
  hideAllScreens();
  matchSettingsScreen.show(matchSettings);
}

function onMatchSettingsChange(updated: MatchSettings): MatchSettings {
  matchSettings = updated;
  matchSettingsStore.save(matchSettings);
  return matchSettings;
}

function goToAvatarColor(): void {
  appScreen = 'avatarColor';
  hideAllScreens();
  avatarColorScreen.show(avatarColor);
}

function onAvatarColorChange(updated: AvatarColor): AvatarColor {
  avatarColor = updated;
  avatarColorStore.save(avatarColor);
  return avatarColor;
}

function goToMatchmaking(difficulty: AiDifficulty): void {
  chosenDifficulty = difficulty;
  appScreen = 'matchmaking';
  hideAllScreens();
  matchmakingScreen.show(AI_PROFILES[difficulty].label, startMatch);
}

// Reset visual/tela compartilhado entre começar uma partida contra a IA
// (startMatch) e entrar numa partida online já em andamento (startOnlineMatch)
// — `state` já precisa estar atualizado por quem chama, antes de chamar isso.
function resetMatchVisuals(): void {
  fx.reset();
  replayBuffer.clear();
  inGoalReplayWindow = false;
  camera.centerX = state.ball.pos.x;
  camera.centerY = state.ball.pos.y;
  camera.zoom = 1;
  prevPhase = state.phase;
  appScreen = 'match';
  hideAllScreens();
}

function startMatch(): void {
  state = createMatchState(Date.now(), MATCH.KICKOFF_COUNTDOWN_MS, SOLO_ROSTER, matchSettings);
  aiState = createAiState(Date.now());
  onlineMode = false;
  localPlayerId = 'teamA-0';
  humanNames = {}; // sem isso, um apelido de uma partida online anterior podia vazar pro rótulo do bot da IA
  humanColors = {};
  botNameAssignment = assignFictionalNames(['teamB-0']);
  resetMatchVisuals();
}

function goToMenuWithNotice(text: string): void {
  goToMenu();
  menuScreen.showNotice(text);
}

function onMatchmakingCancel(): void {
  stopMatchVoice();
  onlineClient?.disconnect();
  onlineClient = null;
  goToMenu();
}

// `humanNames` inclui eu mesmo (ver protocol.ts 'assigned') — mais de 1
// entrada significa que tem PELO MENOS outra pessoa de verdade na
// partida (adversário ou parceiro de time), único caso em que vale a
// pena pedir microfone; sozinho contra bot não tem com quem falar.
// Encerra a voz da PARTIDA (o card por jogador some junto) — usado em
// todo ponto de saída/fim de partida. Some pra hide() mesmo se a HUD
// nunca chegou a aparecer (partida sozinho contra bot, por exemplo): é
// só limpar innerHTML vazio de novo, sem efeito nenhum.
function stopMatchVoice(): void {
  stopVoice();
  matchVoiceHud.hide();
}

// 1v1 (roster.teamA tem 1 slot): não tem "time" pra proteger, então o
// grupo relevante é TODO MUNDO na partida (o adversário é com quem dá
// pra falar). 2v2/3v3: o grupo relevante é só MEU TIME — o servidor já
// manda um voiceRoomId por time nesse caso (ver 'assigned' em
// protocol.ts/server/src/index.ts), então juntar todo mundo aqui do lado
// do cliente ia só mostrar gente que nem cai na mesma sala.
function startVoiceIfAccompanied(voiceRoomId: string): void {
  const isTeamMatch = state.roster.teamA.length > 1;
  const myTeam = teamOf(localPlayerId);
  const relevantIds = (Object.keys(humanNames) as PlayerId[]).filter((id) => !isTeamMatch || teamOf(id) === myTeam);
  if (relevantIds.length <= 1) return;

  startVoice(voiceRoomId, displayName);
  const players = relevantIds.map((id) => ({
    name: id === localPlayerId ? displayName : (humanNames[id] ?? id),
    isYou: id === localPlayerId,
  }));
  matchVoiceHud.show(players);
}

// Liga/mantém a voz do TIME (tournamentTeamVoiceRoomId) enquanto o time
// forma/espera/acompanha o bracket — nunca mexe durante a partida em si
// (appScreen === 'match' já tem sua própria sala de voz, com o
// adversário junto, ver startTournamentMatchPlay). `memberCount` decide
// se liga (só faz sentido com 2+ pessoas de verdade no time — sozinho
// esperando o resto completar não tem com quem falar ainda). O card com
// o botão de mic aqui é o da própria TournamentWaitingScreen (ver
// bindMicButton em voice/jitsiVoice.ts) — nunca a matchVoiceHud, que é só
// pra dentro da partida em si.
function syncTournamentTeamVoice(memberCount: number): void {
  if (appScreen === 'match') return;
  if (tournamentTeamVoiceRoomId && memberCount > 1) startVoice(tournamentTeamVoiceRoomId, displayName);
  else stopMatchVoice();
}

function startOnlineMatch(initialState: GameState, playerId: PlayerId, voiceRoomId: string): void {
  state = initialState;
  onlineMode = true;
  localPlayerId = playerId;
  inTournamentMatch = false;
  // humanNames já está preenchido nesse ponto (onAssigned sempre chega
  // antes do primeiro 'state' — ver server/src/index.ts) — quem sobra do
  // roster é bot.
  const botIds = (Object.keys(initialState.players) as PlayerId[]).filter((id) => !(id in humanNames));
  botNameAssignment = assignFictionalNames(botIds);
  resetMatchVisuals();
  startVoiceIfAccompanied(voiceRoomId);
}

// Igual startOnlineMatch, mas marca `inTournamentMatch` — o único jeito
// de saber, quando essa partida acabar, que precisa voltar pra tela da
// CHAVE (ver updateMatch) em vez da tela normal de fim de jogo. Partida
// de torneio nunca tem bot (ver server/src/index.ts) — não precisa
// calcular botNameAssignment de verdade, mas mantém vazio por segurança
// (nameFor() já cai pro próprio playerId se não achar ninguém).
function startTournamentMatchPlay(initialState: GameState, playerId: PlayerId, voiceRoomId: string): void {
  state = initialState;
  onlineMode = true;
  localPlayerId = playerId;
  inTournamentMatch = true;
  botNameAssignment = {};
  resetMatchVisuals();
  startVoiceIfAccompanied(voiceRoomId);
}

// Como pedir pareamento pro servidor depois que a conexão abrir (ver
// OnlineClientCallbacks.onOpen) — fila aleatória, criar sala privada pra
// convidar alguém específico, ou entrar numa sala existente via link/código
// (ver server/src/index.ts e protocol.ts).
type OnlineJoinMode =
  | { kind: 'quickMatch'; teamSize: number }
  | { kind: 'createRoom'; teamSize: number }
  | { kind: 'joinRoom'; code: string };

function buildRoomLink(code: string): string {
  return `${window.location.origin}${window.location.pathname}?room=${code}`;
}

function onMatchmakingStartNow(): void {
  onlineClient?.requestStartNow();
}

function onTournamentStartNow(): void {
  onlineClient?.requestTournamentStartNow();
}

async function connectOnline(mode: OnlineJoinMode): Promise<void> {
  appScreen = 'onlineMatchmaking';
  hideAllScreens();
  matchmakingScreen.showOnline();

  // Sessão atual (se estiver logado) — o servidor usa isso pra confirmar
  // de verdade quem está entrando (banimento + painel de admin, ver
  // server/src/index.ts). Quem não está logado segue como convidado
  // (authToken undefined), exatamente como sempre funcionou.
  const authToken = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;

  const client = new OnlineClient();
  onlineClient = client;
  let assignedPlayerId: PlayerId | null = null;
  let assignedVoiceRoomId: string | null = null;
  let matchStarted = false;

  client.connect({
    onOpen: () => {
      if (mode.kind === 'quickMatch') client.requestQuickMatch(mode.teamSize, displayName, matchSettings, avatarColor, authToken);
      else if (mode.kind === 'createRoom') client.requestCreateRoom(mode.teamSize, displayName, matchSettings, avatarColor, authToken);
      else client.requestJoinRoom(mode.code, displayName, avatarColor, authToken);
    },
    onAssigned: (playerId, names, colors, voiceRoomId) => {
      assignedPlayerId = playerId;
      assignedVoiceRoomId = voiceRoomId;
      humanNames = names;
      humanColors = colors;
    },
    onRoomCreated: (code) => {
      matchmakingScreen.showRoomCreated(code, buildRoomLink(code));
    },
    onRoomNotFound: () => {
      onlineClient = null;
      goToMenuWithNotice(t('matchmaking.online.roomNotFound'));
    },
    onLobbyUpdate: (teamSize, filled, capacity) => {
      matchmakingScreen.setLobbyStatus(teamSize, filled, capacity);
    },
    onState: (newState, events) => {
      if (!matchStarted) {
        matchStarted = true;
        // Servidor sempre manda 'assigned' antes do primeiro 'state' (ver
        // server/src/index.ts) — na prática nunca é null aqui, o fallback é
        // só pra não deixar o tipo escapar como PlayerId | null.
        startOnlineMatch(newState, assignedPlayerId ?? 'teamA-0', assignedVoiceRoomId ?? '');
        return;
      }
      state = newState;
      pendingOnlineEvents.push(...events);
    },
    onOpponentLeft: () => {
      stopMatchVoice();
      onlineClient = null;
      onlineMode = false;
      goToMenuWithNotice(t('matchmaking.online.opponentLeft'));
    },
    onBanned: () => {
      stopMatchVoice();
      onlineClient = null;
      onlineMode = false;
      goToMenuWithNotice(t('matchmaking.online.banned'));
    },
    onClose: () => {
      stopMatchVoice();
      if (appScreen === 'onlineMatchmaking') {
        onlineClient = null;
        goToMenuWithNotice(t('matchmaking.online.connectionFailed'));
      }
    },
  });
}

function goToOnlineMatchmaking(teamSize: number): void {
  connectOnline({ kind: 'quickMatch', teamSize });
}

function goToCreateOnlineRoom(teamSize: number): void {
  connectOnline({ kind: 'createRoom', teamSize });
}

function joinOnlineRoom(code: string): void {
  connectOnline({ kind: 'joinRoom', code });
}

// Como entrar no campeonato (ver TournamentSetupScreen): sozinho (1v1,
// fila direta) ou criando/entrando num GRUPO (dupla/trio, igual "Chamar
// amigo" — só que o "convite" aqui forma uma vaga da chave, não uma
// partida isolada). `joinTeam` é usado tanto ao clicar "entrar com
// código" quanto pelo link de convite (?tournamentTeam=CODE).
type TournamentJoinMode = { kind: 'solo' } | { kind: 'createTeam'; teamSize: number } | { kind: 'joinTeam'; code: string };

function buildTournamentTeamLink(code: string): string {
  return `${window.location.origin}${window.location.pathname}?tournamentTeam=${code}`;
}

// Campeonato: MESMA conexão WS toca a formação do time (se dupla/trio), a
// fila de espera, a chave em si, e TODAS as partidas do meu lado da chave
// em sequência (quartas -> semi -> final), diferente de connectOnline (1
// partida só) — por isso os callbacks de partida (onAssigned/onState)
// aqui não terminam a conexão quando uma partida acaba, só resetam
// `matchStarted` pra próxima 'state' iniciar a partida seguinte quando
// ela vier.
async function connectTournament(mode: TournamentJoinMode): Promise<void> {
  appScreen = 'tournamentWaiting';
  hideAllScreens();
  // Quem ENTRA com código já sabe ele de antemão (veio do link ou foi
  // digitado) — não dá pra esperar o servidor ecoar de volta num
  // 'tournamentTeamWaiting': se essa entrada completar o time na hora
  // (último membro faltando), o servidor pula direto pra 'tournament' e
  // NUNCA manda esse eco pra quem entrou (ver joinTournamentTeam em
  // server/src/index.ts) — sem isso, essa pessoa nunca aprenderia o nome
  // da sala de voz do próprio time. Quem CRIA o time não sabe o código
  // ainda nesse ponto (o servidor que gera) — só aprende via
  // onTournamentTeamCreated mais abaixo.
  tournamentTeamVoiceRoomId = mode.kind === 'joinTeam' ? `futtrool-team-${mode.code}` : null;

  const authToken = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;

  const client = new OnlineClient();
  onlineClient = client;
  let assignedPlayerId: PlayerId | null = null;
  let assignedVoiceRoomId: string | null = null;
  let matchStarted = false;

  client.connect({
    onOpen: () => {
      if (mode.kind === 'solo') client.requestTournamentJoin(displayName, avatarColor, authToken);
      else if (mode.kind === 'createTeam') client.requestTournamentCreateTeam(mode.teamSize, displayName, avatarColor, authToken);
      else client.requestTournamentJoinTeam(mode.code, displayName, avatarColor, authToken);
    },
    onAssigned: (playerId, names, colors, voiceRoomId) => {
      assignedPlayerId = playerId;
      assignedVoiceRoomId = voiceRoomId;
      humanNames = names;
      humanColors = colors;
      matchStarted = false; // próxima 'state' que chegar é o começo de uma partida NOVA
    },
    onRoomCreated: () => {},
    onRoomNotFound: () => {},
    onLobbyUpdate: () => {},
    onState: (newState, events) => {
      if (!matchStarted) {
        matchStarted = true;
        startTournamentMatchPlay(newState, assignedPlayerId ?? 'teamA-0', assignedVoiceRoomId ?? '');
        return;
      }
      state = newState;
      pendingOnlineEvents.push(...events);
    },
    onOpponentLeft: () => {
      // No campeonato, o adversário saindo no meio é W.O. a MEU favor —
      // o servidor já resolve isso e manda um 'tournament' atualizado me
      // colocando como vencedor da vaga; a partida em si já para (Room
      // encerra do lado do servidor), então só ignora aqui (diferente do
      // multiplayer comum, não é motivo pra voltar pro menu) — mas a
      // sala de voz DAQUELA partida acabou junto, então encerra ela.
      stopMatchVoice();
    },
    onBanned: () => {
      stopMatchVoice();
      onlineClient = null;
      onlineMode = false;
      goToMenuWithNotice(t('matchmaking.online.banned'));
    },
    onClose: () => {
      stopMatchVoice();
      if (appScreen === 'tournamentWaiting' || appScreen === 'tournamentBracket') {
        onlineClient = null;
        onlineMode = false;
        goToMenuWithNotice(t('matchmaking.online.connectionFailed'));
      }
    },
    onTournamentTeamCreated: (code) => {
      // O servidor manda 'tournamentTeamWaiting' logo em seguida, já com
      // o retrato completo (teamSize/membros) — essa mensagem aqui só
      // confirma que o código existe, não precisa fazer nada com a UI.
      // Guarda já o nome da sala de voz do time (mesmo código do convite)
      // pra quando o segundo membro entrar — ver onTournamentTeamWaiting.
      tournamentTeamVoiceRoomId = `futtrool-team-${code}`;
    },
    onTournamentTeamNotFound: () => {
      onlineClient = null;
      goToMenuWithNotice(t('tournament.teamNotFound'));
    },
    onTournamentTeamWaiting: (team) => {
      appScreen = 'tournamentWaiting';
      hideAllScreens();
      tournamentWaitingScreen.showTeamFormation(team, buildTournamentTeamLink(team.code), displayName);
      // Também cobre quem ENTROU com o código (nunca recebe
      // 'tournamentTeamCreated', só isso aqui) — mesmo nome de sala nos
      // dois casos, sempre `team.code`.
      tournamentTeamVoiceRoomId = `futtrool-team-${team.code}`;
      syncTournamentTeamVoice(team.members.length);
    },
    onTournament: (tournament, yourSlot) => {
      lastTournamentSnapshot = tournament;
      lastTournamentYourSlot = yourSlot;

      if (tournament.status === 'waiting') {
        appScreen = 'tournamentWaiting';
        hideAllScreens();
        const myTeamNames = yourSlot !== null ? (tournament.teams[yourSlot]?.names ?? [displayName]) : [displayName];
        tournamentWaitingScreen.showTournamentQueue(tournament, myTeamNames, displayName, progression);
        syncTournamentTeamVoice(myTeamNames.length);
        return;
      }

      // 'active' ou 'completed': se a partida atual já estiver rolando
      // (appScreen === 'match'), não pisa na tela — 'assigned'/'state' já
      // cuidam da transição pra partida seguinte quando ela começar (nem
      // mexe na voz aqui: syncTournamentTeamVoice já se recusa a fazer
      // isso com appScreen === 'match', é só uma otimização evitar até a
      // chamada).
      if (appScreen === 'match') return;
      appScreen = 'tournamentBracket';
      hideAllScreens();
      tournamentBracketScreen.show(tournament, yourSlot);
      const myTeamNames = yourSlot !== null ? (tournament.teams[yourSlot]?.names ?? [displayName]) : [displayName];
      syncTournamentTeamVoice(myTeamNames.length);
    },
    onTournamentFull: () => {
      onlineClient = null;
      goToMenuWithNotice(t('tournament.full'));
    },
  });
}

function goToTournamentSetup(): void {
  appScreen = 'tournamentSetup';
  hideAllScreens();
  tournamentSetupScreen.show();
}

function onTournamentSetupChoice(choice: TournamentSetupChoice): void {
  if (choice.kind === 'solo') void connectTournament({ kind: 'solo' });
  else void connectTournament({ kind: 'createTeam', teamSize: choice.teamSize });
}

function joinTournamentTeamByCode(code: string): void {
  void connectTournament({ kind: 'joinTeam', code });
}

// "Sair" tanto na tela de espera (ainda não começou, é só desistir da
// fila) quanto no botão "Voltar" da tela do bracket (torneio já rolando —
// nesse caso É desistência de verdade: o servidor trata a desconexão como
// W.O. pro adversário na vaga pendente, ver server/src/index.ts
// watchTournamentDisconnect). Mesmo botão físico nas duas telas, mesma
// ação — sair da conexão sempre volta pro menu.
function leaveTournament(): void {
  stopMatchVoice();
  onlineClient?.disconnect();
  onlineClient = null;
  lastTournamentSnapshot = null;
  lastTournamentYourSlot = null;
  tournamentTeamVoiceRoomId = null;
  goToMenu();
}

function endMatchFlow(): void {
  stopMatchVoice();

  // A partir daqui `update()` para de chamar `fx.update(dt)` (só roda com
  // appScreen === 'match'), então o shakeTimer do último gol ficaria
  // travado num valor > 0 pra sempre — e o render() continua chamando
  // `fx.getShakeOffsetPx()` a cada quadro, gerando um offset aleatório
  // novo (tremedeira infinita) em vez de decair. Zera os efeitos aqui pra
  // a tela de fim de jogo ficar parada.
  fx.reset();

  // Sempre do ponto de vista de quem está vendo a tela — em modo online o
  // humano local pode ter caído no teamA OU no teamB (decisão do
  // servidor), nunca dá pra assumir "eu sou teamA" (bug real que existia
  // aqui antes: resultado do online sempre lido como se o humano fosse
  // p1/teamA, então metade das vitórias de verdade apareciam como derrota).
  const myTeam = teamOf(localPlayerId);
  const opponentTeam: TeamId = myTeam === 'teamA' ? 'teamB' : 'teamA';
  const outcome: MatchOutcome = state.result === myTeam ? 'win' : state.result === opponentTeam ? 'loss' : 'draw';
  const reward = calculateMatchReward(outcome, state.score[myTeam], progression.winStreak);
  const levelAfter = applyXp(
    { level: progression.level, levelXp: progression.levelXp, xpToNextLevel: xpForLevel(progression.level) },
    reward.xp,
  );

  // Só credita a parte "garantida" (ver economy.ts) na hora — o resto
  // (`bonusCoins`) fica pendente e só é aplicado se a pessoa clicar em
  // "Mais uma!" (`claimRematchBonus`, abaixo). "Sair" não faz nada além
  // de navegar: quem saiu já recebeu a parte dele aqui.
  const { exitCoins, bonusCoins } = splitExitReward(reward.coins);
  pendingRematchBonus = bonusCoins;

  progression = {
    coins: progression.coins + exitCoins,
    level: levelAfter.level,
    levelXp: levelAfter.levelXp,
    winStreak: reward.newStreak,
  };
  progressionStore.save(progression);

  // % do tempo de jogo com a bola na metade DIREITA do campo (ver
  // core/types.ts MatchStats.ballInRightHalfMs) é sempre o campo de
  // ataque de teamA — pra teamB é o complemento. Convertido aqui pro
  // ponto de vista de "meu time" (ver comentário de myTeam acima).
  const rightHalfPct = state.stats.playingElapsedMs > 0 ? (state.stats.ballInRightHalfMs / state.stats.playingElapsedMs) * 100 : 0;
  const attackPctByTeam: Record<TeamId, number> = { teamA: rightHalfPct, teamB: 100 - rightHalfPct };

  const statsPlayers = (Object.keys(state.players) as PlayerId[]).map((id) => ({
    label: nameFor(id),
    mine: id === localPlayerId,
    goals: state.stats.goalsByPlayer[id] ?? 0,
    touches: state.stats.touches[id] ?? 0,
  }));

  appScreen = 'endgame';
  hideAllScreens();
  endGameScreen.show({
    outcome,
    score: { myTeam: state.score[myTeam], opponentTeam: state.score[opponentTeam] },
    opponentLabel: onlineMode ? t('endgame.opponent.online') : `IA (${AI_PROFILES[chosenDifficulty].label})`,
    reward,
    exitCoins,
    youLabel: displayName,
    levelAfter,
    players: statsPlayers,
    attackPct: { myTeam: attackPctByTeam[myTeam], opponentTeam: attackPctByTeam[opponentTeam] },
  });

  void matchStatsStore.save({
    teamSize: state.roster.teamA.length,
    online: onlineMode,
    outcome,
    scoreMine: state.score[myTeam],
    scoreOpponent: state.score[opponentTeam],
    goals: state.stats.goalsByPlayer[localPlayerId] ?? 0,
    touches: state.stats.touches[localPlayerId] ?? 0,
    attackPct: attackPctByTeam[myTeam],
  });
}

// Igual endMatchFlow (XP/moedas/estatística), mas sem a tela de fim de
// jogo normal — depois de uma partida de CAMPEONATO, volta pra tela da
// chave (não faz sentido "Mais uma!"/"Sair" no meio de um torneio; quem
// quiser sair de verdade usa o botão "Voltar" da própria tela do bracket,
// que já é tratado como desistência — ver onTournamentBracketBack). Toda
// a moeda ganha é creditada na hora (sem a divisão exitCoins/bonusCoins
// de "Mais uma!", que não existe aqui).
function endTournamentMatchFlow(): void {
  stopMatchVoice();
  fx.reset();

  const myTeam = teamOf(localPlayerId);
  const opponentTeam: TeamId = myTeam === 'teamA' ? 'teamB' : 'teamA';
  const outcome: MatchOutcome = state.result === myTeam ? 'win' : state.result === opponentTeam ? 'loss' : 'draw';
  const reward = calculateMatchReward(outcome, state.score[myTeam], progression.winStreak);
  const levelAfter = applyXp(
    { level: progression.level, levelXp: progression.levelXp, xpToNextLevel: xpForLevel(progression.level) },
    reward.xp,
  );

  progression = {
    coins: progression.coins + reward.coins,
    level: levelAfter.level,
    levelXp: levelAfter.levelXp,
    winStreak: reward.newStreak,
  };
  progressionStore.save(progression);

  const rightHalfPct = state.stats.playingElapsedMs > 0 ? (state.stats.ballInRightHalfMs / state.stats.playingElapsedMs) * 100 : 0;
  const attackPctByTeam: Record<TeamId, number> = { teamA: rightHalfPct, teamB: 100 - rightHalfPct };

  void matchStatsStore.save({
    teamSize: state.roster.teamA.length,
    online: true,
    outcome,
    scoreMine: state.score[myTeam],
    scoreOpponent: state.score[opponentTeam],
    goals: state.stats.goalsByPlayer[localPlayerId] ?? 0,
    touches: state.stats.touches[localPlayerId] ?? 0,
    attackPct: attackPctByTeam[myTeam],
  });

  inTournamentMatch = false;
  appScreen = 'tournamentBracket';
  hideAllScreens();
  // Mostra o retrato mais recente que já temos (pode estar 1 partida
  // "atrasado" por uma fração de segundo — o servidor manda o 'tournament'
  // atualizado logo em seguida, ver connectTournament) em vez de deixar a
  // tela em branco nesse intervalo.
  if (lastTournamentSnapshot) tournamentBracketScreen.show(lastTournamentSnapshot, lastTournamentYourSlot);
}

function claimRematchBonus(): void {
  if (pendingRematchBonus > 0) {
    progression = { ...progression, coins: progression.coins + pendingRematchBonus };
    progressionStore.save(progression);
    pendingRematchBonus = 0;
  }
  goToMatchmaking(chosenDifficulty);
}

// list() agora é uma chamada de rede (replays vivem numa conta, seção
// "replay do FutTrool" das notas) — mostra "carregando" na hora, troca
// pela lista de verdade quando ela chegar. O guard `appScreen === 'replays'`
// evita pisar numa tela diferente se o usuário já tiver saído daqui antes
// da resposta voltar (mesmo padrão do `adsConfigPromise.then` mais acima).
function goToReplaysList(): void {
  appScreen = 'replays';
  hideAllScreens();
  savedReplaysScreen.showLoading();
  void replayStore.list().then((replays) => {
    if (appScreen === 'replays') savedReplaysScreen.show(replays);
  });
}

function watchSavedReplay(replay: SavedReplay): void {
  appScreen = 'watchingReplay';
  hideAllScreens();
  replayPlayer.start(replay.snapshots);
  replayOverlay.show('watch');
}

async function deleteSavedReplay(id: string): Promise<void> {
  await replayStore.remove(id);
  const replays = await replayStore.list();
  if (appScreen === 'replays') savedReplaysScreen.show(replays);
}

// Reagir/Salvar/Pular durante o replay automático de gol (spec seção 8).
function reactToGoalReplay(): void {
  progression = { ...progression, coins: progression.coins + 1 };
  progressionStore.save(progression);
  replayOverlay.markReacted();
}

function saveGoalReplay(): Promise<boolean> {
  return replayStore.save(state.score, replayBuffer.getAll());
}

// Serve tanto pro botão "Pular" do replay ao vivo (pula pro kickoff) quanto
// pro "Voltar" ao assistir um replay salvo — o mesmo botão físico, com
// sentido diferente dependendo de onde a tela está.
function onReplayOverlaySkipOrBack(): void {
  if (appScreen === 'watchingReplay') {
    goToReplaysList();
    return;
  }
  // Força o fim da fase 'goal' no próximo tick — mesmo caminho que o
  // congelamento/replay chegando no fim naturalmente tomaria.
  state = { ...state, phaseTimer: 0 };
}

const menuScreen = new MenuScreen(
  goToDifficulty,
  goToOnlineMatchmaking,
  goToCreateOnlineRoom,
  goToReplaysList,
  goToMatchSettings,
  goToAvatarColor,
  goToTournamentSetup,
  (name) => {
    displayName = name;
  },
);
const difficultyScreen = new DifficultyScreen(goToMatchmaking, goToMenu);
const matchSettingsScreen = new MatchSettingsScreen(onMatchSettingsChange, goToMenu);
const avatarColorScreen = new AvatarColorScreen(onAvatarColorChange, goToMenu);
const tournamentSetupScreen = new TournamentSetupScreen(onTournamentSetupChoice, goToMenu);
const tournamentWaitingScreen = new TournamentWaitingScreen(leaveTournament, onTournamentStartNow);
const tournamentBracketScreen = new TournamentBracketScreen(leaveTournament);
const matchmakingScreen = new MatchmakingScreen(onMatchmakingCancel, onMatchmakingStartNow);
const endGameScreen = new EndGameScreen(goToMenu, claimRematchBonus);
const savedReplaysScreen = new SavedReplaysScreen(watchSavedReplay, deleteSavedReplay, goToMenu);
const replayOverlay = new ReplayOverlay(reactToGoalReplay, saveGoalReplay, onReplayOverlaySkipOrBack);
const matchVoiceHud = new MatchVoiceHud();

// Convite por link (?room=CODE, ver menu.inviteFriend/goToCreateOnlineRoom):
// quem abre o link cai direto na sala, sem passar pelo menu. Limpa o
// parâmetro da URL logo em seguida — recarregar a página não deve tentar
// entrar na mesma sala de novo (o código já foi consumido ou pode ter
// expirado).
const inviteRoomCode = new URLSearchParams(window.location.search).get('room');
// Convite de TIME de campeonato (?tournamentTeam=CODE, ver
// TournamentSetupScreen/buildTournamentTeamLink) — mesma ideia do convite
// de sala, mas pra entrar num GRUPO se formando (dupla/trio), não numa
// partida isolada.
const inviteTournamentTeamCode = new URLSearchParams(window.location.search).get('tournamentTeam');
if (inviteRoomCode) {
  window.history.replaceState(null, '', window.location.pathname);
  joinOnlineRoom(inviteRoomCode);
} else if (inviteTournamentTeamCode) {
  window.history.replaceState(null, '', window.location.pathname);
  joinTournamentTeamByCode(inviteTournamentTeamCode);
} else {
  goToMenu();
}

// O fetch quase sempre ainda está em voo quando o menu já apareceu (a
// primeira tela do app) — sem isso, o loading-hero da matchmaking ficaria
// vazio até a próxima troca de tela. Só atualiza o anúncio da tela
// ATUALMENTE visível, pra não disparar impression de um slot que o
// jogador não está vendo. Menu e fim de jogo não têm mais slot de
// anúncio de tela (ver docs/NOTES.md).
adsConfigPromise
  .then((config) => {
    adManager.load(config);
    if (appScreen === 'matchmaking') matchmakingScreen.refreshAd();
    if (appScreen === 'menu') menuScreen.refreshAd();
  })
  .catch((err) => {
    if (import.meta.env.DEV) console.error('[futtrool] falha ao carregar ads.config.json', err);
  });

// ---------------------------------------------------------------------------
// Loop de jogo — sempre rodando a 60Hz; só simula/renderiza a partida de
// verdade quando appScreen === 'match'. Nas outras telas o canvas fica
// parado no último quadro (as telas de UI cobrem tudo por cima via DOM).
// ---------------------------------------------------------------------------

// Modo offline: roda step() localmente contra a IA, como sempre. Modo
// online: NÃO simula nada aqui — só manda o Command local pro servidor e
// devolve os eventos que já chegaram das mensagens 'state' recebidas desde
// o último frame (`state` em si já foi atualizado direto pelo listener de
// mensagem, ver goToOnlineMatchmaking). Mesma "forma" de retorno (events[])
// nos dois casos, pra updateMatch não precisar saber a diferença.
function advanceMatchState(dt: number): MatchEvent[] {
  if (onlineMode) {
    onlineClient?.sendCommand(getP1Command(state.tick));
    return pendingOnlineEvents.splice(0);
  }

  const myCommand = getP1Command(state.tick);
  // A IA só produz Command a partir do GameState — mesma regra de qualquer
  // jogador (seção 5 da spec: sem acesso privilegiado).
  const botId: PlayerId = 'teamB-0';
  const aiDecision = decideCommand(state, aiState, AI_PROFILES[chosenDifficulty], botId, dt);
  aiState = aiDecision.aiState;

  const commands = {} as Record<PlayerId, Command>;
  commands[localPlayerId] = myCommand;
  commands[botId] = aiDecision.command;

  const result = step(state, commands, dt);
  state = result.state;
  return result.events;
}

function updateMatch(dt: number): void {
  const events = advanceMatchState(dt);

  // Câmera atualizada no passo fixo (não no render) pra a suavização (lerp
  // flat, seção 11) não depender da taxa de atualização do monitor.
  camera.follow(
    state.ball.pos,
    state.players[localPlayerId]!.pos,
    Object.values(state.players).map((p) => p.pos),
  );

  if (state.phase === 'playing' || prevPhase === 'playing') {
    fx.recordBallPosition(state.ball.pos);
    fx.updateBallSpin(Math.hypot(state.ball.vel.x, state.ball.vel.y), state.ball.radius, dt);
    replayBuffer.record(state);
  }
  fx.update(dt);
  adManager.trackFieldVisibility(camera, dt);

  for (const event of events) {
    switch (event.type) {
      case 'kick':
        Audio.kick(event.charge);
        fx.spawnKickParticles(event.pos, event.dir, event.charge);
        fx.triggerKickPulse();
        break;
      case 'dash':
        Audio.dash();
        break;
      case 'ballWallBounce':
        Audio.ballWallBounce();
        break;
      case 'playerCollision':
        Audio.playerCollision();
        break;
      case 'goal':
        Audio.goal();
        fx.triggerGoal();
        // Captura o clipe ANTES do congelamento acabar — a fase 'goal' já
        // começou (phaseTimer no valor cheio), então dá tempo de preparar
        // o replay antes da janela de reprodução de verdade começar.
        replayPlayer.start(replayBuffer.getLastSeconds(REPLAY.CONTENT_SECONDS));
        break;
      case 'kickoffEnded':
        Audio.whistleStart();
        break;
      case 'finalCountdown':
        Audio.finalCountdown();
        break;
      case 'matchEnded':
        Audio.whistleEnd();
        break;
      default:
        break;
    }
    if (import.meta.env.DEV) console.info('[futtrool]', event);
  }

  // Dentro da fase 'goal': os primeiros GOAL_FREEZE_MS são só congelamento
  // (mostra o estado ao vivo parado); depois disso é a janela de replay de
  // verdade (spec seção 8), tocando o clipe capturado acima a 0.6x.
  if (state.phase === 'goal') {
    const totalGoalPhaseMs = MATCH.GOAL_FREEZE_MS + MATCH.GOAL_REPLAY_MS;
    const elapsedMs = totalGoalPhaseMs - state.phaseTimer;
    const wasInWindow = inGoalReplayWindow;
    inGoalReplayWindow = elapsedMs >= MATCH.GOAL_FREEZE_MS;

    if (inGoalReplayWindow) {
      if (!wasInWindow) replayOverlay.show('goal');
      replayPlayer.update(dt);
      replayOverlay.setProgress(replayPlayer.progress);
    }
  } else if (inGoalReplayWindow) {
    inGoalReplayWindow = false;
    replayOverlay.hide();
  }

  if (state.phase === 'ended' && prevPhase !== 'ended') {
    if (inTournamentMatch) endTournamentMatchFlow();
    else endMatchFlow();
  }
  prevPhase = state.phase;
}

function updateWatchingReplay(dt: number): void {
  replayPlayer.update(dt);
  replayOverlay.setProgress(replayPlayer.progress);
  const snapshot = replayPlayer.getCurrentSnapshot();
  if (snapshot) {
    const positions = Object.values(snapshot.players).map((p) => p.pos);
    camera.follow(snapshot.ball.pos, positions[0] ?? snapshot.ball.pos, positions);
  }
}

function update(dt: number): void {
  if (appScreen === 'watchingReplay') {
    updateWatchingReplay(dt);
    return;
  }
  if (appScreen !== 'match') return;
  updateMatch(dt);
}

function renderPlayerWithBadge(player: Parameters<typeof renderPlayer>[2], fill: AvatarColor, label?: string): void {
  renderPlayer(ctx, camera, player, fill);
  // player-badge (seção 10.1): "patrocínio premium" — escudo pequeno no
  // avatar. Por cima do jogador, então desenhado logo depois dele, não
  // antes (a regra "atrás de jogador/bola" da seção 10.3 é só pros slots
  // de campo, isso aqui é decoração do próprio avatar).
  adManager.renderPlayerBadge(ctx, camera, player.pos, player.radius);
  if (label) renderPlayerLabel(ctx, camera, player, label);
}

// Desenha TODO mundo em campo (1v1: 2 jogadores; 2v2: 4) sem rótulo — a
// partida ao vivo nunca mostrou nome em cima de ninguém (só a tela de fim
// de jogo e o replay de gol têm rótulo, ver renderReplaySnapshot).
function renderAllPlayers(): void {
  for (const player of Object.values(state.players)) {
    renderPlayerWithBadge(player, colorFor(player), nameFor(player.id));
  }
}

function renderBallWithSkin(ball: Parameters<typeof renderBall>[2]): void {
  // ball-skin (seção 10.1): se houver criativo, substitui a textura padrão
  // da bola; sem criativo, cai pro desenho normal (com o giro do Fx —
  // durante replay usa o último giro registrado ao vivo, não recalcula
  // por snapshot, simplificação aceitável pra um detalhe cosmético).
  const spin = fx.getBallSpin();
  const pulseScale = fx.getBallPulseScale();
  if (!adManager.renderBallSkin(ctx, camera, ball.pos, ball.radius, spin, pulseScale)) {
    renderBall(ctx, camera, ball, spin, pulseScale);
  }
}

function renderReplaySnapshot(snapshot: ReplaySnapshot): void {
  const ball = ballFromSnapshot(snapshot);
  for (const id of Object.keys(snapshot.players) as PlayerId[]) {
    const player = playerFromSnapshot(id, snapshot);
    renderPlayerWithBadge(player, colorFor(player), nameFor(id));
  }
  renderBallWithSkin(ball);
}

function render(_alpha: number): void {
  camera.shakeOffsetPx = fx.getShakeOffsetPx();
  renderField(ctx, camera, window.innerWidth, window.innerHeight);

  if (appScreen === 'watchingReplay') {
    adManager.renderFieldSlots(ctx, camera);
    const snapshot = replayPlayer.getCurrentSnapshot();
    if (snapshot) renderReplaySnapshot(snapshot);
    return;
  }

  if (appScreen !== 'match' && appScreen !== 'endgame') return;

  // Slots de campo (seção 10.3): sempre atrás de jogadores/bola/FX, nunca
  // por cima da jogada.
  adManager.renderFieldSlots(ctx, camera);
  renderBallTrail(ctx, camera, fx.getBallTrail(), state.ball.radius, Math.hypot(state.ball.vel.x, state.ball.vel.y));

  if (inGoalReplayWindow) {
    const snapshot = replayPlayer.getCurrentSnapshot();
    if (snapshot) renderReplaySnapshot(snapshot);
    else {
      renderAllPlayers();
      renderBallWithSkin(state.ball);
    }
  } else {
    renderAllPlayers();
    renderBallWithSkin(state.ball);
  }

  renderParticles(ctx, camera, fx.getParticles());
  renderGoalFlash(ctx, window.innerWidth, window.innerHeight, fx.getFlashAlpha());
  renderMatchHud(ctx, window.innerWidth, window.innerHeight, state, `IA: ${aiState.fsmState}`);

  if (touch && appScreen === 'match' && !inGoalReplayWindow) {
    const localPlayer = state.players[localPlayerId]!;
    renderTouchControls(ctx, touch.getLayout(), touch.joystickVisual, localPlayer.kickCharge, localPlayer.boostStamina);
  }
}

window.addEventListener('resize', resize);
resize();

const loop = new Loop(FIXED_TIMESTEP_S, update, render);
loop.start();

// Hook de depuração só em dev — mesmo padrão que a spec já prevê pra
// telemetria de anúncios em window.__adStats (seção 10.4). Útil pra
// inspecionar/forçar estado no console sem precisar jogar uma partida
// inteira até acontecer o cenário que se quer testar.
if (import.meta.env.DEV) {
  (window as unknown as { __futtroolDebug: unknown }).__futtroolDebug = {
    getState: () => state,
    getAiState: () => aiState,
    getAppScreen: () => appScreen,
    getProgression: () => progression,
    getCamera: () => ({ centerX: camera.centerX, centerY: camera.centerY, zoom: camera.zoom, scale: camera.worldScale }),
    forceCamera: (x: number, y: number, zoom: number) => {
      camera.centerX = x;
      camera.centerY = y;
      camera.zoom = zoom;
      camera.resize(window.innerWidth, window.innerHeight);
    },
    setState: (patch: Partial<GameState>) => {
      state = { ...state, ...patch };
    },
    goToMenu,
    goToDifficulty,
    goToMatchmaking,
    goToOnlineMatchmaking,
    goToCreateOnlineRoom,
    joinOnlineRoom,
    startMatch,
    goToReplaysList,
    getP1Command: () => getP1Command(state.tick),
    isOnlineMode: () => onlineMode,
    hasOnlineClient: () => onlineClient !== null,
    // Dispara um passo do loop manualmente — útil pra testar em aba sem
    // foco (requestAnimationFrame fica pausado/throttled em background,
    // então o loop de verdade não rodaria sozinho ali).
    forceUpdateTick: () => update(FIXED_TIMESTEP_S),
    listSavedReplays: () => replayStore.list(),
  };
}
