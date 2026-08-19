import { t } from '../../i18n';
import { Audio } from '../../audio/Audio';
import { MATCH_SETTINGS_OPTIONS } from '../../core/constants';
import type { MatchSettings } from '../../core/types';

function formatDuration(ms: number): string {
  return t('matchSettings.duration.value', { minutes: Math.round(ms / 60000) });
}

export class MatchSettingsScreen {
  private readonly root: HTMLDivElement;
  private readonly durationButtons: HTMLButtonElement[];
  private readonly goalButtons: HTMLButtonElement[];

  constructor(onChange: (settings: MatchSettings) => MatchSettings, onBack: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'screen';

    const durationButtonsHtml = MATCH_SETTINGS_OPTIONS.durationsMs
      .map((ms) => `<button type="button" class="pill-options__button" data-duration="${ms}">${formatDuration(ms)}</button>`)
      .join('');
    const goalButtonsHtml = MATCH_SETTINGS_OPTIONS.goalLimits
      .map((n) => `<button type="button" class="pill-options__button" data-goals="${n}">${t('matchSettings.goals.value', { goals: n })}</button>`)
      .join('');

    this.root.innerHTML = `
      <div class="screen__panel">
        <h1 class="screen__title">${t('matchSettings.title')}</h1>
        <p class="screen__subtitle">${t('matchSettings.subtitle')}</p>
        <div class="screen__field">
          <p class="screen__field-label">${t('matchSettings.duration.label')}</p>
          <div class="pill-options" data-duration-options>${durationButtonsHtml}</div>
        </div>
        <div class="screen__field">
          <p class="screen__field-label">${t('matchSettings.goals.label')}</p>
          <div class="pill-options" data-goals-options>${goalButtonsHtml}</div>
        </div>
        <button type="button" class="screen__button screen__button--secondary" data-back>${t('matchSettings.back')}</button>
      </div>
    `;

    this.durationButtons = Array.from(this.root.querySelectorAll<HTMLButtonElement>('[data-duration]'));
    this.goalButtons = Array.from(this.root.querySelectorAll<HTMLButtonElement>('[data-goals]'));
    const backButton = this.root.querySelector<HTMLButtonElement>('[data-back]');
    if (!backButton || this.durationButtons.length === 0 || this.goalButtons.length === 0) {
      throw new Error('Markup do MatchSettingsScreen incompleto');
    }

    this.durationButtons.forEach((button) => {
      button.addEventListener('click', () => {
        Audio.click();
        const durationMs = Number(button.dataset.duration);
        const updated = onChange({ durationMs, goalsToWin: this.currentGoalsToWin() });
        this.syncSelection(updated);
      });
    });

    this.goalButtons.forEach((button) => {
      button.addEventListener('click', () => {
        Audio.click();
        const goalsToWin = Number(button.dataset.goals);
        const updated = onChange({ durationMs: this.currentDurationMs(), goalsToWin });
        this.syncSelection(updated);
      });
    });

    backButton.addEventListener('click', () => {
      Audio.click();
      onBack();
    });

    document.body.appendChild(this.root);
  }

  private currentDurationMs(): number {
    const selected = this.durationButtons.find((b) => b.classList.contains('pill-options__button--selected'));
    return Number(selected?.dataset.duration ?? this.durationButtons[0]!.dataset.duration);
  }

  private currentGoalsToWin(): number {
    const selected = this.goalButtons.find((b) => b.classList.contains('pill-options__button--selected'));
    return Number(selected?.dataset.goals ?? this.goalButtons[0]!.dataset.goals);
  }

  private syncSelection(settings: MatchSettings): void {
    for (const button of this.durationButtons) {
      button.classList.toggle('pill-options__button--selected', Number(button.dataset.duration) === settings.durationMs);
    }
    for (const button of this.goalButtons) {
      button.classList.toggle('pill-options__button--selected', Number(button.dataset.goals) === settings.goalsToWin);
    }
  }

  show(current: MatchSettings): void {
    this.syncSelection(current);
    this.root.classList.add('screen--visible');
  }

  hide(): void {
    this.root.classList.remove('screen--visible');
  }
}
