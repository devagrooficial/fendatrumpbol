import { STORAGE_KEYS } from '../config';

type AudioContextCtor = typeof AudioContext;

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.SOUND_ENABLED) !== '0';
  } catch {
    return true;
  }
}

function writeEnabled(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SOUND_ENABLED, value ? '1' : '0');
  } catch {
    // localStorage indisponível — falha silenciosa
  }
}

/**
 * Síntese de SFX via Web Audio API — sem arquivos de áudio. O motor usa um
 * osciloscópio contínuo (ligado/desligado com o estado do jogo) em vez do
 * padrão de "tom curto" usado pelos efeitos de evento.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private enabled = readEnabled();
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;

  get isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    writeEnabled(value);
  }

  private ensureContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const Ctor: AudioContextCtor | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, duration: number, type: OscillatorType, peakGain: number, glideTo?: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (glideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(glideTo, 1), ctx.currentTime + duration);
    }
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(peakGain, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }

  startEngine(): void {
    const ctx = this.ensureContext();
    if (!ctx || this.engineOsc) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 60;
    gain.gain.value = 0;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    this.engineOsc = osc;
    this.engineGain = gain;
  }

  /** Chamado a cada frame de jogo — desliza suavemente frequência/ganho pro alvo do manete atual. */
  updateEngine(throttle: number): void {
    if (!this.ctx || !this.engineOsc || !this.engineGain) return;
    const targetFreq = 55 + throttle * 130;
    const targetGain = this.enabled ? 0.035 + throttle * 0.055 : 0;
    this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.08);
    this.engineGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.08);
  }

  stopEngine(): void {
    if (!this.ctx || !this.engineOsc || !this.engineGain) return;
    this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    this.engineOsc.stop(this.ctx.currentTime + 0.4);
    this.engineOsc = null;
    this.engineGain = null;
  }

  checkpoint(): void {
    this.tone(900, 0.18, 'square', 0.15, 1500);
  }

  landing(): void {
    this.tone(700, 0.32, 'triangle', 0.18, 1100);
  }

  crash(): void {
    this.tone(180, 0.5, 'sawtooth', 0.22, 40);
  }

  outOfFuel(): void {
    this.tone(260, 0.45, 'sawtooth', 0.2, 60);
  }

  click(): void {
    this.tone(500, 0.05, 'square', 0.08);
  }
}

export const Audio = new AudioEngine();
