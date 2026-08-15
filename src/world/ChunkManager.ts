import * as THREE from 'three';
import { CHUNK, POWERUP } from '../config';
import { Track } from './Track';
import { isSolvable, pickPattern, repairPattern, type ChunkPattern, type ChunkSlot } from './chunks';
import { Obstacle } from '../entities/Obstacle';
import { Coin } from '../entities/Coin';
import { Gem } from '../entities/Gem';
import { PowerUp, type PowerUpType } from '../entities/PowerUp';
import { intersects, type AABB } from '../systems/Collision';
import type { BiomePreset } from './biomes';

const MAX_OBSTACLES_PER_CHUNK = 6;
const MAX_COINS_PER_CHUNK = 12;
const MAX_GEMS_PER_CHUNK = 4;
const COIN_HEIGHT = 1.0;
const COIN_SPACING = 1.2;
const GEM_HEIGHT = 1.1;
const GEM_SPACING = 0.9;
const GROUND_WIDTH = 8;

/**
 * "Frente" é -Z. Cada chunk tem sua borda próxima (a que o player alcança
 * primeiro) na origem local do grupo, e slot.z (0..30, sempre crescente
 * "para dentro" do chunk) se traduz em -slot.z no espaço local — por isso
 * todo mundo que converte slot.z em posição local passa por `localZ`.
 */
function localZ(slotZ: number): number {
  return -slotZ;
}

/** Um "slot" de mundo reciclável: chão, faixas de pista, obstáculos, moedas e power-up. */
class ChunkInstance {
  readonly group: THREE.Group;
  private readonly obstacles: Obstacle[] = [];
  private readonly coins: Coin[] = [];
  private readonly gems: Gem[] = [];
  private readonly powerUp: PowerUp;

  constructor(
    groundGeometry: THREE.PlaneGeometry,
    groundMaterial: THREE.Material,
    laneGeometry: THREE.PlaneGeometry,
    laneMaterial: THREE.Material,
  ) {
    this.group = new THREE.Group();

    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = localZ(CHUNK.LENGTH / 2);
    ground.receiveShadow = true;
    this.group.add(ground);

    for (const x of [-1.1, 1.1]) {
      const line = new THREE.Mesh(laneGeometry, laneMaterial);
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, 0.01, localZ(CHUNK.LENGTH / 2));
      this.group.add(line);
    }

    for (let i = 0; i < MAX_OBSTACLES_PER_CHUNK; i++) {
      const obstacle = new Obstacle();
      this.obstacles.push(obstacle);
      this.group.add(obstacle.group);
    }

    for (let i = 0; i < MAX_COINS_PER_CHUNK; i++) {
      const coin = new Coin();
      this.coins.push(coin);
      this.group.add(coin.group);
    }

    for (let i = 0; i < MAX_GEMS_PER_CHUNK; i++) {
      const gem = new Gem();
      this.gems.push(gem);
      this.group.add(gem.group);
    }

