// Toca uma lista de ReplaySnapshot em REPLAY.SPEED da velocidade original
// (spec seção 8). Não resimula nada — só avança um índice dentro dos
// snapshots já gravados, proporcional ao tempo real decorrido.

import { FIXED_TIMESTEP_S, REPLAY } from '../core/constants';
import type { ReplaySnapshot } from './buffer';

export class ReplayPlayer {
  private snapshots: ReplaySnapshot[] = [];
  private playbackTimeS = 0;

  start(snapshots: ReplaySnapshot[]): void {
    this.snapshots = snapshots;
    this.playbackTimeS = 0;
  }

  // dtRealSeconds é tempo de relógio de verdade (não de simulação) — o
  // replay avança REPLAY.SPEED segundos de conteúdo por segundo real.
  update(dtRealSeconds: number): void {
    this.playbackTimeS = Math.min(this.durationS, this.playbackTimeS + dtRealSeconds * REPLAY.SPEED);
  }

  get durationS(): number {
    return this.snapshots.length * FIXED_TIMESTEP_S;
  }

  get progress(): number {
    return this.durationS <= 0 ? 1 : this.playbackTimeS / this.durationS;
  }

  get isFinished(): boolean {
    return this.snapshots.length === 0 || this.playbackTimeS >= this.durationS;
  }

  getCurrentSnapshot(): ReplaySnapshot | null {
    if (this.snapshots.length === 0) return null;
    const index = Math.min(this.snapshots.length - 1, Math.floor(this.playbackTimeS / FIXED_TIMESTEP_S));
    return this.snapshots[index] ?? null;
  }

  skipToEnd(): void {
    this.playbackTimeS = this.durationS;
  }
}
