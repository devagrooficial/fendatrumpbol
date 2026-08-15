import * as THREE from 'three';
import { Game, GameState } from './core/Game';
import { Loop } from '../shared/Loop';
import { Input } from './core/Input';
import { GameOverScreen, MenuScreen, PauseScreen } from './ui/Screens';
import { HUD } from './ui/HUD';
import { FIXED_TIMESTEP_S } from './config';
import './ui/styles.css';

const canvas = document.querySelector<HTMLCanvasElement>('#app');
if (!canvas) throw new Error('Canvas #app não encontrado');

let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch {
  const message = document.createElement('div');
  message.className = 'webgl-error';
  message.textContent =
    'Não foi possível iniciar o WebGL neste navegador. Tenta abrir num navegador atualizado (Safari ou Chrome).';
  document.body.appendChild(message);
  throw new Error('WebGL indisponível');
}
renderer.shadowMap.enabled = true;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const game = new Game(window.innerWidth / window.innerHeight);
const input = new Input(canvas, (action) => game.handleAction(action));

function startOrRestart(): void {
  game.reset();
}

const menuScreen = new MenuScreen(game, startOrRestart);
const gameOverScreen = new GameOverScreen(game, startOrRestart);
const pauseScreen = new PauseScreen(
  game,
  () => game.togglePause(),
  startOrRestart,
  () => game.returnToMenu(),
);
const hud = new HUD(game, () => game.togglePause());

function resize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight);
  game.camera.aspect = window.innerWidth / window.innerHeight;
  game.camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 100));
window.visualViewport?.addEventListener('resize', resize);
resize();

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === GameState.PLAYING) game.togglePause();
});

const loop = new Loop(
  FIXED_TIMESTEP_S,
  (dt) => game.update(dt, input.getAxes(), input.getThrottleDirection()),
  () => {
    renderer.render(game.environment.scene, game.camera);
    menuScreen.sync();
    gameOverScreen.sync();
    pauseScreen.sync();
    hud.sync();
  },
);
loop.start();
