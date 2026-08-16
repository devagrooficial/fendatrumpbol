import { t } from '../../i18n';
import { Audio } from '../../audio/Audio';
import type { LevelProgress, MatchOutcome, MatchReward } from '../../progression/economy';
import { createAdSlotImg, hideAdSlot, showAdSlot } from '../adSlot';

export type EndGameData = {
  outcome: MatchOutcome;
  score: { p1: number; p2: number };
  difficultyLabel: string;
  reward: MatchReward;
  levelAfter: LevelProgress;
};

const RESULT_CLASS: Record<MatchOutcome, string> = {
  win: 'endgame-result--win',
  loss: 'endgame-result--loss',
  draw: 'endgame-result--draw',
};

const RESULT_KEY: Record<MatchOutcome, 'endgame.result.win' | 'endgame.result.loss' | 'endgame.result.draw'> = {
  win: 'endgame.result.win',
  loss: 'endgame.result.loss',
  draw: 'endgame.result.draw',
};

export class EndGameScreen {
  private readonly root: HTMLDivElement;
  private readonly scoreP1El: HTMLSpanElement;
  private readonly scoreP2El: HTMLSpanElement;
  private readonly resultEl: HTMLParagraphElement;
  private readonly streakEl: HTMLParagraphElement;
  private readonly rowP1Stats: HTMLSpanElement;
  private readonly rowP2Stats: HTMLSpanElement;
  private readonly rowP2Label: HTMLSpanElement;
  private readonly gainLabelEl: HTMLSpanElement;
  private readonly gainValueEl: HTMLSpanElement;
  private readonly gainFillEl: HTMLDivElement;
  private readonly levelLabelEl: HTMLSpanElement;
  private readonly levelValueEl: HTMLSpanElement;
  private readonly levelFillEl: HTMLDivElement;
  private readonly exitButton: HTMLButtonElement;
  private readonly rematchButton: HTMLButtonElement;
  private readonly bannerAd: HTMLImageElement;

  constructor(onExit: () => void, onRematch: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'screen';
    this.root.innerHTML = `
      <div class="screen__panel">
        <h1 class="screen__title">${t('endgame.title')}</h1>
        <div class="endgame-score">
          <span class="endgame-score__p1" data-score-p1></span>
          <span>-</span>
          <span class="endgame-score__p2" data-score-p2></span>
        </div>
        <p class="endgame-result" data-result></p>
        <p class="screen__stat-pill screen__stat-pill--coins" data-streak></p>
        <div class="endgame-table">
          <div class="endgame-row endgame-row--p1">
            <span>${t('hud.you')}</span>
            <span class="endgame-row__stats" data-row-p1-stats></span>
          </div>
          <div class="endgame-row endgame-row--p2">
            <span data-row-p2-label></span>
            <span class="endgame-row__stats" data-row-p2-stats></span>
          </div>
        </div>
        <div class="endgame-xp">
          <div class="endgame-xp-bar endgame-xp-bar--gain">
            <div class="endgame-xp-bar__fill" data-gain-fill></div>
            <span class="endgame-xp-bar__label" data-gain-label></span>
            <span class="endgame-xp-bar__label" data-gain-value></span>
          </div>
          <div class="endgame-xp-bar endgame-xp-bar--level">
            <div class="endgame-xp-bar__fill" data-level-fill></div>
            <span class="endgame-xp-bar__label" data-level-label></span>
            <span class="endgame-xp-bar__label" data-level-value></span>
          </div>
        </div>
        <div data-banner-ad-slot></div>
        <div class="screen__button-row">
          <button type="button" class="screen__button screen__button--secondary" data-exit></button>
          <button type="button" class="screen__button screen__button--outline" data-rematch></button>
        </div>
      </div>
    `;

    this.bannerAd = createAdSlotImg('endgame-banner', 'ad-slot ad-slot--endgame-banner');
    this.root.querySelector('[data-banner-ad-slot]')?.replaceWith(this.bannerAd);

    const scoreP1 = this.root.querySelector<HTMLSpanElement>('[data-score-p1]');
    const scoreP2 = this.root.querySelector<HTMLSpanElement>('[data-score-p2]');
    const resultEl = this.root.querySelector<HTMLParagraphElement>('[data-result]');
    const streakEl = this.root.querySelector<HTMLParagraphElement>('[data-streak]');
    const rowP1Stats = this.root.querySelector<HTMLSpanElement>('[data-row-p1-stats]');
    const rowP2Stats = this.root.querySelector<HTMLSpanElement>('[data-row-p2-stats]');
    const rowP2Label = this.root.querySelector<HTMLSpanElement>('[data-row-p2-label]');
    const gainLabelEl = this.root.querySelector<HTMLSpanElement>('[data-gain-label]');
    const gainValueEl = this.root.querySelector<HTMLSpanElement>('[data-gain-value]');
    const gainFillEl = this.root.querySelector<HTMLDivElement>('[data-gain-fill]');
    const levelLabelEl = this.root.querySelector<HTMLSpanElement>('[data-level-label]');
    const levelValueEl = this.root.querySelector<HTMLSpanElement>('[data-level-value]');
    const levelFillEl = this.root.querySelector<HTMLDivElement>('[data-level-fill]');
    const exitButton = this.root.querySelector<HTMLButtonElement>('[data-exit]');
    const rematchButton = this.root.querySelector<HTMLButtonElement>('[data-rematch]');

    if (
      !scoreP1 ||
      !scoreP2 ||
      !resultEl ||
      !streakEl ||
      !rowP1Stats ||
      !rowP2Stats ||
      !rowP2Label ||
      !gainLabelEl ||
      !gainValueEl ||
      !gainFillEl ||
      !levelLabelEl ||
      !levelValueEl ||
      !levelFillEl ||
      !exitButton ||
      !rematchButton
    ) {
      throw new Error('Markup do EndGameScreen incompleto');
    }

    this.scoreP1El = scoreP1;
    this.scoreP2El = scoreP2;
    this.resultEl = resultEl;
    this.streakEl = streakEl;
    this.rowP1Stats = rowP1Stats;
    this.rowP2Stats = rowP2Stats;
    this.rowP2Label = rowP2Label;
    this.gainLabelEl = gainLabelEl;
    this.gainValueEl = gainValueEl;
    this.gainFillEl = gainFillEl;
    this.levelLabelEl = levelLabelEl;
    this.levelValueEl = levelValueEl;
    this.levelFillEl = levelFillEl;
    this.exitButton = exitButton;
    this.rematchButton = rematchButton;

    this.exitButton.addEventListener('click', () => {
      Audio.click();
      onExit();
    });
    this.rematchButton.addEventListener('click', () => {
      Audio.click();
      onRematch();
    });

    document.body.appendChild(this.root);
  }

