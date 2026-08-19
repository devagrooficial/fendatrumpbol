// Síntese de SFX via Web Audio API — sem arquivos de áudio, mesmo padrão do
// Fly Simulator (src/flysim/core/Audio.ts). Web Audio já lida bem com vários
// osciladores concorrentes sem estourar em cliques rápidos, então não
// precisa de um pool explícito — só criar e descartar o nó por evento.

const STORAGE_KEY = 'futtrool.soundEnabled';

type AudioContextCtor = typeof AudioContext;

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

function writeEnabled(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    // localStorage indisponível — falha silenciosa
  }
}

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
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor: AudioContextCtor | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  // `startDelay` (segundos, a partir de agora) permite agendar notas em
  // sequência (arpejo) sem depender de setTimeout — o Web Audio já é feito
  // pra agendar no próprio relógio do contexto, com precisão de sample.
  private tone(freq: number, duration: number, type: OscillatorType, peakGain: number, glideTo?: number, startDelay = 0): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const startTime = ctx.currentTime + startDelay;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    if (glideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(glideTo, 1), startTime + duration);
    }
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain).connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  private noiseBurst(duration: number, peakGain: number, filterFreq: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peakGain, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
  }

  // Chute — 3 variações por intensidade (spec seção 12), intensity 0..1 (carga do chute).
  kick(intensity: number): void {
    const freq = 140 + intensity * 90;
    this.tone(freq, 0.09 + intensity * 0.05, 'square', 0.14 + intensity * 0.1, freq * 0.4);
    this.noiseBurst(0.06, 0.08 + intensity * 0.08, 1800);
  }

  ballWallBounce(): void {
    this.tone(320, 0.08, 'triangle', 0.1, 180);
  }

  playerCollision(): void {
    this.noiseBurst(0.09, 0.12, 900);
  }

  dash(): void {
    this.tone(220, 0.18, 'sawtooth', 0.12, 520);
  }

  whistleStart(): void {
    this.tone(1200, 0.22, 'square', 0.12, 1200);
  }

  whistleEnd(): void {
    this.tone(900, 0.35, 'square', 0.14, 500);
  }

  // Gol (spec seção 12, "feedback exagerado"): fanfarra curta (arpejo
  // ascendente C5-E5-G5-C6) + "grito de torcida" — ruído filtrado com
  // crescendo/decrescimo simulando um rugido de arquibancada. Sem sample
  // de áudio, tudo sintetizado, igual ao resto do jogo.
  goal(): void {
    const notes: [freq: number, delay: number][] = [
      [523.25, 0], // C5
      [659.25, 0.09], // E5
      [783.99, 0.18], // G5
      [1046.5, 0.27], // C6
    ];
    for (const [freq, delay] of notes) {
      this.tone(freq, 0.22, 'square', 0.14, undefined, delay);
    }
    this.crowdCheer(1.4, 0.22);
  }

  private crowdCheer(duration: number, peakGain: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1100;
    filter.Q.value = 0.6;

    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + 0.25); // crescendo, tipo torcida reagindo
    gain.gain.linearRampToValueAtTime(peakGain * 0.7, now + duration * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(now);
    source.stop(now + duration + 0.05);
  }

  click(): void {
    this.tone(500, 0.05, 'square', 0.08);
  }

  // Reta final (20s restantes) — dois bipes curtos e agudos, tipo alarme
  // de cronômetro, bem diferente de qualquer outro efeito do jogo (nenhum
  // outro usa dois tons idênticos em sequência rápida).
  finalCountdown(): void {
    this.tone(880, 0.1, 'square', 0.12);
    this.tone(880, 0.1, 'square', 0.12, undefined, 0.16);
  }
}

export const Audio = new AudioEngine();
