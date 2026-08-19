// Tela "Ambiente de espera" do campeonato: mostra quantas vagas já
// preencheram (0-8) enquanto o torneio ainda não começou pra valer.
// Sozinho (única opção que funciona nessa entrega, ver
// server/src/index.ts TOURNAMENT_TEAM_SIZE), mostra as próprias
// estatísticas de quem está esperando — quando dupla/trio existir, cada
// card de time extra some aqui (o layout já reserva o espaço, incluindo
// o bloco de áudio/Jitsi, que só chega numa entrega futura).

import { t } from '../../i18n';
import { Audio } from '../../audio/Audio';
import type { ProgressionState } from '../../progression/storage';
import type { TournamentSnapshot } from '../../net/protocol';

const TOURNAMENT_SLOTS = 8;

export class TournamentWaitingScreen {
  private readonly root: HTMLDivElement;
  private readonly slotsFilledEl: HTMLSpanElement;
  private readonly progressDotsEl: HTMLDivElement;
  private readonly levelEl: HTMLSpanElement;
  private readonly coinsEl: HTMLSpanElement;
  private readonly streakEl: HTMLSpanElement;

  constructor(onLeave: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'screen';
    this.root.innerHTML = `
      <div class="screen__panel tournament-waiting">
        <h1 class="screen__title">${t('tournament.waiting.title')}</h1>
        <p class="screen__subtitle" data-slots-label></p>
        <div class="tournament-waiting__dots" data-progress-dots></div>

        <div class="tournament-waiting__you">
          <p class="tournament-waiting__section-label">${t('tournament.waiting.you')}</p>
          <div class="tournament-waiting__stats">
            <span class="screen__stat-pill" data-level></span>
            <span class="screen__stat-pill screen__stat-pill--coins" data-coins></span>
            <span class="screen__stat-pill" data-streak></span>
          </div>
        </div>

        <div class="tournament-waiting__teammates" data-teammates-note>
          <p class="tournament-waiting__section-label">${t('tournament.waiting.audio')}</p>
          <p class="tournament-waiting__placeholder">${t('tournament.waiting.audioComingSoon')}</p>
        </div>

        <button type="button" class="screen__button screen__button--secondary" data-leave>${t('tournament.waiting.leave')}</button>
      </div>
    `;

    const slotsFilledEl = this.root.querySelector<HTMLParagraphElement>('[data-slots-label]');
    const progressDotsEl = this.root.querySelector<HTMLDivElement>('[data-progress-dots]');
    const levelEl = this.root.querySelector<HTMLSpanElement>('[data-level]');
    const coinsEl = this.root.querySelector<HTMLSpanElement>('[data-coins]');
    const streakEl = this.root.querySelector<HTMLSpanElement>('[data-streak]');
    const leaveButton = this.root.querySelector<HTMLButtonElement>('[data-leave]');
    if (!slotsFilledEl || !progressDotsEl || !levelEl || !coinsEl || !streakEl || !leaveButton) {
      throw new Error('Markup do TournamentWaitingScreen incompleto');
    }
    this.slotsFilledEl = slotsFilledEl;
    this.progressDotsEl = progressDotsEl;
    this.levelEl = levelEl;
    this.coinsEl = coinsEl;
    this.streakEl = streakEl;

    leaveButton.addEventListener('click', () => {
      Audio.click();
      onLeave();
    });

    document.body.appendChild(this.root);
  }

  show(progression: ProgressionState): void {
    this.levelEl.textContent = t('menu.level', { level: progression.level });
    this.coinsEl.textContent = t('menu.coins', { coins: progression.coins });
    this.streakEl.textContent = t('tournament.waiting.streak', { streak: progression.winStreak });
    this.updateFilled(0);
    this.root.classList.add('screen--visible');
  }

  update(tournament: TournamentSnapshot): void {
    this.updateFilled(tournament.teams.length);
  }

  private updateFilled(filled: number): void {
    this.slotsFilledEl.textContent = t('tournament.waiting.slots', { filled, total: TOURNAMENT_SLOTS });
    this.progressDotsEl.innerHTML = Array.from({ length: TOURNAMENT_SLOTS }, (_, i) => {
      const cls = i < filled ? 'tournament-waiting__dot tournament-waiting__dot--filled' : 'tournament-waiting__dot';
      return `<span class="${cls}"></span>`;
    }).join('');
  }

  hide(): void {
    this.root.classList.remove('screen--visible');
  }
}
