import { t } from '../../i18n';
import { Audio } from '../../audio/Audio';
import type { ProgressionState } from '../../progression/storage';
import { createAdSlotImg, hideAdSlot, showAdSlot } from '../adSlot';

export class MenuScreen {
  private readonly root: HTMLDivElement;
  private readonly levelEl: HTMLSpanElement;
  private readonly coinsEl: HTMLSpanElement;
  private readonly soundToggle: HTMLButtonElement;
  private readonly footerAd: HTMLImageElement;

  constructor(onPlay: () => void, onReplays: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'screen';
    this.root.innerHTML = `
      <div class="screen__panel">
        <h1 class="screen__title">${t('menu.title')}</h1>
        <p class="screen__subtitle">${t('menu.subtitle')}</p>
        <div class="screen__stat-row">
          <span class="screen__stat-pill" data-level></span>
          <span class="screen__stat-pill screen__stat-pill--coins" data-coins></span>
        </div>
        <button type="button" class="screen__button" data-play>${t('menu.play')}</button>
        <div class="screen__button-row">
          <button type="button" class="screen__button screen__button--secondary" data-inventory>${t('menu.inventory')}</button>
          <button type="button" class="screen__button screen__button--secondary" data-shop>${t('menu.shop')}</button>
        </div>
        <button type="button" class="screen__button screen__button--secondary" data-replays>${t('menu.replays')}</button>
        <p class="screen__placeholder-note" data-placeholder-note></p>
        <button type="button" class="screen__toggle" data-sound></button>
        <div data-footer-ad-slot></div>
      </div>
    `;

    this.footerAd = createAdSlotImg('menu-footer', 'ad-slot ad-slot--menu-footer');
    this.root.querySelector('[data-footer-ad-slot]')?.replaceWith(this.footerAd);

    const levelEl = this.root.querySelector<HTMLSpanElement>('[data-level]');
    const coinsEl = this.root.querySelector<HTMLSpanElement>('[data-coins]');
    const playButton = this.root.querySelector<HTMLButtonElement>('[data-play]');
    const inventoryButton = this.root.querySelector<HTMLButtonElement>('[data-inventory]');
    const shopButton = this.root.querySelector<HTMLButtonElement>('[data-shop]');
    const replaysButton = this.root.querySelector<HTMLButtonElement>('[data-replays]');
    const placeholderNote = this.root.querySelector<HTMLParagraphElement>('[data-placeholder-note]');
    const soundToggle = this.root.querySelector<HTMLButtonElement>('[data-sound]');
    if (!levelEl || !coinsEl || !playButton || !inventoryButton || !shopButton || !replaysButton || !placeholderNote || !soundToggle) {
      throw new Error('Markup do MenuScreen incompleto');
    }
    this.levelEl = levelEl;
    this.coinsEl = coinsEl;
    this.soundToggle = soundToggle;

    playButton.addEventListener('click', () => {
      Audio.click();
      onPlay();
    });

    replaysButton.addEventListener('click', () => {
      Audio.click();
      onReplays();
    });

    // Inventário/Loja: placeholder da entrega 1 (spec seção 7) — só avisa
    // que ainda não existe, não é uma tela de verdade.
    const showPlaceholder = (): void => {
      Audio.click();
      placeholderNote.textContent = t('menu.comingSoon');
    };
    inventoryButton.addEventListener('click', showPlaceholder);
    shopButton.addEventListener('click', showPlaceholder);

    soundToggle.addEventListener('click', () => {
      Audio.setEnabled(!Audio.isEnabled);
      this.syncSoundToggle();
      Audio.click();
    });
    this.syncSoundToggle();

    document.body.appendChild(this.root);
  }

  private syncSoundToggle(): void {
    this.soundToggle.textContent = Audio.isEnabled ? t('menu.sound.on') : t('menu.sound.off');
  }

  // Chamado quando o ads.config.json termina de carregar DEPOIS da tela já
  // estar visível (a primeira exibição do menu, no boot, quase sempre
  // corre com o fetch — ver main.ts) — só atualiza o anúncio, sem reiniciar
  // nada mais da tela.
  refreshAd(): void {
    showAdSlot(this.footerAd, 'menu-footer');
  }

  show(progression: ProgressionState): void {
    this.levelEl.textContent = t('menu.level', { level: progression.level });
    this.coinsEl.textContent = t('menu.coins', { coins: progression.coins });
    this.root.classList.add('screen--visible');
    showAdSlot(this.footerAd, 'menu-footer');
  }

  hide(): void {
    this.root.classList.remove('screen--visible');
    hideAdSlot('menu-footer');
  }
}
