import * as THREE from 'three';
import { Track, type Lane } from '../world/Track';
import type { AABB } from '../systems/Collision';

export type ObstacleType = 'barrier' | 'lowBar' | 'highBar' | 'wall' | 'movingBlock';

/** Meias-dimensões locais de cada tipo, espelhando a geometria construída abaixo. */
const HITBOX_BY_TYPE: Record<ObstacleType, { halfX: number; minY: number; maxY: number; halfZ: number }> = {
  barrier: { halfX: 0.8, minY: 0, maxY: 1.8, halfZ: 0.25 },
  wall: { halfX: 0.8, minY: 0, maxY: 1.8, halfZ: 0.25 },
  lowBar: { halfX: 0.8, minY: 0, maxY: 0.8, halfZ: 0.25 },
  highBar: { halfX: 0.9, minY: 1.025, maxY: 1.275, halfZ: 0.15 },
  movingBlock: { halfX: 0.7, minY: 0, maxY: 1.6, halfZ: 0.25 },
};

const BARRIER_COLOR = 0xff4d4d;
const WALL_COLOR = 0xff8a3d;
const LOWBAR_COLOR = 0x4dd2ff;
const HIGHBAR_COLOR = 0xffd24d;
const MOVING_COLOR = 0xb84dff;
const MOVE_PERIOD_S = 2;

function boxMaterial(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3 });
}

/**
 * Contém um mesh pré-construído para cada tipo de obstáculo; `assign` só
 * alterna visibilidade/posição — nenhuma geometria é criada em runtime.
 */
export class Obstacle {
  readonly group: THREE.Group;
  private readonly barrier: THREE.Mesh;
  private readonly wall: THREE.Mesh;
  private readonly lowBar: THREE.Mesh;
  private readonly highBar: THREE.Group;
  private readonly movingBlock: THREE.Mesh;

  private type: ObstacleType | null = null;
  private fromX = 0;
  private toX = 0;

  constructor() {
    this.group = new THREE.Group();
    this.group.visible = false;

    this.barrier = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 0.5), boxMaterial(BARRIER_COLOR));
    this.barrier.position.y = 0.9;
    this.barrier.castShadow = true;

    this.wall = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 0.5), boxMaterial(WALL_COLOR));
    this.wall.position.y = 0.9;
    this.wall.castShadow = true;

    this.lowBar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 0.5), boxMaterial(LOWBAR_COLOR));
    this.lowBar.position.y = 0.4;
    this.lowBar.castShadow = true;

    this.highBar = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.25, 0.3), boxMaterial(HIGHBAR_COLOR));
    bar.position.y = 1.15;
    bar.castShadow = true;
    const poleGeometry = new THREE.CylinderGeometry(0.06, 0.06, 1.15, 6);
    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x333344 });
    for (const x of [-0.85, 0.85]) {
      const pole = new THREE.Mesh(poleGeometry, poleMaterial);
      pole.position.set(x, 0.575, 0);
      this.highBar.add(pole);
    }
    this.highBar.add(bar);

    this.movingBlock = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 0.5), boxMaterial(MOVING_COLOR));
    this.movingBlock.position.y = 0.8;
    this.movingBlock.castShadow = true;

    this.group.add(this.barrier, this.wall, this.lowBar, this.highBar, this.movingBlock);
    this.clear();
  }

  assign(type: ObstacleType, lane: Lane, z: number, toLane?: Lane): void {
    this.type = type;
    this.group.visible = true;
    this.group.position.z = z;

    this.barrier.visible = type === 'barrier';
    this.wall.visible = type === 'wall';
    this.lowBar.visible = type === 'lowBar';
    this.highBar.visible = type === 'highBar';
    this.movingBlock.visible = type === 'movingBlock';

    if (type === 'movingBlock' && toLane !== undefined) {
      this.fromX = Track.laneToX(lane);
      this.toX = Track.laneToX(toLane);
      this.group.position.x = this.fromX;
    } else {
      this.group.position.x = Track.laneToX(lane);
    }
  }

  clear(): void {
    this.type = null;
    this.group.visible = false;
  }

  update(_dt: number, elapsed: number): void {
    if (this.type !== 'movingBlock' || !this.group.visible) return;
    const t = (Math.sin((elapsed * Math.PI * 2) / MOVE_PERIOD_S) + 1) / 2;
    this.group.position.x = THREE.MathUtils.lerp(this.fromX, this.toX, t);
  }

  /** `chunkZ` é o Z mundial do grupo-pai (o chunk), somado ao Z local do obstáculo. */
  getWorldAABB(chunkZ: number): AABB | null {
    if (!this.type || !this.group.visible) return null;
    const box = HITBOX_BY_TYPE[this.type];
    const worldX = this.group.position.x;
    const worldZ = chunkZ + this.group.position.z;
    return {
      minX: worldX - box.halfX,
      maxX: worldX + box.halfX,
      minY: box.minY,
      maxY: box.maxY,
      minZ: worldZ - box.halfZ,
      maxZ: worldZ + box.halfZ,
    };
  }
}
