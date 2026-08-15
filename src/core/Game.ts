import * as THREE from 'three';
import { Environment } from '../world/Environment';
import { ChunkManager } from '../world/ChunkManager';
import { Player } from '../entities/Player';
import type { PowerUpType } from '../entities/PowerUp';
import type { CharacterId } from '../entities/characters';
import { ImpactParticles } from '../entities/ImpactParticles';
import { resolveCollision } from '../systems/Collision';
import { calculateScore } from '../systems/Score';
import { nextSpeed } from '../systems/Difficulty';
import { Storage } from './Storage';
import { Audio } from './Audio';
import type { PlayerAction } from './Input';
import { CAMERA, COLLISION, POWERUP, RUN } from '../config';

export const GameState = {
  MENU: 'MENU',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  GAME_OVER: 'GAME_OVER',
} as const;
export type GameState = (typeof GameState)[keyof typeof GameState];

/**
 * Player parado em Z (corrida no lugar) — é o mundo (ChunkManager) que rola
 * em direção a ele. Câmera acompanha o X do player com lag.
 */
export class Game {
  readonly environment: Environment;
  readonly camera: THREE.PerspectiveCamera;
  readonly player: Player;
  readonly chunkManager: ChunkManager;
  private readonly impactParticles: ImpactParticles;

  state: GameState = GameState.MENU;
  isNewHighscore = false;
  private distance = 0;
  private speed = RUN.INITIAL_SPEED;
  private coinsThisRun = 0;

  private activePowerUp: PowerUpType | null = null;
  private powerUpDuration = 0;
  private powerUpRemaining = 0;

  constructor(aspect: number) {
    this.environment = new Environment();
    this.chunkManager = new ChunkManager(this.environment.scene);
    this.player = new Player(Storage.getSelectedCharacter());
    this.environment.scene.add(this.player.group);

    this.impactParticles = new ImpactParticles();
    this.environment.scene.add(this.impactParticles.group);

    this.camera = new THREE.PerspectiveCamera(CAMERA.FOV, aspect, CAMERA.NEAR, CAMERA.FAR);
    this.camera.position.set(CAMERA.OFFSET.x, CAMERA.OFFSET.y, CAMERA.OFFSET.z);
    this.camera.lookAt(CAMERA.LOOK_AT_OFFSET.x, CAMERA.LOOK_AT_OFFSET.y, CAMERA.LOOK_AT_OFFSET.z);
  }

  handleAction(action: PlayerAction): void {
    if (action === 'pause') {
      this.togglePause();
      return;
    }
    if (this.state !== GameState.PLAYING) return;

    switch (action) {
      case 'moveLeft':
        this.player.requestLaneChange(-1);
        break;
      case 'moveRight':
        this.player.requestLaneChange(1);
        break;
      case 'jump':
        if (this.player.jump()) Audio.jump();
        break;
      case 'slide':
        if (this.player.slide()) Audio.slide();
        break;
    }
  }

  togglePause(): void {
    if (this.state === GameState.PLAYING) {
      this.state = GameState.PAUSED;
    } else if (this.state === GameState.PAUSED) {
      this.state = GameState.PLAYING;
    }
  }

  returnToMenu(): void {
    this.state = GameState.MENU;
  }

  /** Troca o personagem (preview ao vivo no menu) e persiste a escolha. */
  setCharacter(id: CharacterId): void {
    this.player.setCharacter(id);
    Storage.setSelectedCharacter(id);
  }

  update(dt: number): void {
    // Roda mesmo fora de PLAYING pra deixar o burst de partículas terminar
    // de cair/sumir em vez de congelar no meio da animação no game over.
    this.impactParticles.update(dt);
    if (this.state !== GameState.PLAYING) return;

    this.updatePowerUpTimer(dt);

    this.speed = this.activePowerUp === 'boost' ? RUN.MAX_SPEED : nextSpeed(this.speed, dt);
    this.distance += this.speed * dt;

    this.player.update(dt);
    this.chunkManager.update(dt, this.speed, this.distance);

    const coinsPicked = this.chunkManager.checkCoinPickups(this.player.getWorldAABB());
    const coinsPulled =
      this.activePowerUp === 'magnet'
        ? this.chunkManager.applyMagnet(this.player.position, POWERUP.MAGNET_RADIUS, dt)
        : 0;
    this.coinsThisRun += coinsPicked + coinsPulled;
    if (coinsPicked + coinsPulled > 0) Audio.coin();

    this.checkPowerUpPickup();

    this.checkCollisions();
    this.updateCamera();
  }