    this.powerUp = new PowerUp();
    this.group.add(this.powerUp.group);
  }

  setPattern(pattern: ChunkPattern): void {
    for (const obstacle of this.obstacles) obstacle.clear();
    for (const coin of this.coins) coin.clear();
    for (const gem of this.gems) gem.clear();
    this.powerUp.clear();

    let obstacleIndex = 0;
    let coinIndex = 0;
    let gemIndex = 0;

    for (const slot of pattern.slots) {
      if (
        slot.type === 'barrier' ||
        slot.type === 'wall' ||
        slot.type === 'lowBar' ||
        slot.type === 'highBar' ||
        slot.type === 'movingBlock'
      ) {
        const obstacle = this.obstacles[obstacleIndex];
        obstacleIndex++;
        obstacle?.assign(slot.type, slot.lane, localZ(slot.z), slot.toLane);
      } else if (slot.type === 'coinLine') {
        coinIndex = this.placeCoinLine(slot, coinIndex);
      } else if (slot.type === 'coinArc') {
        coinIndex = this.placeCoinArc(slot, coinIndex);
      } else if (slot.type === 'gemCluster') {
        gemIndex = this.placeGemCluster(slot, gemIndex);
      } else if (slot.type === 'powerUp' && slot.powerUpType) {
        this.powerUp.assign(slot.powerUpType, Track.laneToX(slot.lane), 1.0, localZ(slot.z));
      }
    }
  }

  private placeCoinLine(slot: ChunkSlot, startIndex: number): number {
    const x = Track.laneToX(slot.lane);
    let index = startIndex;
    for (let i = 0; i < 5 && index < this.coins.length; i++, index++) {
      this.coins[index]?.assign(x, COIN_HEIGHT, localZ(slot.z + i * COIN_SPACING));
    }
    return index;
  }

  private placeCoinArc(slot: ChunkSlot, startIndex: number): number {
    const x = Track.laneToX(slot.lane);
    const count = 5;
    let index = startIndex;
    for (let i = 0; i < count && index < this.coins.length; i++, index++) {
      const t = i / (count - 1);
      const y = COIN_HEIGHT + Math.sin(t * Math.PI) * 0.8;
      this.coins[index]?.assign(x, y, localZ(slot.z + i * COIN_SPACING));
    }
    return index;
  }

  private placeGemCluster(slot: ChunkSlot, startIndex: number): number {
    const x = Track.laneToX(slot.lane);
    let index = startIndex;
    for (let i = 0; i < 2 && index < this.gems.length; i++, index++) {
      this.gems[index]?.assign(x, GEM_HEIGHT, localZ(slot.z + i * GEM_SPACING));
    }
    return index;
  }

  update(dt: number, elapsed: number): void {
    for (const obstacle of this.obstacles) obstacle.update(dt, elapsed);
    for (const coin of this.coins) coin.update(dt);
    for (const gem of this.gems) gem.update(dt);
    this.powerUp.update(dt);
  }

  collectObstacleAABBs(out: AABB[]): void {
    for (const obstacle of this.obstacles) {
      const box = obstacle.getWorldAABB(this.group.position.z);
      if (box) out.push(box);
    }
  }

  collectCoinPickups(playerBox: AABB): number {
    let collected = 0;
    for (const coin of this.coins) {
      const box = coin.getWorldAABB(this.group.position.z);
      if (box && intersects(playerBox, box)) {
        coin.collect();
        collected++;
      }
    }
    return collected;
  }

  collectGemPickups(playerBox: AABB): number {
    let collected = 0;
    for (const gem of this.gems) {
      const box = gem.getWorldAABB(this.group.position.z);
      if (box && intersects(playerBox, box)) {
        gem.collect();
        collected++;
      }
    }
    return collected;
  }

  checkPowerUpPickup(playerBox: AABB): PowerUpType | null {
    const box = this.powerUp.getWorldAABB(this.group.position.z);
    if (box && intersects(playerBox, box)) {
      const type = this.powerUp.activeType;
      this.powerUp.clear();
      return type;
    }
    return null;
  }

  applyMagnet(playerPos: THREE.Vector3, radius: number, pullSpeed: number, dt: number): number {
    let collected = 0;
    for (const coin of this.coins) {
      if (coin.applyMagnet(this.group.position.z, playerPos, radius, pullSpeed, dt)) collected++;
    }
    return collected;
  }

  applyMagnetToGems(playerPos: THREE.Vector3, radius: number, pullSpeed: number, dt: number): number {
    let collected = 0;
    for (const gem of this.gems) {
      if (gem.applyMagnet(this.group.position.z, playerPos, radius, pullSpeed, dt)) collected++;
    }
    return collected;
  }
}

/**
 * Mantém 6 chunks ativos (1 atrás, 5 à frente) via object pooling: recicla a
 * posição/padrão do chunk que ficou para trás, nunca cria geometria nova.
 * Como a frente é -Z, "à frente" = z mais negativo e "atrás" = z positivo;
 * o mundo desliza em +Z sob o player (que fica parado perto de z=0).
 */
export class ChunkManager {
  private readonly scene: THREE.Scene;
  private readonly instances: ChunkInstance[] = [];
  private readonly groundMaterial: THREE.MeshStandardMaterial;
  private readonly laneMaterial: THREE.MeshStandardMaterial;
  private lastPatternId: string | null = null;
  private elapsed = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const groundGeometry = new THREE.PlaneGeometry(GROUND_WIDTH, CHUNK.LENGTH);
    this.groundMaterial = new THREE.MeshStandardMaterial({ color: 0x18102a });
    const laneGeometry = new THREE.PlaneGeometry(0.08, CHUNK.LENGTH);
    this.laneMaterial = new THREE.MeshStandardMaterial({
      color: 0x2f6bff,
      emissive: 0x2f6bff,
      emissiveIntensity: 1.2,
    });

