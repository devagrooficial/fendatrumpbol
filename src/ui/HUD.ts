import { GameState, type Game } from '../core/Game';
import type { PowerUpType } from '../entities/PowerUp';
import { ICON_COIN, ICON_GEM, ICON_PAUSE } from './icons';

const POWERUP_LABEL: Record<PowerUpType, string> = {
  magnet: 'Ímã',
  multiplier: 'Multiplicador ×2',
  shield: 'Escudo',
  boost: 'Impulso',
};

/** Score, moedas, gemas (canto superior) e barra do power-up ativo. */
export class HUD {
  private readonly root: HTMLDivElement;
  private readonly scoreEl: HTMLDivElement;
  private readonly coinsEl: HTMLDivElement;
  private readonly coinsValueEl: HTMLSpanElement;
  private readonly gemsEl: HTMLDivElement;
  private readonly gemsValueEl: HTMLSpanElement;
  private readonly powerUpEl: HTMLDivElement;
  private readonly powerUpLabelEl: HTMLDivElement;
  private readonly powerUpBarEl: HTMLDivElement;
  private readonly game: Game;
  private lastCoins = 0;
  private lastGems = 0;

  constructor(game: Game, onPauseClick: () => void) {
    this.game = game;

    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud__row">
        <div class="hud__score" data-score></div>
        <div class="hud__right">
          <div class="hud__stat hud__stat--coin" data-coins-stat>
            <span class="hud__icon">${ICON_COIN}</span>
            <span data-coins>0</span>
          </div>
          <div class="hud__stat hud__stat--gem" data-gems-stat>
            <span class="hud__icon">${ICON_GEM}</span>
            <span data-gems>0</span>
          </div>
          <button type="button" class="hud__pause" data-pause aria-label="Pausar">
            <span class="hud__icon">${ICON_PAUSE}</span>
            Pausar
          </button>
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
    const coinsStatEl = this.root.querySelector<HTMLDivElement>('[data-coins-stat]');
    const coinsEl = this.root.querySelector<HTMLSpanElement>('[data-coins]');
    const gemsStatEl = this.root.querySelector<HTMLDivElement>('[data-gems-stat]');
    const gemsEl = this.root.querySelector<HTMLSpanElement>('[data-gems]');
    const pauseButton = this.root.querySelector<HTMLButtonElement>('[data-pause]');
    const powerUpEl = this.root.querySelector<HTMLDivElement>('[data-powerup]');
    const powerUpLabelEl = this.root.querySelector<HTMLDivElement>('[data-powerup-label]');
    const powerUpBarEl = this.root.querySelector<HTMLDivElement>('[data-powerup-bar]');
    if (
      !scoreEl || !coinsStatEl || !coinsEl || !gemsStatEl || !gemsEl ||
      !pauseButton || !powerUpEl || !powerUpLabelEl || !powerUpBarEl
    ) {
      throw new Error('Markup do HUD incompleto');
    }
    this.scoreEl = scoreEl;
    this.coinsEl = coinsStatEl;
    this.gemsEl = gemsStatEl;
    this.powerUpEl = powerUpEl;
    this.powerUpLabelEl = powerUpLabelEl;
    this.powerUpBarEl = powerUpBarEl;
    this.coinsValueEl = coinsEl;
    this.gemsValueEl = gemsEl;
    pauseButton.addEventListener('click', onPauseClick);

    document.body.appendChild(this.root);
  }

  sync(): void {
    const visible = this.game.state === GameState.PLAYING || this.game.state === GameState.PAUSED;
    this.root.classList.toggle('hud--visible', visible);
    if (!visible) return;

    this.scoreEl.textContent = `${this.game.score}`;

    const coins = this.game.coinsCollected;
    this.coinsValueEl.textContent = `${coins}`;
    if (coins > this.lastCoins) this.pulse(this.coinsEl);
    this.lastCoins = coins;

    const gems = this.game.gemsCollected;
    this.gemsValueEl.textContent = `${gems}`;
    if (gems > this.lastGems) this.pulse(this.gemsEl);
    this.lastGems = gems;

    const type = this.game.activePowerUpType;
    this.powerUpEl.classList.toggle('hud__powerup--visible', type !== null);
    if (type) {
      this.powerUpLabelEl.textContent = POWERUP_LABEL[type];
      this.powerUpBarEl.style.width = `${this.game.powerUpProgress * 100}%`;
    }
  }

  /** Reinicia a animação de pulso mesmo se ela ainda estiver em andamento. */
  private pulse(el: HTMLElement): void {
    el.classList.remove('hud__stat--pulse');
    void el.offsetWidth;
    el.classList.add('hud__stat--pulse');
  }
}