  show(data: EndGameData): void {
    this.scoreP1El.textContent = String(data.score.p1);
    this.scoreP2El.textContent = String(data.score.p2);

    this.resultEl.textContent = t(RESULT_KEY[data.outcome]);
    this.resultEl.className = `endgame-result ${RESULT_CLASS[data.outcome]}`;

    // Só mostra a partir de 2 vitórias seguidas — "sequência de 1" não lê
    // bem como sequência, mesmo já valendo bônus de moeda desde a 1ª (ver economy.ts).
    this.streakEl.textContent = data.reward.newStreak > 1 ? t('endgame.streak', { streak: data.reward.newStreak }) : '';

    this.rowP1Stats.textContent = `${t('endgame.goals')}: ${data.score.p1}`;
    this.rowP2Label.textContent = `IA (${data.difficultyLabel})`;
    this.rowP2Stats.textContent = `${t('endgame.goals')}: ${data.score.p2}`;

    this.gainLabelEl.textContent = t('endgame.level', { level: data.levelAfter.level });
    this.gainValueEl.textContent = t('endgame.xpGained', { xp: data.reward.xp });
    this.levelLabelEl.textContent = t('endgame.level', { level: data.levelAfter.level });
    this.levelValueEl.textContent = `${data.levelAfter.levelXp} / ${data.levelAfter.xpToNextLevel} XP`;

    this.exitButton.textContent = t('endgame.exit.reward', { coins: data.reward.coins });
    this.rematchButton.textContent = t('endgame.rematch.reward', { coins: data.reward.coins });

    // Zera antes de mostrar pra garantir que a transição de largura anima
    // (senão, se já estivesse em 100% de uma vez anterior, não haveria
    // mudança de valor pra disparar a animação CSS).
    this.gainFillEl.style.width = '0%';
    this.levelFillEl.style.width = '0%';
    this.root.classList.add('screen--visible');
    showAdSlot(this.bannerAd, 'endgame-banner');

    requestAnimationFrame(() => {
      this.gainFillEl.style.width = '100%';
      const pct = Math.min(100, (data.levelAfter.levelXp / data.levelAfter.xpToNextLevel) * 100);
      this.levelFillEl.style.width = `${pct}%`;
    });
  }

  hide(): void {
    this.root.classList.remove('screen--visible');
    hideAdSlot('endgame-banner');
  }

  refreshAd(): void {
    showAdSlot(this.bannerAd, 'endgame-banner');
  }
}
