import * as THREE from 'three';
import { CHECKPOINT } from '../config';
import { generateCheckpointCourse, type CheckpointPoint } from './Checkpoints';

const RING_COLOR = 0x2f6bff;
const TARGET_COLOR = 0xffa83d;
const tmpVector = new THREE.Vector3();

type NearestResult = { index: number; point: CheckpointPoint };

/**
 * Anéis pooled (um `Mesh` fixo por checkpoint), coletáveis em **qualquer
 * ordem** — cada um só precisa ser sobrevoado uma vez. O anel mais próximo
 * ainda não coletado fica em destaque laranja e some da cena ao ser
 * coletado; quando todos somem, o percurso inteiro reaparece pra continuar
 * o voo (sem fim).
 */
export class CheckpointCourse {
  readonly group: THREE.Group;
  private readonly points: CheckpointPoint[];
  private readonly rings: THREE.Mesh[] = [];
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  private collected: boolean[] = [];

  constructor() {
    this.group = new THREE.Group();
    this.points = generateCheckpointCourse(CHECKPOINT.COUNT);
    this.collected = this.points.map(() => false);

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

    this.updateVisuals(-1);
  }

  /** Checkpoint ainda não coletado mais perto de `position`, ou undefined se todos já foram coletados neste ciclo. */
  nearestTarget(position: THREE.Vector3): CheckpointPoint | undefined {
    return this.findNearestUncollected(position)?.point;
  }

  private findNearestUncollected(position: THREE.Vector3): NearestResult | null {
    let best: NearestResult | null = null;
    let bestDistSq = Infinity;
    for (let i = 0; i < this.points.length; i++) {
      if (this.collected[i]) continue;
      const point = this.points[i];
      if (!point) continue;
      const dx = position.x - point.x;
      const dy = position.y - point.y;
      const dz = position.z - point.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = { index: i, point };
      }
    }
    return best;
  }

  /**
   * Coleta qualquer anel ainda não coletado dentro do raio — não exige
   * ordem. Retorna quantos foram coletados neste frame (normalmente 0 ou 1).
   */
  checkPass(position: THREE.Vector3): number {
    let count = 0;
    for (let i = 0; i < this.points.length; i++) {
      if (this.collected[i]) continue;
      const point = this.points[i];
      if (!point) continue;
      const dx = position.x - point.x;
      const dy = position.y - point.y;
      const dz = position.z - point.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq <= CHECKPOINT.RADIUS * CHECKPOINT.RADIUS) {
        this.collected[i] = true;
        count++;
      }
    }

    // Voo sem fim: quando o último anel some, o percurso inteiro reaparece.
    if (count > 0 && this.collected.every(Boolean)) {
      this.collected = this.collected.map(() => false);
    }

    // Sempre recalcula o destaque (não só quando algo é coletado), pra
    // seta/anel laranja acompanharem o alvo mais próximo durante o voo.
    this.updateVisuals(this.findNearestUncollected(position)?.index ?? -1);

    return count;
  }

  reset(): void {
    this.collected = this.points.map(() => false);
    this.updateVisuals(-1);
  }

  /** Some com anéis já coletados; destaca em laranja o mais próximo ainda pendente. */
  private updateVisuals(targetIndex: number): void {
    this.rings.forEach((ring, i) => {
      ring.visible = !this.collected[i];
      const material = this.materials[i];
      if (!material) return;
      const isTarget = i === targetIndex;
      material.color.setHex(isTarget ? TARGET_COLOR : RING_COLOR);
      material.emissive.setHex(isTarget ? TARGET_COLOR : RING_COLOR);
      material.emissiveIntensity = isTarget ? 1.1 : 0.4;
    });
  }
}
