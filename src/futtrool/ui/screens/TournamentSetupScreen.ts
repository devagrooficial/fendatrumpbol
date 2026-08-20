// Escolha de como entrar no campeonato: 1v1 sozinho (fila direta), ou
// 2v2/3v3 criando um time e convidando gente por link — igual ao "Chamar
// amigo" das partidas normais (createRoom/joinRoom), só que o convite
// aqui forma UM GRUPO que vira uma vaga inteira da chave, não uma partida
// isolada.

import { t } from '../../i18n';
import { Audio } from '../../audio/Audio';

export type TournamentSetupChoice = { kind: 'solo' } | { kind: 'createTeam'; teamSize: number };

const TEAM_SIZES = [2, 3];

export class TournamentSetupScreen {
  private readonly root: HTMLDivElement;

  constructor(onChoose: (choice: TournamentSetupChoice) => void, onBack: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'screen';

    const teamRowsHtml = TEAM_SIZES.map(
      (size) => `
        <button type="button" class="tournament-setup-card" data-team-size="${size}">
          <span class="tournament-setup-card__title">${t('tournament.setup.team', { size })}</span>
          <span class="tournament-setup-card__desc">${t('tournament.setup.teamDesc')}</span>
        </button>
      `,
    ).join('');

    this.root.innerHTML = `
      <div class="screen__panel">
        <h1 class="screen__title">${t('tournament.setup.title')}</h1>
        <p class="screen__subtitle">${t('tournament.setup.subtitle')}</p>
        <p class="screen__placeholder-note screen__placeholder-note--warning">${t('tournament.setup.disconnectWarning')}</p>
        <button type="button" class="tournament-setup-card tournament-setup-card--solo" data-solo>
          <span class="tournament-setup-card__title">${t('tournament.setup.solo')}</span>
          <span class="tournament-setup-card__desc">${t('tournament.setup.soloDesc')}</span>
        </button>
        ${teamRowsHtml}
        <button type="button" class="screen__button screen__button--secondary" data-back>${t('tournament.setup.back')}</button>
      </div>
    `;

    const soloButton = this.root.querySelector<HTMLButtonElement>('[data-solo]');
    const backButton = this.root.querySelector<HTMLButtonElement>('[data-back]');
    if (!soloButton || !backButton) throw new Error('Markup do TournamentSetupScreen incompleto');

    soloButton.addEventListener('click', () => {
      Audio.click();
      onChoose({ kind: 'solo' });
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-team-size]').forEach((button) => {
      button.addEventListener('click', () => {
        Audio.click();
        onChoose({ kind: 'createTeam', teamSize: Number(button.dataset.teamSize) });
      });
    });

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
