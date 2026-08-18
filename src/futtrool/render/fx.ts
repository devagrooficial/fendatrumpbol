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
const KICK_PULSE_DURATION_S = 0.18;
const KICK_PULSE_MIN_SCALE = 0.7; // o quanto a bola "encolhe" no instante do chute

type Particle = { pos: Vec2; vel: Vec2; life: number };

export class Fx {
  private trail: Vec2[] = [];
  private shakeTimer = 0;
  private flashTimer = 0;
  private particles: Particle[] = [];
  private ballSpin = 0; // radianos acumulados — puramente visual, não é física de verdade
  private kickPulseTimer = 0;

  recordBallPosition(pos: Vec2): void {
    this.trail.push({ x: pos.x, y: pos.y });
    if (this.trail.length > TRAIL_LENGTH) this.trail.shift();
  }

  // Gira a bola visualmente proporcional à velocidade (rolamento sem
  // deslizar: ω = velocidade/raio) — não é a física real de uma bola 3D
  // rolando (o jogo é top-down, esse eixo de giro não existiria numa
  // câmera de cima de verdade), é só uma estilização pra dar sensação de
  // movimento em vez da bola "deslizando" sem girar. `%= 2π` pra não
  // acumular um número gigante numa partida longa.
  updateBallSpin(speed: number, radius: number, dt: number): void {
    this.ballSpin = (this.ballSpin + (speed / radius) * dt) % (Math.PI * 2);
  }

  getBallSpin(): number {
    return this.ballSpin;
  }

  reset(): void {
    this.trail = [];
    this.shakeTimer = 0;
    this.flashTimer = 0;
    this.particles = [];
    this.ballSpin = 0;
    this.kickPulseTimer = 0;
  }

  // "Pulsação" no chute (pedido do Mateus): a bola encolhe na hora do
  // impacto e volta ao tamanho normal com uma pequena mola — só o
  // tamanho DESENHADO muda (`getBallPulseScale`), o raio de física
  // (colisão) nunca é afetado, é puro efeito visual.
  triggerKickPulse(): void {
    this.kickPulseTimer = KICK_PULSE_DURATION_S;
  }

  getBallPulseScale(): number {
    if (this.kickPulseTimer <= 0) return 1;
    const progress = 1 - this.kickPulseTimer / KICK_PULSE_DURATION_S; // 0 (acabou de chutar) -> 1 (normalizou)
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cúbico, volta rápido no começo e suaviza no fim
    return KICK_PULSE_MIN_SCALE + (1 - KICK_PULSE_MIN_SCALE) * eased;
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
    this.kickPulseTimer = Math.max(0, this.kickPulseTimer - dt);
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
