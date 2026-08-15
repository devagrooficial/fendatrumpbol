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
 * Síntese de SFX via Web Audio API — sem arquivos de áudio. O AudioContext só
 * é criado no primeiro som tocado (precisa de gesto do usuário nos browsers).
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private enabled = readEnabled();

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

  jump(): void {
    this.tone(440, 0.15, 'square', 0.15, 880);
  }

  slide(): void {
    this.tone(220, 0.12, 'sawtooth', 0.1, 110);
  }

  coin(): void {
    this.tone(1200, 0.08, 'square', 0.12, 1800);
  }

  gem(): void {
    this.tone(1800, 0.18, 'sine', 0.14, 2600);
  }

  powerUp(): void {
    this.tone(600, 0.25, 'triangle', 0.18, 1200);
  }

  scrape(): void {
    this.tone(300, 0.15, 'sawtooth', 0.12, 150);
  }

  shieldBreak(): void {
    this.tone(500, 0.3, 'triangle', 0.18, 100);
  }

  gameOver(): void {
    this.tone(300, 0.45, 'sawtooth', 0.2, 50);
  }

  click(): void {
    this.tone(500, 0.05, 'square', 0.08);
  }
}

export const Audio = new AudioEngine();