    for (let i = 0; i < CHUNK.ACTIVE_COUNT; i++) {
      const instance = new ChunkInstance(groundGeometry, this.groundMaterial, laneGeometry, this.laneMaterial);
      instance.group.position.z = -(i - CHUNK.BEHIND_COUNT) * CHUNK.LENGTH;
      instance.setPattern(this.drawPattern(0));
      this.scene.add(instance.group);
      this.instances.push(instance);
    }
  }

  /** Muta as cores já existentes do chão/faixas — aplica em todos os chunks de uma vez. */
  applyBiome(preset: BiomePreset): void {
    this.groundMaterial.color.setHex(preset.groundColor);
    this.laneMaterial.color.setHex(preset.laneColor);
    this.laneMaterial.emissive.setHex(preset.laneColor);
  }

  update(dt: number, speed: number, distance: number): void {
    this.elapsed += dt;

    for (const instance of this.instances) {
      instance.group.position.z += speed * dt;
      instance.update(dt, this.elapsed);
    }

    let minZ = Infinity;
    for (const instance of this.instances) {
      minZ = Math.min(minZ, instance.group.position.z);
    }

    const recycleThresholdZ = CHUNK.LENGTH * (CHUNK.BEHIND_COUNT + 1);
    for (const instance of this.instances) {
      if (instance.group.position.z <= recycleThresholdZ) continue;
      minZ -= CHUNK.LENGTH;
      instance.group.position.z = minZ;
      instance.setPattern(this.drawPattern(distance));
    }
  }

  getObstacleAABBs(): AABB[] {
    const boxes: AABB[] = [];
    for (const instance of this.instances) instance.collectObstacleAABBs(boxes);
    return boxes;
  }

  /** Coleta moedas sobrepostas pela caixa do player; retorna quantas foram pegas neste frame. */
  checkCoinPickups(playerBox: AABB): number {
    let total = 0;
    for (const instance of this.instances) total += instance.collectCoinPickups(playerBox);
    return total;
  }

  /** Coleta gemas sobrepostas pela caixa do player; retorna quantas foram pegas neste frame. */
  checkGemPickups(playerBox: AABB): number {
    let total = 0;
    for (const instance of this.instances) total += instance.collectGemPickups(playerBox);
    return total;
  }

  /** Retorna o tipo do power-up pego neste frame, se algum. */
  checkPowerUpPickups(playerBox: AABB): PowerUpType | null {
    for (const instance of this.instances) {
      const type = instance.checkPowerUpPickup(playerBox);
      if (type) return type;
    }
    return null;
  }

  /** Puxa moedas próximas ao player enquanto o ímã está ativo; retorna quantas foram coletadas. */
  applyMagnet(playerPos: THREE.Vector3, radius: number, dt: number): number {
    let total = 0;
    for (const instance of this.instances) {
      total += instance.applyMagnet(playerPos, radius, POWERUP.MAGNET_PULL_SPEED, dt);
    }
    return total;
  }

  /** Puxa gemas próximas ao player enquanto o ímã está ativo; retorna quantas foram coletadas. */
  applyMagnetToGems(playerPos: THREE.Vector3, radius: number, dt: number): number {
    let total = 0;
    for (const instance of this.instances) {
      total += instance.applyMagnetToGems(playerPos, radius, POWERUP.MAGNET_PULL_SPEED, dt);
    }
    return total;
  }

  reset(): void {
    this.lastPatternId = null;
    this.elapsed = 0;
    this.instances.forEach((instance, i) => {
      instance.group.position.z = -(i - CHUNK.BEHIND_COUNT) * CHUNK.LENGTH;
      instance.setPattern(this.drawPattern(0));
    });
  }

  private drawPattern(distance: number): ChunkPattern {
    const picked = pickPattern(distance, this.lastPatternId);
    const pattern = isSolvable(picked) ? picked : repairPattern(picked);
    this.lastPatternId = pattern.id;
    return pattern;
  }
}
