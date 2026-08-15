import * as THREE from 'three';
import { Environment } from '../world/Environment';
import { TerrainMesh } from '../world/TerrainMesh';
import { CheckpointCourse } from '../world/CheckpointCourse';
import { isOverAirstrip, terrainHeight } from '../world/Terrain';
import { Aircraft, type FlightAxes } from '../entities/Aircraft';
import { Storage } from './Storage';
import { Audio } from './Audio';
import type { ThrottleDirection } from './Input';
import { AIRCRAFT, AIRSTRIP, CAMERA, CHECKPOINT, FUEL, SCORE } from '../config';

export const GameState = {
  MENU: 'MENU',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  GAME_OVER: 'GAME_OVER',
} as const;
export type GameState = (typeof GameState)[keyof typeof GameState];

export type GameOverReason = 'fuel' | 'crash' | null;

const UP = new THREE.Vector3(0, 1, 0);

/** Máquina de estados do Fly Simulator — mesmo padrão do runner, física/mundo próprios. */
export class Game {
  readonly environment: Environment;
  readonly camera: THREE.PerspectiveCamera;
  readonly aircraft: Aircraft;
  readonly terrain: TerrainMesh;
  readonly checkpoints: CheckpointCourse;

  state: GameState = GameState.MENU;
  isNewHighscore = false;
  private gameOverReason: GameOverReason = null;
  private fuel = FUEL.START_S;
  private distanceFlown = 0;
  private checkpointsPassedTotal = 0;
  private landings = 0;

  private readonly desiredCameraPos = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private readonly cameraUp = new THREE.Vector3(0, 1, 0);
  private readonly tmpUp = new THREE.Vector3();

  constructor(aspect: number) {
    this.environment = new Environment();
    this.terrain = new TerrainMesh();
    this.environment.scene.add(this.terrain.group);

    this.checkpoints = new CheckpointCourse();
    this.environment.scene.add(this.checkpoints.group);

    this.aircraft = new Aircraft();
    this.environment.scene.add(this.aircraft.group);

    this.camera = new THREE.PerspectiveCamera(CAMERA.FOV, aspect, CAMERA.NEAR, CAMERA.FAR);
    this.placeAircraftAtSpawn();
    this.snapCameraToAircraft();
  }

  handleAction(action: 'pause'): void {
    if (action === 'pause') this.togglePause();
  }

  togglePause(): void {
    if (this.state === GameState.PLAYING) {
      this.state = GameState.PAUSED;
      Audio.stopEngine();
    } else if (this.state === GameState.PAUSED) {
      this.state = GameState.PLAYING;
      Audio.startEngine();
    }
  }

  returnToMenu(): void {
    this.state = GameState.MENU;
    Audio.stopEngine();
  }

  reset(): void {
    this.fuel = FUEL.START_S;
    this.distanceFlown = 0;
    this.checkpointsPassedTotal = 0;
    this.landings = 0;
    this.gameOverReason = null;
    this.isNewHighscore = false;
    this.checkpoints.reset();
    this.placeAircraftAtSpawn();
    this.snapCameraToAircraft();
    this.state = GameState.PLAYING;
    Audio.startEngine();
  }

  private placeAircraftAtSpawn(): void {
    const x = AIRSTRIP.CENTER_X;
    const z = AIRSTRIP.CENTER_Z;
    const y = terrainHeight(x, z) + AIRCRAFT.START_ALTITUDE;
    this.aircraft.reset(x, y, z, 0);
  }

  private snapCameraToAircraft(): void {
    this.updateCameraTargets();
    this.camera.position.copy(this.desiredCameraPos);
    this.cameraUp.set(0, 1, 0);
    this.camera.up.copy(this.cameraUp);
    this.camera.lookAt(this.lookTarget);
  }

  update(dt: number, axes: FlightAxes, throttleDirection: ThrottleDirection): void {
    if (this.state !== GameState.PLAYING) return;

    this.aircraft.setThrottleDelta(throttleDirection, dt);
    this.aircraft.update(dt, axes);
    Audio.updateEngine(this.aircraft.throttleValue);

    this.distanceFlown += this.aircraft.airspeedValue * dt;

    this.fuel -= dt;
    if (this.fuel <= 0) {
      this.fuel = 0;
      this.endRun('fuel');
      return;
    }

    if (this.checkpoints.checkPass(this.aircraft.position)) {
      this.checkpointsPassedTotal++;
      this.fuel = Math.min(this.fuel + CHECKPOINT.FUEL_BONUS_S, FUEL.START_S * 2);
      Audio.checkpoint();
    }

    if (this.checkGroundInteraction()) return;

    this.updateCamera();
    this.environment.followTarget(this.aircraft.position);
  }

