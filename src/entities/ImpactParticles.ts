import * as THREE from 'three';

const PARTICLE_COUNT = 18;
const GRAVITY = -18;
const GEOMETRY = new THREE.BoxGeometry(0.09, 0.09, 0.09);

type Particle = {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
};

/**
 * Pool fixo de partículas reutilizáveis — burst() nunca cria geometria ou
 * material novos, só reposiciona/reativa membros do pool.
 */
export class ImpactParticles {
  readonly group: THREE.Group;
  private readonly particles: Particle[] = [];
  private cursor = 0;

  constructor() {
    this.group = new THREE.Group();
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
      const mesh = new THREE.Mesh(GEOMETRY, material);
      mesh.visible = false;
      this.group.add(mesh);
      this.particles.push({ mesh, material, velocity: new THREE.Vector3(), life: 0, maxLife: 0.6 });
    }
  }

  /** Dispara ~6 partículas do pool a partir de `origin`, na cor dada. */
  burst(origin: THREE.Vector3, color: number): void {
    const count = 6;
    for (let i = 0; i < count; i++) {
      const particle = this.particles[this.cursor];
      this.cursor = (this.cursor + 1) % this.particles.length;
      if (!particle) continue;

      particle.material.color.setHex(color);
      particle.material.opacity = 1;
      particle.mesh.visible = true;
      particle.mesh.position.copy(origin);
      particle.mesh.position.y += 0.6;

      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 2.5;
      particle.velocity.set(Math.cos(angle) * speed, 2.5 + Math.random() * 2, Math.sin(angle) * speed);
      particle.life = 0;
      particle.maxLife = 0.4 + Math.random() * 0.3;
    }
  }

  update(dt: number): void {
    for (const particle of this.particles) {
      if (!particle.mesh.visible) continue;

      particle.life += dt;
      if (particle.life >= particle.maxLife) {
        particle.mesh.visible = false;
        continue;
      }

      particle.velocity.y += GRAVITY * dt;
      particle.mesh.position.addScaledVector(particle.velocity, dt);
      particle.material.opacity = 1 - particle.life / particle.maxLife;
    }
  }
}
