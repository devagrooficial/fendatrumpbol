// "Ambiente de espera" do campeonato — duas fases possíveis:
// 1) Formando o TIME (só dupla/trio, antes de ter todo mundo — mostra o
//    link de convite e um card por pessoa que já entrou, igual à espera
//    de "Chamar amigo" das partidas normais).
// 2) Esperando o CAMPEONATO encher (0-8 vagas) — mostra um card por
//    integrante do MEU time (só eu, se for 1v1).

import { t } from '../../i18n';
import { Audio } from '../../audio/Audio';
import { bindMicButton } from '../../voice/jitsiVoice';
import type { ProgressionState } from '../../progression/storage';
import type { TournamentSnapshot, TournamentTeamFormationSnapshot } from '../../net/protocol';

const TOURNAMENT_SLOTS = 8;

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || '?';
}

// Botão de mic só no MEU card — o de parceiro de time é só informativo
// (nome/avatar), não dá pra controlar o microfone de outra pessoa. Sem
// voz nenhuma (1v1 sozinho, ver showTournamentQueue) nem chama isso.
function memberCardHtml(name: string, isYou: boolean): string {
  return `
    <div class="tournament-member-card${isYou ? ' tournament-member-card--you' : ''}">
      <span class="tournament-member-card__avatar">${initials(name)}</span>
      <span class="tournament-member-card__name">${name}${isYou ? ` (${t('tournament.waiting.youTag')})` : ''}</span>
      ${isYou ? '<button type="button" class="tournament-member-card__mic voice-mic-button" data-mic-you></button>' : ''}
    </div>
  `;
}

export class TournamentWaitingScreen {
  private readonly root: HTMLDivElement;
  private readonly titleEl: HTMLHeadingElement;
  private readonly subtitleEl: HTMLParagraphElement;
  private readonly progressEl: HTMLDivElement;
  private readonly dotsEl: HTMLDivElement;
  private readonly linkFieldEl: HTMLDivElement;
  private readonly linkInput: HTMLInputElement;
  private readonly copyStatusEl: HTMLParagraphElement;
  private readonly membersEl: HTMLDivElement;
  // Limpeza do bind anterior do botão de mic — os métodos show* abaixo
  // recriam os cards inteiros via innerHTML a cada atualização, então sem
  // isso sobraria um listener/assinatura de voiceState apontando pra um
  // <button> que já nem está mais no DOM (ver bindMicButton em
  // voice/jitsiVoice.ts).
  private micUnbind: (() => void) | null = null;

  private readonly startNowButton: HTMLButtonElement;

  constructor(onLeave: () => void, onStartNow: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'screen';
    this.root.innerHTML = `
      <div class="screen__panel tournament-waiting">
        <h1 class="screen__title" data-title></h1>
        <p class="screen__subtitle" data-subtitle></p>

        <div class="tournament-waiting__progress" data-progress hidden>
          <div class="tournament-waiting__dots" data-progress-dots></div>
        </div>

        <div class="screen__field" data-link-field hidden>
          <p class="screen__field-label">${t('tournament.waiting.linkLabel')}</p>
          <div class="screen__field-row">
            <input type="text" class="screen__input" data-link-input readonly />
            <button type="button" class="screen__button screen__button--secondary" data-copy-link>${t('tournament.waiting.copyLink')}</button>
          </div>
          <p class="screen__placeholder-note" data-copy-status></p>
        </div>

        <div class="tournament-member-cards" data-members></div>

        <button type="button" class="screen__button screen__button--secondary" data-start-now hidden>${t('tournament.waiting.startNow')}</button>
        <button type="button" class="screen__button screen__button--secondary" data-leave>${t('tournament.waiting.leave')}</button>
      </div>
    `;

    const titleEl = this.root.querySelector<HTMLHeadingElement>('[data-title]');
    const subtitleEl = this.root.querySelector<HTMLParagraphElement>('[data-subtitle]');
    const progressEl = this.root.querySelector<HTMLDivElement>('[data-progress]');
    const dotsEl = this.root.querySelector<HTMLDivElement>('[data-progress-dots]');
    const linkFieldEl = this.root.querySelector<HTMLDivElement>('[data-link-field]');
    const linkInput = this.root.querySelector<HTMLInputElement>('[data-link-input]');
    const copyButton = this.root.querySelector<HTMLButtonElement>('[data-copy-link]');
    const copyStatusEl = this.root.querySelector<HTMLParagraphElement>('[data-copy-status]');
    const membersEl = this.root.querySelector<HTMLDivElement>('[data-members]');
    const startNowButton = this.root.querySelector<HTMLButtonElement>('[data-start-now]');
    const leaveButton = this.root.querySelector<HTMLButtonElement>('[data-leave]');
    if (
      !titleEl ||
      !subtitleEl ||
      !progressEl ||
      !dotsEl ||
      !linkFieldEl ||
      !linkInput ||
      !copyButton ||
      !copyStatusEl ||
      !membersEl ||
      !startNowButton ||
      !leaveButton
    ) {
      throw new Error('Markup do TournamentWaitingScreen incompleto');
    }
    this.titleEl = titleEl;
    this.subtitleEl = subtitleEl;
    this.progressEl = progressEl;
    this.dotsEl = dotsEl;
    this.linkFieldEl = linkFieldEl;
    this.linkInput = linkInput;
    this.copyStatusEl = copyStatusEl;
    this.membersEl = membersEl;
    this.startNowButton = startNowButton;

    copyButton.addEventListener('click', () => {
      Audio.click();
      void this.copyLink();
    });

    startNowButton.addEventListener('click', () => {
      Audio.click();
      onStartNow();
    });

    leaveButton.addEventListener('click', () => {
      Audio.click();
      onLeave();
    });

    document.body.appendChild(this.root);
  }

