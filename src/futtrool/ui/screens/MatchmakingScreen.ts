import { t } from '../../i18n';
import { Audio } from '../../audio/Audio';
import { createAdSlotImg, hideAdSlot, showAdSlot } from '../adSlot';

// Spec seção 7: "PROCURANDO PARTIDA..." (2-4s, animado — prepara o ritual
// do online, mesmo sendo local na entrega 1).
const MIN_DURATION_MS = 2000;
const MAX_DURATION_MS = 4000;

export class MatchmakingScreen {
  private readonly root: HTMLDivElement;
  private readonly subtitleEl: HTMLParagraphElement;
  private readonly countdownEl: HTMLParagraphElement;
  private readonly heroAd: HTMLImageElement;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(onCancel: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'screen';
    this.root.innerHTML = `
      <div class="screen__panel">
        <h1 class="screen__title">${t('matchmaking.title')}</h1>
        <p class="screen__subtitle" data-subtitle></p>
        <div data-hero-ad-slot></div>
        <div class="matchmaking-spinner"></div>
        <p class="matchmaking-countdown" data-countdown></p>
        <button type="button" class="screen__button screen__button--secondary" data-cancel>${t('matchmaking.cancel')}</button>
      </div>
    `;

    this.heroAd = createAdSlotImg('loading-hero', 'ad-slot ad-slot--loading-hero');
    this.root.querySelector('[data-hero-ad-slot]')?.replaceWith(this.heroAd);

    const subtitleEl = this.root.querySelector<HTMLParagraphElement>('[data-subtitle]');
    const countdownEl = this.root.querySelector<HTMLParagraphElement>('[data-countdown]');
    const cancelButton = this.root.querySelector<HTMLButtonElement>('[data-cancel]');
    if (!subtitleEl || !countdownEl || !cancelButton) throw new Error('Markup do MatchmakingScreen incompleto');
    this.subtitleEl = subtitleEl;
    this.countdownEl = countdownEl;

    cancelButton.addEventListener('click', () => {
      Audio.click();
      this.stopTimers();
      onCancel();
    });

    document.body.appendChild(this.root);
  }

  show(difficultyLabel: string, onDone: () => void): void {
    this.subtitleEl.textContent = t('matchmaking.subtitle', { difficulty: difficultyLabel });
    this.root.classList.add('screen--visible');
    showAdSlot(this.heroAd, 'loading-hero');

    const duration = MIN_DURATION_MS + Math.random() * (MAX_DURATION_MS - MIN_DURATION_MS);
    const startedAt = performance.now();

    this.stopTimers();
    this.intervalId = setInterval(() => {
      const elapsed = (performance.now() - startedAt) / 1000;
      this.countdownEl.textContent = `${elapsed.toFixed(1)}s`;
    }, 100);
    this.timeoutId = setTimeout(() => {
      this.stopTimers();
      onDone();
    }, duration);
  }

  hide(): void {
    this.stopTimers();
    this.root.classList.remove('screen--visible');
    hideAdSlot('loading-hero');
  }

  refreshAd(): void {
    showAdSlot(this.heroAd, 'loading-hero');
  }

  private stopTimers(): void {
    if (this.timeoutId !== null) clearTimeout(this.timeoutId);
    if (this.intervalId !== null) clearInterval(this.intervalId);
    this.timeoutId = null;
    this.intervalId = null;
  }
}
