import { FIXED_TIMESTEP_S } from '../config';

export type UpdateFn = (dt: number) => void;
export type RenderFn = (alpha: number) => void;

/**
 * Acumulador de passo fixo: desacopla a simulação do refresh rate do monitor,
 * evitando que a física (velocidade, gravidade) varie com o FPS.
 */
export class Loop {
  private accumulator = 0;
  private lastTime = 0;
  private running = false;
  private rafId = 0;
  private readonly update: UpdateFn;
  private readonly render: RenderFn;

  constructor(update: UpdateFn, render: RenderFn) {
    this.update = update;
    this.render = render;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private tick = (now: number): void => {
    if (!this.running) return;

    const frameTime = Math.min((now - this.lastTime) / 1000, 0.25);
    this.lastTime = now;
    this.accumulator += frameTime;

    while (this.accumulator >= FIXED_TIMESTEP_S) {
      this.update(FIXED_TIMESTEP_S);
      this.accumulator -= FIXED_TIMESTEP_S;
    }

    this.render(this.accumulator / FIXED_TIMESTEP_S);
    this.rafId = requestAnimationFrame(this.tick);
  };
}