  // Chamar sempre DEPOIS de trocar this.membersEl.innerHTML — procura o
  // botão do MEU card (se teve um nesse render) e liga ele de novo.
  private rebindMicButton(): void {
    this.micUnbind?.();
    this.micUnbind = null;
    const micButton = this.membersEl.querySelector<HTMLButtonElement>('[data-mic-you]');
    if (micButton) this.micUnbind = bindMicButton(micButton);
  }

  private async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.linkInput.value);
      this.copyStatusEl.textContent = t('matchmaking.online.linkCopied');
    } catch {
      this.linkInput.select();
      this.copyStatusEl.textContent = t('matchmaking.online.copyManually');
    }
  }

  // Fase 1: time (dupla/trio) ainda se formando — mostra o link e quem já
  // entrou. `myName` marca meu próprio card entre os membros.
  showTeamFormation(team: TournamentTeamFormationSnapshot, inviteLink: string, myName: string): void {
    this.titleEl.textContent = t('tournament.waiting.formingTeam');
    this.subtitleEl.textContent = t('tournament.waiting.formingTeamSubtitle', { filled: team.members.length, total: team.teamSize });
    this.progressEl.hidden = true;
    this.linkFieldEl.hidden = false;
    this.linkInput.value = inviteLink;
    this.copyStatusEl.textContent = '';
    this.startNowButton.hidden = true; // "com bots" só faz sentido na fila 1v1, ver showTournamentQueue

    this.membersEl.innerHTML = team.members.map((m) => memberCardHtml(m.name, m.name === myName)).join('');
    this.rebindMicButton();

    this.root.classList.add('screen--visible');
  }

  // Fase 2: já é uma vaga de verdade, esperando o CAMPEONATO encher (0-8).
  // `myTeamNames` são os nomes do MEU time (só eu, se 1v1). `myName` marca
  // qual desses cards é o meu, igual à fase 1.
  showTournamentQueue(tournament: TournamentSnapshot, myTeamNames: string[], myName: string, progression: ProgressionState): void {
    this.titleEl.textContent = t('tournament.waiting.title');
    this.subtitleEl.textContent = t('tournament.waiting.slots', { filled: tournament.teams.length, total: TOURNAMENT_SLOTS });
    this.progressEl.hidden = false;
    this.linkFieldEl.hidden = true;
    this.updateDots(tournament.teams.length);
    // "Começar mesmo assim (com bots)" — só 1v1 por enquanto (preencher
    // vaga de dupla/trio inteira com bot ainda não está implementado, ver
    // server/src/index.ts tournamentStartNow).
    this.startNowButton.hidden = tournament.teamSize !== 1;

    if (myTeamNames.length <= 1) {
      this.membersEl.innerHTML = `
        <div class="tournament-member-card tournament-member-card--you tournament-member-card--stats">
          <span class="tournament-member-card__avatar">${initials(myTeamNames[0] ?? '?')}</span>
          <div>
            <span class="tournament-member-card__name">${myTeamNames[0] ?? t('tournament.waiting.youTag')}</span>
            <div class="tournament-member-card__stats">
              <span class="screen__stat-pill">${t('menu.level', { level: progression.level })}</span>
              <span class="screen__stat-pill screen__stat-pill--coins">${t('menu.coins', { coins: progression.coins })}</span>
            </div>
          </div>
        </div>
      `;
    } else {
      this.membersEl.innerHTML = myTeamNames.map((name) => memberCardHtml(name, name === myName)).join('');
    }
    this.rebindMicButton();

    this.root.classList.add('screen--visible');
  }

  private updateDots(filled: number): void {
    this.dotsEl.innerHTML = Array.from({ length: TOURNAMENT_SLOTS }, (_, i) => {
      const cls = i < filled ? 'tournament-waiting__dot tournament-waiting__dot--filled' : 'tournament-waiting__dot';
      return `<span class="${cls}"></span>`;
    }).join('');
  }

  hide(): void {
    this.micUnbind?.();
    this.micUnbind = null;
    this.root.classList.remove('screen--visible');
  }
}
