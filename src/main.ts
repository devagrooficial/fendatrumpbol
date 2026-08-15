import * as THREE from 'three';
import { Game, GameState } from './core/Game';
import { Loop } from './core/Loop';
import { Input } from './core/Input';
import { GameOverScreen, MenuScreen, PauseScreen, RankingScreen } from './ui/Screens';
import { HUD } from './ui/HUD';
import './ui/styles.css';

const canvas = document.querySelector<HTMLCanvasElement>('#app');
if (!canvas) throw new Error('Canvas #app não encontrado');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const game = new Game(window.innerWidth / window.innerHeight);
new Input(canvas, (action) => game.handleAction(action));

function logSceneStats(): void {
  if (import.meta.env.DEV) {
    console.log(`[dev] scene.children.length = ${game.environment.scene.children.length}`);
  }
}

function startOrRestart(): void {
  game.reset();
  logSceneStats();
}

const rankingScreen = new RankingScreen(() => {});
const menuScreen = new MenuScreen(game, startOrRestart, () => void rankingScreen.open());
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
resize();

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === GameState.PLAYING) game.togglePause();
});

const loop = new Loop(
  (dt) => game.update(dt),
  () => {
    renderer.render(game.environment.scene, game.camera);
    menuScreen.sync();
    gameOverScreen.sync();
    pauseScreen.sync();
    hud.sync();
  },
);
loop.start();
