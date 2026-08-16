import { t } from '../i18n';
import { Audio } from '../audio/Audio';
import { createAdSlotImg, hideAdSlot, showAdSlot } from './adSlot';

// Overlay do replay automático de gol (spec seção 8). Diferente das telas
// de menu/fim de jogo, isso fica por CIMA do jogo rodando (o canvas
// continua desenhando o replay por baixo) — por isso não usa `.screen`
// (que cobre tudo com um painel opaco), é transparente e só os controles
// em si capturam clique.
export class ReplayOverlay {
  private readonly root: HTMLDivElement;
  private readonly progressFill: HTMLDivElement;
  private readonly reactButton: HTMLButtonElement;
  private readonly saveButton: HTMLButtonElement;
  private readonly skipButton: HTMLButtonElement;
  private readonly lowerThirdAd: HTMLImageElement;

  constructor(onReact: () => void, onSave: () => void, onSkip: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'replay-overlay';
    this.root.innerHTML = `
      <div class="replay-overlay__label"><span class="replay-overlay__dot"></span>${t('replay.label')}</div>
      <div data-lower-third-ad-slot></div>
      <button type="button" class="replay-overlay__react" data-react>${t('replay.react')}</button>
      <div class="replay-overlay__progress"><div class="replay-overlay__progress-fill" data-progress></div></div>
      <div class="replay-overlay__bottom-bar">
        <button type="button" class="screen__button screen__button--secondary" data-save>${t('replay.save')}</button>
        <button type="button" class="screen__button screen__button--secondary" data-skip>${t('replay.skip')}</button>
      </div>
    `;

    this.lowerThirdAd = createAdSlotImg('replay-lower-third', 'ad-slot ad-slot--replay-lower-third');
    this.root.querySelector('[data-lower-third-ad-slot]')?.replaceWith(this.lowerThirdAd);

    const progressFill = this.root.querySelector<HTMLDivElement>('[data-progress]');
    const reactButton = this.root.querySelector<HTMLButtonElement>('[data-react]');
    const saveButton = this.root.querySelector<HTMLButtonElement>('[data-save]');
    const skipButton = this.root.querySelector<HTMLButtonElement>('[data-skip]');
    if (!progressFill || !reactButton || !saveButton || !skipButton) {
      throw new Error('Markup do ReplayOverlay incompleto');
    }
    this.progressFill = progressFill;
    this.reactButton = reactButton;
    this.saveButton = saveButton;
    this.skipButton = skipButton;

    this.reactButton.addEventListener('click', () => {
      Audio.click();
      onReact();
    });
    this.saveButton.addEventListener('click', () => {
      Audio.click();
      onSave();
      this.markSaved();
    });
    this.skipButton.addEventListener('click', () => {
      Audio.click();
      onSkip();
    });

    document.body.appendChild(this.root);
  }

  // `mode: 'watch'` é usado ao assistir um replay já salvo a partir do
  // menu (spec seção 8: "reprodução de replay salvo a partir do menu") —
  // aí não faz sentido Reagir (não é gol ao vivo) nem Salvar (já tá
  // salvo), só um jeito de voltar pra lista.
  show(mode: 'goal' | 'watch' = 'goal'): void {
    const isWatch = mode === 'watch';
    this.reactButton.style.display = isWatch ? 'none' : '';
    this.saveButton.style.display = isWatch ? 'none' : '';
    this.skipButton.textContent = isWatch ? t('watchingReplay.back') : t('replay.skip');

    this.saveButton.disabled = false;
    this.saveButton.textContent = t('replay.save');
    this.reactButton.disabled = false;
    this.reactButton.textContent = t('replay.react');
    this.root.classList.add('replay-overlay--visible');
    showAdSlot(this.lowerThirdAd, 'replay-lower-third');
  }

  hide(): void {
    this.root.classList.remove('replay-overlay--visible');
    hideAdSlot('replay-lower-third');
  }

  refreshAd(): void {
    showAdSlot(this.lowerThirdAd, 'replay-lower-third');
  }

  setProgress(fraction: number): void {
    this.progressFill.style.width = `${Math.min(1, Math.max(0, fraction)) * 100}%`;
  }

  private markSaved(): void {
    this.saveButton.disabled = true;
    this.saveButton.textContent = t('replay.saved');
  }

  markReacted(): void {
    this.reactButton.disabled = true;
    this.reactButton.textContent = t('replay.reacted');
  }
}
