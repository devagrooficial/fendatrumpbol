import { t } from '../../i18n';
import { Audio } from '../../audio/Audio';
import type { AiDifficulty } from '../../core/ai/profiles';

const CARDS: { id: AiDifficulty; labelKey: 'difficulty.novato' | 'difficulty.profissional' | 'difficulty.lenda'; descKey: string; color: string }[] = [
  { id: 'novato', labelKey: 'difficulty.novato', descKey: 'difficulty.novato.desc', color: '#4ade80' },
  { id: 'profissional', labelKey: 'difficulty.profissional', descKey: 'difficulty.profissional.desc', color: '#4b9bf0' },
  { id: 'lenda', labelKey: 'difficulty.lenda', descKey: 'difficulty.lenda.desc', color: '#ffa83d' },
];

export class DifficultyScreen {
  private readonly root: HTMLDivElement;

  constructor(onSelect: (difficulty: AiDifficulty) => void, onBack: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'screen';

    const cardsHtml = CARDS.map(
      (card) => `
        <button type="button" class="difficulty-card" style="--difficulty-color: ${card.color}" data-difficulty="${card.id}">
          <span class="difficulty-card__label">${t(card.labelKey as 'difficulty.novato')}</span>
          <span class="difficulty-card__desc">${t(card.descKey as 'difficulty.novato.desc')}</span>
        </button>
      `,
    ).join('');

    this.root.innerHTML = `
      <div class="screen__panel">
        <h1 class="screen__title">${t('difficulty.title')}</h1>
        <div class="difficulty-cards">${cardsHtml}</div>
        <button type="button" class="screen__button screen__button--secondary" data-back>${t('difficulty.back')}</button>
      </div>
    `;

    this.root.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach((button) => {
      button.addEventListener('click', () => {
        const difficulty = button.dataset.difficulty as AiDifficulty;
        Audio.click();
        onSelect(difficulty);
      });
    });

    const backButton = this.root.querySelector<HTMLButtonElement>('[data-back]');
    if (!backButton) throw new Error('Markup do DifficultyScreen incompleto');
    backButton.addEventListener('click', () => {
      Audio.click();
      onBack();
    });

    document.body.appendChild(this.root);
  }

  show(): void {
    this.root.classList.add('screen--visible');
  }

  hide(): void {
    this.root.classList.remove('screen--visible');
  }
}
