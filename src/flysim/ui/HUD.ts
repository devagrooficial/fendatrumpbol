import { GameState, type Game } from '../core/Game';
import { ICON_ALTITUDE, ICON_ARROW, ICON_CHECKPOINT, ICON_COMPASS, ICON_FUEL, ICON_PAUSE, ICON_SPEED } from './icons';

/** Velocidade, altitude, manete, combustível, score e seta pro próximo checkpoint. */
export class HUD {
  private readonly root: HTMLDivElement;
  private readonly scoreEl: HTMLDivElement;
  private readonly speedEl: HTMLSpanElement;
  private readonly altitudeEl: HTMLSpanElement;
  private readonly headingEl: HTMLSpanElement;
  private readonly headingNeedleEl: HTMLSpanElement;
  private readonly throttleBarEl: HTMLDivElement;
  private readonly fuelBarEl: HTMLDivElement;
  private readonly fuelRowEl: HTMLDivElement;
  private readonly checkpointEl: HTMLDivElement;
  private readonly checkpointArrowEl: HTMLSpanElement;
  private readonly checkpointDistanceEl: HTMLSpanElement;
  private readonly stallWarningEl: HTMLDivElement;
  private readonly game: Game;

  constructor(game: Game, onPauseClick: () => void) {
    this.game = game;

    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud__row">
        <div class="hud__score" data-score></div>
        <button type="button" class="hud__pause" data-pause aria-label="Pausar">
          <span class="hud__icon">${ICON_PAUSE}</span>
          Pausar
        </button>
      </div>
      <div class="hud__gauges">
        <div class="hud__gauge">
          <span class="hud__icon">${ICON_SPEED}</span>
          <span data-speed>0</span> m/s
        </div>
        <div class="hud__gauge">
          <span class="hud__icon">${ICON_ALTITUDE}</span>
          <span data-altitude>0</span> m
        </div>
        <div class="hud__gauge">
          <span class="hud__icon hud__compass-needle" data-heading-needle>${ICON_COMPASS}</span>
          <span data-heading>000</span>°
        </div>
      </div>
      <div class="hud__bar-row">
        <span class="hud__icon">⚙</span>
        <div class="hud__bar-track"><div class="hud__bar hud__bar--throttle" data-throttle-bar></div></div>
      </div>
      <div class="hud__bar-row" data-fuel-row>
        <span class="hud__icon">${ICON_FUEL}</span>
        <div class="hud__bar-track"><div class="hud__bar hud__bar--fuel" data-fuel-bar></div></div>
      </div>
      <div class="hud__checkpoint" data-checkpoint>
        <span class="hud__icon hud__checkpoint-arrow" data-checkpoint-arrow>${ICON_ARROW}</span>
        <span class="hud__icon">${ICON_CHECKPOINT}</span>
        <span data-checkpoint-distance></span>
      </div>
      <div class="hud__stall" data-stall-warning>ESTOL</div>
    `;

    const scoreEl = this.root.querySelector<HTMLDivElement>('[data-score]');
    const speedEl = this.root.querySelector<HTMLSpanElement>('[data-speed]');
    const altitudeEl = this.root.querySelector<HTMLSpanElement>('[data-altitude]');
    const headingEl = this.root.querySelector<HTMLSpanElement>('[data-heading]');
    const headingNeedleEl = this.root.querySelector<HTMLSpanElement>('[data-heading-needle]');
    const throttleBarEl = this.root.querySelector<HTMLDivElement>('[data-throttle-bar]');
    const fuelBarEl = this.root.querySelector<HTMLDivElement>('[data-fuel-bar]');
    const fuelRowEl = this.root.querySelector<HTMLDivElement>('[data-fuel-row]');
    const checkpointEl = this.root.querySelector<HTMLDivElement>('[data-checkpoint]');
    const checkpointArrowEl = this.root.querySelector<HTMLSpanElement>('[data-checkpoint-arrow]');
    const checkpointDistanceEl = this.root.querySelector<HTMLSpanElement>('[data-checkpoint-distance]');
    const stallWarningEl = this.root.querySelector<HTMLDivElement>('[data-stall-warning]');
    const pauseButton = this.root.querySelector<HTMLButtonElement>('[data-pause]');
    if (
      !scoreEl || !speedEl || !altitudeEl || !headingEl || !headingNeedleEl || !throttleBarEl || !fuelBarEl || !fuelRowEl ||
      !checkpointEl || !checkpointArrowEl || !checkpointDistanceEl || !stallWarningEl || !pauseButton
    ) {
      throw new Error('Markup do HUD incompleto');
    }
    this.scoreEl = scoreEl;
    this.speedEl = speedEl;
    this.altitudeEl = altitudeEl;
    this.headingEl = headingEl;
    this.headingNeedleEl = headingNeedleEl;
    this.throttleBarEl = throttleBarEl;
    this.fuelBarEl = fuelBarEl;
    this.fuelRowEl = fuelRowEl;
    this.checkpointEl = checkpointEl;
    this.checkpointArrowEl = checkpointArrowEl;
    this.checkpointDistanceEl = checkpointDistanceEl;
    this.stallWarningEl = stallWarningEl;

    pauseButton.addEventListener('click', onPauseClick);
    document.body.appendChild(this.root);
  }

  sync(): void {
    const visible = this.game.state === GameState.PLAYING || this.game.state === GameState.PAUSED;
    this.root.classList.toggle('hud--visible', visible);
    if (!visible) return;

    this.scoreEl.textContent = `${this.game.score}`;
    this.speedEl.textContent = this.game.aircraft.airspeedValue.toFixed(0);
    this.altitudeEl.textContent = this.game.altitudeAboveGround.toFixed(0);
    const heading = this.game.aircraft.headingDegrees;
    this.headingEl.textContent = heading.toFixed(0).padStart(3, '0');
    this.headingNeedleEl.style.transform = `rotate(${heading}deg)`;
    this.throttleBarEl.style.width = `${this.game.aircraft.throttleValue * 100}%`;

    const fuelPct = this.game.fuelFraction * 100;
    this.fuelBarEl.style.width = `${fuelPct}%`;
    this.fuelRowEl.classList.toggle('hud__bar-row--low', fuelPct < 20);

    const info = this.game.nextCheckpointInfo;
    if (info) {
      this.checkpointEl.classList.add('hud__checkpoint--visible');
      this.checkpointDistanceEl.textContent = `${Math.round(info.distance)} m`;
      const rotationDeg = (info.bearing * 180) / Math.PI;
      this.checkpointArrowEl.style.transform = `rotate(${rotationDeg}deg)`;
    } else {
      this.checkpointEl.classList.remove('hud__checkpoint--visible');
    }

    this.stallWarningEl.classList.toggle('hud__stall--visible', this.game.aircraft.isStalling);
  }
}
