import { GameState, type Game } from '../core/Game';
import type { PowerUpType } from '../entities/PowerUp';

const POWERUP_LABEL: Record<PowerUpType, string> = {
  magnet: 'Ímã',
  multiplier: 'Multiplicador ×2',
  shield: 'Escudo',
  boost: 'Impulso',
};

/** Score (canto superior esquerdo), moedas (canto superior direito) e barra do power-up ativo. */
export class HUD {
  private readonly root: HTMLDivElement;
  private readonly scoreEl: HTMLDivElement;
  private readonly coinsEl: HTMLDivElement;
  private readonly powerUpEl: HTMLDivElement;
  private readonly powerUpLabelEl: HTMLDivElement;
  private readonly powerUpBarEl: HTMLDivElement;
  private readonly game: Game;

  constructor(game: Game, onPauseClick: () => void) {
    this.game = game;

    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud__row">
        <div class="hud__score" data-score></div>
        <div class="hud__right">
          <div class="hud__coins" data-coins></div>
          <button type="button" class="hud__pause" data-pause aria-label="Pausar">Pausar</button>
        </div>
      </div>
      <div class="hud__powerup" data-powerup>
        <span class="hud__powerup-label" data-powerup-label></span>
        <div class="hud__powerup-track">
          <div class="hud__powerup-bar" data-powerup-bar></div>
        </div>
      </div>
    `;

    const scoreEl = this.root.querySelector<HTMLDivElement>('[data-score]');
    const coinsEl = this.root.querySelector<HTMLDivElement>('[data-coins]');
    const pauseButton = this.root.querySelector<HTMLButtonElement>('[data-pause]');
    const powerUpEl = this.root.querySelector<HTMLDivElement>('[data-powerup]');
    const powerUpLabelEl = this.root.querySelector<HTMLDivElement>('[data-powerup-label]');
    const powerUpBarEl = this.root.querySelector<HTMLDivElement>('[data-powerup-bar]');
    if (!scoreEl || !coinsEl || !pauseButton || !powerUpEl || !powerUpLabelEl || !powerUpBarEl) {
      throw new Error('Markup do HUD incompleto');
    }
    this.scoreEl = scoreEl;
    this.coinsEl = coinsEl;
    this.powerUpEl = powerUpEl;
    this.powerUpLabelEl = powerUpLabelEl;
    this.powerUpBarEl = powerUpBarEl;
    pauseButton.addEventListener('click', onPauseClick);

    document.body.appendChild(this.root);
  }

  sync(): void {
    const visible = this.game.state === GameState.PLAYING || this.game.state === GameState.PAUSED;
    this.root.classList.toggle('hud--visible', visible);
    if (!visible) return;

    this.scoreEl.textContent = `${this.game.score}`;
    this.coinsEl.textContent = `Moedas: ${this.game.coinsCollected}`;

    const type = this.game.activePowerUpType;
    this.powerUpEl.classList.toggle('hud__powerup--visible', type !== null);
    if (type) {
      this.powerUpLabelEl.textContent = POWERUP_LABEL[type];
      this.powerUpBarEl.style.width = `${this.game.powerUpProgress * 100}%`;
    }
  }
}
