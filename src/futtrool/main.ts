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
import { FIXED_TIMESTEP_S, MATCH, REPLAY } from './core/constants';
import { step } from './core/simulation';
import { createMatchState } from './core/rules';
import type { Command, GameState } from './core/types';
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
import { applyXp, calculateMatchReward, xpForLevel, type MatchOutcome } from './progression/economy';
import { ballFromSnapshot, playerFromSnapshot, ReplayBuffer, type ReplaySnapshot } from './replay/buffer';
import { ReplayPlayer } from './replay/player';
import { ReplayStore, type SavedReplay } from './replay/storage';
import { adManager } from './ads/adManager';
import type { AdsConfig } from './ads/types';

// Sistema de publicidade (spec seção 10) — carregado uma vez no boot.
// Trocar campanha é só editar o JSON e recarregar (seção 10.5), sem
// rebuild. O fetch dispara aqui em cima (cedo), mas o `.then()` que usa as
// telas só é registrado mais embaixo, depois delas existirem (a promise só
// resolve depois do script síncrono terminar de qualquer forma, então a
// ordem de declaração não importa pra corretude — só pra legibilidade).
const adsConfigPromise = fetch('/futtrool/ads.config.json').then((res) => res.json() as Promise<AdsConfig>);

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

function getP1Command(tick: number): Command {
  const fromKeyboard = keyboard.getCommand('p1', tick);
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

type AppScreen = 'menu' | 'difficulty' | 'matchmaking' | 'match' | 'endgame' | 'replays' | 'watchingReplay';
let appScreen: AppScreen = 'menu';
let chosenDifficulty: AiDifficulty = 'profissional';

const progressionStore = new ProgressionStore();
let progression: ProgressionState = progressionStore.load();

const replayStore = new ReplayStore();
const replayBuffer = new ReplayBuffer();
const replayPlayer = new ReplayPlayer();
// true durante a janela de replay de verdade dentro da fase 'goal' (depois
// do congelamento de MATCH.GOAL_FREEZE_MS) — antes disso é só o congelamento
// mostrando o estado ao vivo parado, não o replay tocando.
let inGoalReplayWindow = false;

let state: GameState = createMatchState(1, MATCH.KICKOFF_COUNTDOWN_MS);
let aiState: AiState = createAiState(Date.now());
let prevPhase = state.phase;

function hideAllScreens(): void {
  menuScreen.hide();
  difficultyScreen.hide();
  matchmakingScreen.hide();
  endGameScreen.hide();
  savedReplaysScreen.hide();
  replayOverlay.hide();
}

function goToMenu(): void {
  appScreen = 'menu';
  hideAllScreens();
  adManager.trackDomSlotHidden('scoreboard-sponsor');
  menuScreen.show(progression);
}

function goToDifficulty(): void {
  appScreen = 'difficulty';
  hideAllScreens();
  difficultyScreen.show();
}

function goToMatchmaking(difficulty: AiDifficulty): void {
  chosenDifficulty = difficulty;
  appScreen = 'matchmaking';
  hideAllScreens();
  matchmakingScreen.show(AI_PROFILES[difficulty].label, startMatch);
}

function startMatch(): void {
  state = createMatchState(Date.now(), MATCH.KICKOFF_COUNTDOWN_MS);
  aiState = createAiState(Date.now());
  fx.reset();
  replayBuffer.clear();
  inGoalReplayWindow = false;
  camera.centerX = state.ball.pos.x;
  camera.centerY = state.ball.pos.y;
  camera.zoom = 1;
  prevPhase = state.phase;
  appScreen = 'match';
  hideAllScreens();
  adManager.trackDomSlotShown('scoreboard-sponsor');
}

function endMatchFlow(): void {
  // A partir daqui `update()` para de chamar `fx.update(dt)` (só roda com
  // appScreen === 'match'), então o shakeTimer do último gol ficaria
  // travado num valor > 0 pra sempre — e o render() continua chamando
  // `fx.getShakeOffsetPx()` a cada quadro, gerando um offset aleatório
  // novo (tremedeira infinita) em vez de decair. Zera os efeitos aqui pra
  // a tela de fim de jogo ficar parada.
  fx.reset();

  const outcome: MatchOutcome = state.result === 'p1' ? 'win' : state.result === 'p2' ? 'loss' : 'draw';
  const reward = calculateMatchReward(outcome, state.score.p1, progression.winStreak);
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

  appScreen = 'endgame';
  hideAllScreens();
  endGameScreen.show({
    outcome,
    score: state.score,
    difficultyLabel: AI_PROFILES[chosenDifficulty].label,
    reward,
    levelAfter,
  });
}

function goToReplaysList(): void {
  appScreen = 'replays';
  hideAllScreens();
  savedReplaysScreen.show(replayStore.list());
}

function watchSavedReplay(replay: SavedReplay): void {
  appScreen = 'watchingReplay';
  hideAllScreens();
  replayPlayer.start(replay.snapshots);
  replayOverlay.show('watch');
}

function deleteSavedReplay(id: string): void {
  replayStore.remove(id);
  savedReplaysScreen.show(replayStore.list());
}

// Reagir/Salvar/Pular durante o replay automático de gol (spec seção 8).
function reactToGoalReplay(): void {
  progression = { ...progression, coins: progression.coins + 1 };
  progressionStore.save(progression);
  replayOverlay.markReacted();
}

function saveGoalReplay(): void {
  replayStore.save(state.score, replayBuffer.getAll());
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

const menuScreen = new MenuScreen(goToDifficulty, goToReplaysList);
const difficultyScreen = new DifficultyScreen(goToMatchmaking, goToMenu);
const matchmakingScreen = new MatchmakingScreen(goToMenu);
const endGameScreen = new EndGameScreen(goToMenu, () => goToMatchmaking(chosenDifficulty));
const savedReplaysScreen = new SavedReplaysScreen(watchSavedReplay, deleteSavedReplay, goToMenu);
const replayOverlay = new ReplayOverlay(reactToGoalReplay, saveGoalReplay, onReplayOverlaySkipOrBack);

goToMenu();

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
  })
  .catch((err) => {
    if (import.meta.env.DEV) console.error('[futtrool] falha ao carregar ads.config.json', err);
  });