  private checkPowerUpPickup(): void {
    const type = this.chunkManager.checkPowerUpPickups(this.player.getWorldAABB());
    if (!type) return;

    this.activePowerUp = type;
    this.powerUpDuration = type === 'boost' ? POWERUP.BOOST_DURATION_S : POWERUP.DURATION_S;
    this.powerUpRemaining = this.powerUpDuration;
    if (type === 'boost') {
      this.player.grantInvulnerability(POWERUP.BOOST_DURATION_S);
    }
    Audio.powerUp();
  }

  private updatePowerUpTimer(dt: number): void {
    if (!this.activePowerUp) return;
    this.powerUpRemaining -= dt;
    if (this.powerUpRemaining <= 0) {
      this.activePowerUp = null;
      this.powerUpDuration = 0;
      this.powerUpRemaining = 0;
    }
  }

  private checkCollisions(): void {
    if (this.player.invulnerable) return;

    const outcome = resolveCollision(
      this.player.getWorldAABB(),
      this.chunkManager.getObstacleAABBs(),
      this.player.changingLane,
    );

    if (outcome === 'fatal') {
      if (this.activePowerUp === 'shield') {
        this.activePowerUp = null;
        this.powerUpDuration = 0;
        this.powerUpRemaining = 0;
        this.player.grantInvulnerability(COLLISION.SIDE_SCRAPE_INVULN_S);
        Audio.shieldBreak();
        this.impactParticles.burst(this.player.position, 0x4dffb0);
        return;
      }
      this.state = GameState.GAME_OVER;
      this.isNewHighscore = Storage.setHighscoreIfBetter(this.score);
      Storage.addCoins(this.coinsThisRun);
      Audio.gameOver();
      this.impactParticles.burst(this.player.position, 0xff4d4d);
    } else if (outcome === 'scrape') {
      this.player.applySideScrape();
      Audio.scrape();
      this.impactParticles.burst(this.player.position, 0xffe08a);
    }
  }

  /** Reinício limpo: reaproveita toda a cena via pooling, só zera o estado transiente. */
  reset(): void {
    this.distance = 0;
    this.speed = RUN.INITIAL_SPEED;
    this.coinsThisRun = 0;
    this.isNewHighscore = false;
    this.activePowerUp = null;
    this.powerUpDuration = 0;
    this.powerUpRemaining = 0;
    this.player.reset();
    this.chunkManager.reset();
    this.camera.position.set(CAMERA.OFFSET.x, CAMERA.OFFSET.y, CAMERA.OFFSET.z);
    this.camera.lookAt(CAMERA.LOOK_AT_OFFSET.x, CAMERA.LOOK_AT_OFFSET.y, CAMERA.LOOK_AT_OFFSET.z);
    this.camera.fov = CAMERA.FOV;
    this.camera.updateProjectionMatrix();
    this.state = GameState.PLAYING;
  }

  private updateCamera(): void {
    const targetX = this.player.position.x + CAMERA.OFFSET.x;
    this.camera.position.x += (targetX - this.camera.position.x) * CAMERA.FOLLOW_LERP_X;
    this.camera.position.y = CAMERA.OFFSET.y;
    this.camera.position.z = CAMERA.OFFSET.z;
    // Mira ao longo do próprio X (com lag) da câmera, não do player direto —
    // senão a câmera se auto-recentraliza a cada frame e a troca de pista
    // fica invisível na tela.
    this.camera.lookAt(
      this.camera.position.x,
      CAMERA.LOOK_AT_OFFSET.y,
      CAMERA.LOOK_AT_OFFSET.z,
    );

    const targetFov = this.activePowerUp === 'boost' ? POWERUP.BOOST_FOV_TO : POWERUP.BOOST_FOV_FROM;
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 0.1);
      this.camera.updateProjectionMatrix();
    }
  }

  get distanceTravelled(): number {
    return this.distance;
  }

  get coinsCollected(): number {
    return this.coinsThisRun;
  }

  get score(): number {
    const multiplier = this.activePowerUp === 'multiplier' ? 2 : 1;
    return calculateScore(this.distance, this.coinsThisRun, multiplier);
  }

  get activePowerUpType(): PowerUpType | null {
    return this.activePowerUp;
  }

  /** Fração de tempo restante do power-up ativo, de 1 (recém-pego) a 0 (acabando). */
  get powerUpProgress(): number {
    if (!this.activePowerUp || this.powerUpDuration <= 0) return 0;
    return Math.max(0, this.powerUpRemaining / this.powerUpDuration);
  }
}
