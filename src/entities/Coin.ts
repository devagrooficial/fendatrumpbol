import * as THREE from 'three';
import type { AABB } from '../systems/Collision';

const GEOMETRY = new THREE.TorusGeometry(0.28, 0.09, 8, 16);
const MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xffe14d,
  emissive: 0xffb300,
  emissiveIntensity: 0.6,
});
const PICKUP_HALF_EXTENT = 0.35;

/** Instância reutilizável — nunca cria geometria/material própria em runtime. */
export class Coin {
  readonly group: THREE.Group;
  private readonly mesh: THREE.Mesh;
  private spin = Math.random() * Math.PI * 2;
  collected = false;

  constructor() {
    this.mesh = new THREE.Mesh(GEOMETRY, MATERIAL);
    this.mesh.rotation.x = Math.PI / 2;
    this.mesh.castShadow = true;
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    this.group.visible = false;
  }

  assign(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
    this.group.visible = true;
    this.collected = false;
  }

  clear(): void {
    this.group.visible = false;
    this.collected = false;
  }

  update(dt: number): void {
    if (!this.group.visible) return;
    this.spin += dt * 3;
    this.mesh.rotation.y = this.spin;
  }

  /** `chunkZ` é o Z mundial do grupo-pai (o chunk). */
  getWorldAABB(chunkZ: number): AABB | null {
    if (!this.group.visible || this.collected) return null;
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

  /** Coleta e esconde a moeda; volta a aparecer só quando o chunk reciclar. */
  collect(): void {
    this.collected = true;
    this.group.visible = false;
  }

  /**
   * Puxa a moeda em direção ao player se estiver dentro do raio do ímã;
   * coleta automaticamente quando chega perto o bastante. Retorna se coletou.
   */
  applyMagnet(chunkZ: number, playerPos: THREE.Vector3, radius: number, pullSpeed: number, dt: number): boolean {
    if (!this.group.visible || this.collected) return false;

    const worldX = this.group.position.x;
    const worldY = this.group.position.y;
    const worldZ = chunkZ + this.group.position.z;
    const dx = playerPos.x - worldX;
    const dy = playerPos.y - worldY;
    const dz = playerPos.z - worldZ;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq > radius * radius) return false;

    const dist = Math.sqrt(distSq);
    if (dist < 0.3) {
      this.collect();
      return true;
    }

    const pull = Math.min(pullSpeed * dt, dist);
    const newWorldX = worldX + (dx / dist) * pull;
    const newWorldY = worldY + (dy / dist) * pull;
    const newWorldZ = worldZ + (dz / dist) * pull;
    this.group.position.set(newWorldX, newWorldY, newWorldZ - chunkZ);
    return false;
  }
}
