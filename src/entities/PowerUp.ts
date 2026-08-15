import * as THREE from 'three';
import type { AABB } from '../systems/Collision';

export type PowerUpType = 'magnet' | 'multiplier' | 'shield' | 'boost';

const PICKUP_HALF_EXTENT = 0.4;

const GEOMETRY_BY_TYPE: Record<PowerUpType, THREE.BufferGeometry> = {
  magnet: new THREE.TorusGeometry(0.3, 0.12, 8, 16),
  multiplier: new THREE.OctahedronGeometry(0.4, 0),
  shield: new THREE.IcosahedronGeometry(0.35, 0),
  boost: new THREE.ConeGeometry(0.32, 0.65, 8),
};

const COLOR_BY_TYPE: Record<PowerUpType, number> = {
  magnet: 0xff2fd6,
  multiplier: 0x22e5ff,
  shield: 0x4dffb0,
  boost: 0xffa83d,
};

function buildMesh(type: PowerUpType): THREE.Mesh {
  const color = COLOR_BY_TYPE[type];
  const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 });
  const mesh = new THREE.Mesh(GEOMETRY_BY_TYPE[type], material);
  mesh.castShadow = true;
  mesh.visible = false;
  return mesh;
}

const POWERUP_TYPES: readonly PowerUpType[] = ['magnet', 'multiplier', 'shield', 'boost'];

/**
 * Contém um mesh pré-construído por tipo (ímã/x2/escudo/impulso); `assign`
 * só alterna visibilidade — nenhuma geometria é criada em runtime.
 */
export class PowerUp {
  readonly group: THREE.Group;
  private readonly meshByType: Record<PowerUpType, THREE.Mesh>;
  private type: PowerUpType | null = null;
  private spin = 0;

  constructor() {
    this.group = new THREE.Group();
    this.meshByType = {
      magnet: buildMesh('magnet'),
      multiplier: buildMesh('multiplier'),
      shield: buildMesh('shield'),
      boost: buildMesh('boost'),
    };
    for (const t of POWERUP_TYPES) this.group.add(this.meshByType[t]);
    this.group.visible = false;
  }

  get activeType(): PowerUpType | null {
    return this.type;
  }

  assign(type: PowerUpType, x: number, y: number, z: number): void {
    this.type = type;
    this.group.position.set(x, y, z);
    this.group.visible = true;
    for (const t of POWERUP_TYPES) this.meshByType[t].visible = t === type;
  }

  clear(): void {
    this.type = null;
    this.group.visible = false;
  }

  update(dt: number): void {
    if (!this.group.visible) return;
    this.spin += dt * 2;
    this.group.rotation.y = this.spin;
    this.group.rotation.x = Math.sin(this.spin * 0.7) * 0.3;
  }

  /** `chunkZ` é o Z mundial do grupo-pai (o chunk). */
  getWorldAABB(chunkZ: number): AABB | null {
    if (!this.type || !this.group.visible) return null;
    const x = this.group.position.x;
    const y = this.group.position.y;
    const z = chunkZ + this.group.position.z;
    return {
      minX: x - PICKUP_HALF_EXTENT,
      maxX: x + PICKUP_HALF_EXTENT,
      minY: y - PICKUP_HALF_EXTENT,
      maxY: y + PICKUP_HALF_EXTENT,
      minZ: z - PICKUP_HALF_EXTENT,
      maxZ: z + PICKUP_HALF_EXTENT,
    };
  }
}
