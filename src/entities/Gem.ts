import * as THREE from 'three';
import type { AABB } from '../systems/Collision';

const GEOMETRY = new THREE.OctahedronGeometry(0.26, 0);
const MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xbdf3ff,
  emissive: 0x4fd1e6,
  emissiveIntensity: 0.8,
});
const PICKUP_HALF_EXTENT = 0.32;

/**
 * Colecionável raro, mais valioso que a moeda. Instância reutilizável —
 * nunca cria geometria/material própria em runtime.
 */
export class Gem {
  readonly group: THREE.Group;
  private readonly mesh: THREE.Mesh;
  private spin = Math.random() * Math.PI * 2;
  private bobPhase = Math.random() * Math.PI * 2;
  private baseY = 0;
  collected = false;

  constructor() {
    this.mesh = new THREE.Mesh(GEOMETRY, MATERIAL);
    this.mesh.castShadow = true;
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    this.group.visible = false;
  }

  assign(x: number, y: number, z: number): void {
    this.baseY = y;
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
    this.spin += dt * 2.2;
    this.mesh.rotation.y = this.spin;
    this.mesh.rotation.x = this.spin * 0.6;
    this.bobPhase += dt * 3;
    this.group.position.y = this.baseY + Math.sin(this.bobPhase) * 0.12;
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

  /** Coleta e esconde a gema; volta a aparecer só quando o chunk reciclar. */
  collect(): void {
    this.collected = true;
    this.group.visible = false;
  }

  /**
   * Puxa a gema em direção ao player se estiver dentro do raio do ímã;
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
    this.baseY = newWorldY;
    this.group.position.set(newWorldX, newWorldY, newWorldZ - chunkZ);
    return false;
  }
}
