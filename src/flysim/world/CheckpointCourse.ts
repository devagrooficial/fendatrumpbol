import * as THREE from 'three';
import { CHECKPOINT } from '../config';
import { generateCheckpointCourse, type CheckpointPoint } from './Checkpoints';

const RING_COLOR = 0x2f6bff;
const TARGET_COLOR = 0xffa83d;
const tmpVector = new THREE.Vector3();

/** Anéis pooled (um `Mesh` fixo por checkpoint) — só o material do alvo atual muda, nunca a geometria. */
export class CheckpointCourse {
  readonly group: THREE.Group;
  private readonly points: CheckpointPoint[];
  private readonly rings: THREE.Mesh[] = [];
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  private nextIndex = 0;

  constructor() {
    this.group = new THREE.Group();
    this.points = generateCheckpointCourse(CHECKPOINT.COUNT);

    const geometry = new THREE.TorusGeometry(CHECKPOINT.RADIUS, 1.1, 10, 24);
    for (let i = 0; i < this.points.length; i++) {
      const point = this.points[i];
      const next = this.points[(i + 1) % this.points.length];
      if (!point || !next) continue;

      const material = new THREE.MeshStandardMaterial({
        color: RING_COLOR,
        emissive: RING_COLOR,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.85,
      });
      const ring = new THREE.Mesh(geometry, material);
      ring.position.set(point.x, point.y, point.z);
      const direction = tmpVector.set(next.x - point.x, next.y - point.y, next.z - point.z).normalize();
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
      this.group.add(ring);
      this.rings.push(ring);
      this.materials.push(material);
    }

    this.updateHighlight();
  }

  get nextTarget(): CheckpointPoint | undefined {
    return this.points[this.nextIndex];
  }

  get completedCount(): number {
    return this.nextIndex;
  }

  /** Retorna true se a posição estiver dentro do raio do alvo atual — nesse caso já avança o índice. */
  checkPass(position: THREE.Vector3): boolean {
    const target = this.points[this.nextIndex];
    if (!target) return false;
    const dx = position.x - target.x;
    const dy = position.y - target.y;
    const dz = position.z - target.z;
    const distanceSq = dx * dx + dy * dy + dz * dz;
    if (distanceSq > CHECKPOINT.RADIUS * CHECKPOINT.RADIUS) return false;

    this.nextIndex = (this.nextIndex + 1) % this.points.length;
    this.updateHighlight();
    return true;
  }

  reset(): void {
    this.nextIndex = 0;
    this.updateHighlight();
  }

  private updateHighlight(): void {
    this.materials.forEach((material, i) => {
      const isTarget = i === this.nextIndex;
      material.color.setHex(isTarget ? TARGET_COLOR : RING_COLOR);
      material.emissive.setHex(isTarget ? TARGET_COLOR : RING_COLOR);
      material.emissiveIntensity = isTarget ? 1.1 : 0.4;
    });
  }
}