// ---------------------------------------------------------------------------
// Loop de jogo — sempre rodando a 60Hz; só simula/renderiza a partida de
// verdade quando appScreen === 'match'. Nas outras telas o canvas fica
// parado no último quadro (as telas de UI cobrem tudo por cima via DOM).
// ---------------------------------------------------------------------------

function updateMatch(dt: number): void {
  const p1 = getP1Command(state.tick);
  // A IA só produz Command a partir do GameState — mesma regra de qualquer
  // jogador (seção 5 da spec: sem acesso privilegiado).
  const aiDecision = decideCommand(state, aiState, AI_PROFILES[chosenDifficulty], 'p2', dt);
  aiState = aiDecision.aiState;

  const result = step(state, { p1, p2: aiDecision.command }, dt);
  state = result.state;

  // Câmera atualizada no passo fixo (não no render) pra a suavização (lerp
  // flat, seção 11) não depender da taxa de atualização do monitor.
  camera.follow(state.ball.pos, state.players.p1.pos, state.players.p2.pos);

  if (state.phase === 'playing' || prevPhase === 'playing') {
    fx.recordBallPosition(state.ball.pos);
    fx.updateBallSpin(Math.hypot(state.ball.vel.x, state.ball.vel.y), state.ball.radius, dt);
    replayBuffer.record(state);
  }
  fx.update(dt);
  adManager.trackFieldVisibility(camera, dt);

  for (const event of result.events) {
    switch (event.type) {
      case 'kick':
        Audio.kick(event.charge);
        fx.spawnKickParticles(event.pos, event.dir, event.charge);
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

  if (state.phase === 'ended' && prevPhase !== 'ended') endMatchFlow();
  prevPhase = state.phase;
}

function updateWatchingReplay(dt: number): void {
  replayPlayer.update(dt);
  replayOverlay.setProgress(replayPlayer.progress);
  const snapshot = replayPlayer.getCurrentSnapshot();
  if (snapshot) camera.follow(snapshot.ball.pos, snapshot.players.p1.pos, snapshot.players.p2.pos);
}

function update(dt: number): void {
  if (appScreen === 'watchingReplay') {
    updateWatchingReplay(dt);
    return;
  }
  if (appScreen !== 'match') return;
  updateMatch(dt);
}

function renderPlayerWithBadge(player: Parameters<typeof renderPlayer>[2], color: string, label?: string): void {
  renderPlayer(ctx, camera, player, color);
  // player-badge (seção 10.1): "patrocínio premium" — escudo pequeno no
  // avatar. Por cima do jogador, então desenhado logo depois dele, não
  // antes (a regra "atrás de jogador/bola" da seção 10.3 é só pros slots
  // de campo, isso aqui é decoração do próprio avatar).
  adManager.renderPlayerBadge(ctx, camera, player.pos, player.radius);
  if (label) renderPlayerLabel(ctx, camera, player, label);
}

function renderBallWithSkin(ball: Parameters<typeof renderBall>[2]): void {
  // ball-skin (seção 10.1): se houver criativo, substitui a textura padrão
  // da bola; sem criativo, cai pro desenho normal (com o giro do Fx —
  // durante replay usa o último giro registrado ao vivo, não recalcula
  // por snapshot, simplificação aceitável pra um detalhe cosmético).
  if (!adManager.renderBallSkin(ctx, camera, ball.pos, ball.radius, fx.getBallSpin())) {
    renderBall(ctx, camera, ball, fx.getBallSpin());
  }
}

function renderReplaySnapshot(snapshot: ReplaySnapshot): void {
  const p1 = playerFromSnapshot('p1', snapshot);
  const p2 = playerFromSnapshot('p2', snapshot);
  const ball = ballFromSnapshot(snapshot);

  renderPlayerWithBadge(p1, THEME.TEAM_1, t('hud.you'));
  renderPlayerWithBadge(p2, THEME.TEAM_2, `IA (${AI_PROFILES[chosenDifficulty].label})`);
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
      renderPlayerWithBadge(state.players.p1, THEME.TEAM_1);
      renderPlayerWithBadge(state.players.p2, THEME.TEAM_2);
      renderBallWithSkin(state.ball);
    }
  } else {
    renderPlayerWithBadge(state.players.p1, THEME.TEAM_1);
    renderPlayerWithBadge(state.players.p2, THEME.TEAM_2);
    renderBallWithSkin(state.ball);
  }

  renderParticles(ctx, camera, fx.getParticles());
  renderGoalFlash(ctx, window.innerWidth, window.innerHeight, fx.getFlashAlpha());
  renderMatchHud(ctx, window.innerWidth, window.innerHeight, state, `IA: ${aiState.fsmState}`);

  if (touch && appScreen === 'match' && !inGoalReplayWindow) {
    renderTouchControls(ctx, touch.getLayout(), touch.joystickVisual, state.players.p1.kickCharge, state.players.p1.boostStamina);
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
    startMatch,
    goToReplaysList,
    listSavedReplays: () => replayStore.list(),
  };
}
