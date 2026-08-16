// Efeitos visuais (spec seção 11): rastro da bola, screen shake no gol,
// partículas no chute carregado, flash branco no gol. Puramente cosmético —
// não influencia a simulação, então mora fora de core/ e pode usar
// Math.random() à vontade (não precisa ser determinístico).

import type { Vec2 } from '../core/types';

const TRAIL_LENGTH = 8;
const SHAKE_DURATION_S = 0.3;
const SHAKE_AMPLITUDE_PX = 12;
const FLASH_DURATION_S = 0.25;
const PARTICLE_LIFETIME_S = 0.4;

type Particle = { pos: Vec2; vel: Vec2; life: number };

export class Fx {
  private trail: Vec2[] = [];
  private shakeTimer = 0;
  private flashTimer = 0;
  private particles: Particle[] = [];

  recordBallPosition(pos: Vec2): void {
    this.trail.push({ x: pos.x, y: pos.y });
    if (this.trail.length > TRAIL_LENGTH) this.trail.shift();
  }

  reset(): void {
    this.trail = [];
    this.shakeTimer = 0;
    this.flashTimer = 0;
    this.particles = [];
  }

  getBallTrail(): readonly Vec2[] {
    return this.trail;
  }

  triggerGoal(): void {
    this.shakeTimer = SHAKE_DURATION_S;
    this.flashTimer = FLASH_DURATION_S;
  }

  // `intensity` 0..1 (carga do chute) — chutes mais carregados espalham
  // mais partículas, mais rápido.
  spawnKickParticles(pos: Vec2, aimDir: Vec2, intensity: number): void {
    const count = 4 + Math.round(intensity * 6);
    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * 1.2; // radianos em torno da direção do chute
      const angle = Math.atan2(aimDir.y, aimDir.x) + spread;
      const speed = (120 + Math.random() * 180) * (0.5 + intensity * 0.5);
      this.particles.push({
        pos: { x: pos.x, y: pos.y },
        vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        life: PARTICLE_LIFETIME_S,
      });
    }
  }

  getParticles(): readonly Particle[] {
    return this.particles;
  }

  update(dt: number): void {
    this.shakeTimer = Math.max(0, this.shakeTimer - dt);
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    this.particles = this.particles
      .map((p) => ({ pos: { x: p.pos.x + p.vel.x * dt, y: p.pos.y + p.vel.y * dt }, vel: p.vel, life: p.life - dt }))
      .filter((p) => p.life > 0);
  }

  getShakeOffsetPx(): Vec2 {
    if (this.shakeTimer <= 0) return { x: 0, y: 0 };
    const decay = this.shakeTimer / SHAKE_DURATION_S;
    const amp = SHAKE_AMPLITUDE_PX * decay;
    return { x: (Math.random() * 2 - 1) * amp, y: (Math.random() * 2 - 1) * amp };
  }

  getFlashAlpha(): number {
    if (this.flashTimer <= 0) return 0;
    return this.flashTimer / FLASH_DURATION_S;
  }
}
