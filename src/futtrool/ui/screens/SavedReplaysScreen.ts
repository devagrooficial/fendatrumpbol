import { t } from '../../i18n';
import { Audio } from '../../audio/Audio';
import type { SavedReplay } from '../../replay/storage';

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export class SavedReplaysScreen {
  private readonly root: HTMLDivElement;
  private readonly listEl: HTMLDivElement;
  private replays: SavedReplay[] = [];

  constructor(onWatch: (replay: SavedReplay) => void, onDelete: (id: string) => void, onBack: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'screen';
    this.root.innerHTML = `
      <div class="screen__panel">
        <h1 class="screen__title">${t('replays.title')}</h1>
        <div class="saved-replays-list" data-list></div>
        <button type="button" class="screen__button screen__button--secondary" data-back>${t('replays.back')}</button>
      </div>
    `;

    const listEl = this.root.querySelector<HTMLDivElement>('[data-list]');
    const backButton = this.root.querySelector<HTMLButtonElement>('[data-back]');
    if (!listEl || !backButton) throw new Error('Markup do SavedReplaysScreen incompleto');
    this.listEl = listEl;

    this.listEl.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const row = target.closest<HTMLElement>('[data-id]');
      if (!row) return;
      const id = row.dataset.id;
      const replay = this.replays.find((r) => r.id === id);
      if (!replay) return;

      if (target.closest('[data-watch]')) {
        Audio.click();
        onWatch(replay);
      } else if (target.closest('[data-delete]')) {
        Audio.click();
        onDelete(replay.id);
      }
    });

    backButton.addEventListener('click', () => {
      Audio.click();
      onBack();
    });

    document.body.appendChild(this.root);
  }

  show(replays: SavedReplay[]): void {
    this.replays = replays;
    this.listEl.innerHTML =
      replays.length === 0
        ? `<p class="screen__empty-note">${t('replays.empty')}</p>`
        : replays
            .map(
              (replay) => `
                <div class="saved-replay-row" data-id="${replay.id}">
                  <div class="saved-replay-row__info">
                    <span class="saved-replay-row__score">${t('replays.score', { p1: replay.score.p1, p2: replay.score.p2 })}</span>
                    <span class="saved-replay-row__date">${formatDate(replay.savedAt)}</span>
                  </div>
                  <div class="saved-replay-row__actions">
                    <button type="button" class="screen__button screen__button--secondary" data-watch>${t('replays.watch')}</button>
                    <button type="button" class="screen__button screen__button--secondary" data-delete>${t('replays.delete')}</button>
                  </div>
                </div>
              `,
            )
            .join('');

    this.root.classList.add('screen--visible');
  }

  hide(): void {
    this.root.classList.remove('screen--visible');
  }
}