  /** Retorna true se o jogo terminou (colisão fatal) neste frame. */
  private checkGroundInteraction(): boolean {
    const { x, y, z } = this.aircraft.position;
    const ground = terrainHeight(x, z);
    const belly = y - AIRCRAFT.GROUND_CLEARANCE;
    if (belly > ground) return false;

    const overStrip = isOverAirstrip(x, z);
    const safeSpeed = this.aircraft.airspeedValue <= AIRCRAFT.LANDING_MAX_SPEED;
    const safeSink = Math.abs(this.aircraft.verticalSpeedValue) <= AIRCRAFT.LANDING_MAX_SINK_SPEED;

    if (overStrip && safeSpeed && safeSink) {
      this.aircraft.position.y = ground + AIRCRAFT.GROUND_CLEARANCE;
      this.landings++;
      this.fuel = Math.min(this.fuel + FUEL.LANDING_BONUS_S, FUEL.START_S * 2);
      Audio.landing();
      return false;
    }

    this.endRun('crash');
    return true;
  }

  private endRun(reason: Exclude<GameOverReason, null>): void {
    this.state = GameState.GAME_OVER;
    this.gameOverReason = reason;
    this.isNewHighscore = Storage.setHighscoreIfBetter(this.score);
    Audio.stopEngine();
    if (reason === 'fuel') Audio.outOfFuel();
    else Audio.crash();
  }

  private updateCameraTargets(): void {
    this.desiredCameraPos
      .copy(this.aircraft.position)
      .addScaledVector(this.aircraft.forwardVector, -CAMERA.OFFSET.z)
      .addScaledVector(UP, CAMERA.OFFSET.y);
    this.lookTarget.copy(this.aircraft.position).addScaledVector(this.aircraft.forwardVector, CAMERA.LOOK_AHEAD);
  }

  /**
   * Câmera terceira-pessoa que segue posição/direção com lag, ignorando o
   * rolamento do avião (mais jogável) — exceto perto de voo vertical, onde
   * o `lookAt` com "up" do mundo degenera (pisca/trava). Nessa faixa troca a
   * referência de "up" pro `upVector` do próprio avião: por construção ele é
   * sempre perpendicular ao `forwardVector` (mesma base ortonormal do
   * quaternion), então nunca é paralelo à direção da câmera — ao contrário
   * da tentativa anterior de misturar os dois vetores por um fator só, que
   * podia interpolar exatamente entre dois vetores opostos (durante um loop
   * completo, de cabeça pra baixo) e passar por um vetor de comprimento
   * zero no meio do caminho, travando a câmera de verdade.
   */
  private updateCamera(): void {
    this.updateCameraTargets();
    this.camera.position.lerp(this.desiredCameraPos, CAMERA.FOLLOW_LERP);

    const forward = this.aircraft.forwardVector;
    this.tmpUp.copy(Math.abs(forward.dot(UP)) > CAMERA.UP_REFERENCE_SWITCH_DOT ? this.aircraft.upVector : UP);
    this.cameraUp.lerp(this.tmpUp, CAMERA.UP_SMOOTHING);
    if (this.cameraUp.lengthSq() < 1e-6) this.cameraUp.copy(this.tmpUp);
    this.camera.up.copy(this.cameraUp).normalize();
    this.camera.lookAt(this.lookTarget);
  }

  get distanceFlownValue(): number {
    return this.distanceFlown;
  }

  get fuelRemaining(): number {
    return this.fuel;
  }

  get fuelFraction(): number {
    return Math.max(0, Math.min(1, this.fuel / FUEL.START_S));
  }

  get checkpointsPassedValue(): number {
    return this.checkpointsPassedTotal;
  }

  get landingsValue(): number {
    return this.landings;
  }

  get altitudeAboveGround(): number {
    const { x, y, z } = this.aircraft.position;
    return Math.max(0, y - terrainHeight(x, z));
  }

  get gameOverReasonValue(): GameOverReason {
    return this.gameOverReason;
  }

  /** Distância, rumo relativo (rad, 0 = na frente, + = à direita) e diferença de altitude até o próximo checkpoint — usado pela seta do HUD. */
  get nextCheckpointInfo(): { distance: number; bearing: number; verticalDelta: number } | null {
    const target = this.checkpoints.nextTarget;
    if (!target) return null;

    const pos = this.aircraft.position;
    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    const dz = target.z - pos.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const forward = this.aircraft.forwardVector;
    const dirLenSq = dx * dx + dz * dz;
    let bearing = 0;
    if (dirLenSq > 0.0001) {
      const invLen = 1 / Math.sqrt(dirLenSq);
      const ndx = dx * invLen;
      const ndz = dz * invLen;
      const cross = forward.x * ndz - forward.z * ndx;
      const dot = forward.x * ndx + forward.z * ndz;
      bearing = Math.atan2(cross, dot);
    }

    return { distance, bearing, verticalDelta: dy };
  }

  get score(): number {
    return (
      Math.floor(this.distanceFlown / SCORE.DISTANCE_PER_POINT) +
      this.checkpointsPassedTotal * CHECKPOINT.VALUE +
      this.landings * SCORE.LANDING_BONUS
    );
  }
}
