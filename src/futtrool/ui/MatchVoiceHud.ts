// Cards de voz durante a partida em si (quickMatch/sala/campeonato
// jogando) — a partida é 100% canvas (ver render/renderer.ts), sem card
// de pessoa nenhum ali por padrão, então essa é uma faixa DOM flutuante
// só com quem está de verdade na sala de voz daquela partida (ver
// startVoiceIfAccompanied em main.ts — só existe partida com voz quando
// tem outro humano de verdade, nunca sozinho contra bot). Mesmo visual de
// card usado em TournamentWaitingScreen, só que aqui é sempre 1 linha por
// jogador humano da partida (nunca bot).

import { bindMicButton } from '../voice/jitsiVoice';

export type MatchVoicePlayer = { name: string; isYou: boolean };

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || '?';
}

export class MatchVoiceHud {
  private readonly root: HTMLDivElement;
  private micUnbind: (() => void) | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'match-voice-hud';
    document.body.appendChild(this.root);
  }

  show(players: MatchVoicePlayer[]): void {
    this.micUnbind?.();
    this.micUnbind = null;

    this.root.innerHTML = players
      .map(
        (p) => `
      <div class="match-voice-hud__card${p.isYou ? ' match-voice-hud__card--you' : ''}">
        <span class="match-voice-hud__avatar">${initials(p.name)}</span>
        <span class="match-voice-hud__name">${p.name}</span>
        ${p.isYou ? '<button type="button" class="match-voice-hud__mic voice-mic-button" data-mic-you></button>' : ''}
      </div>
    `,
      )
      .join('');

    const micButton = this.root.querySelector<HTMLButtonElement>('[data-mic-you]');
    if (micButton) this.micUnbind = bindMicButton(micButton);

    this.root.classList.add('match-voice-hud--visible');
  }

  hide(): void {
    this.micUnbind?.();
    this.micUnbind = null;
    this.root.classList.remove('match-voice-hud--visible');
    this.root.innerHTML = '';
  }
}
