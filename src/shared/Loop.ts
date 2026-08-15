export type UpdateFn = (dt: number) => void;
export type RenderFn = (alpha: number) => void;

/**
 * Acumulador de passo fixo: desacopla a simulação do refresh rate do monitor,
 * evitando que a física (velocidade, gravidade) varie com o FPS. Genérico —
 * reaproveitado por qualquer jogo do site, sem depender do config de nenhum.
 */
export class Loop {
  private accumulator = 0;
  private lastTime = 0;
  private running = false;
  private rafId = 0;
  private readonly fixedTimestep: number;
  private readonly update: UpdateFn;
  private readonly render: RenderFn;

  constructor(fixedTimestepSeconds: number, update: UpdateFn, render: RenderFn) {
    this.fixedTimestep = fixedTimestepSeconds;
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

    // Um erro não tratado dentro de update/render normalmente pararia o
    // requestAnimationFrame pra sempre (a linha que reagenda nunca seria
    // alcançada), travando a tela no último frame bom. O try/catch garante
    // que o loop sempre continua rodando mesmo se um frame falhar.
    try {
      const frameTime = Math.min((now - this.lastTime) / 1000, 0.25);
      this.lastTime = now;
      this.accumulator += frameTime;

      while (this.accumulator >= this.fixedTimestep) {
        this.update(this.fixedTimestep);
        this.accumulator -= this.fixedTimestep;
      }

      this.render(this.accumulator / this.fixedTimestep);
    } catch (error) {
      console.error('[Loop] erro num frame — seguindo pro próximo', error);
      this.accumulator = 0;
    }

    this.rafId = requestAnimationFrame(this.tick);
  };
}
