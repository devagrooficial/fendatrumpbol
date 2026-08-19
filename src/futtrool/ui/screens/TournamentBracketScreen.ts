// Tela "Desenho da chave" do campeonato: quartas -> semifinal -> final,
// com o troféu esperando o campeão no fim. Tela cheia (não modal —
// precisa de espaço horizontal pras 3 rodadas lado a lado) igual ao
// MenuScreen. Renderiza o retrato inteiro de novo a cada `update()` — só
// 7 caixinhas pequenas, recriar tudo é mais simples que tentar
// diff/atualizar cada campo à mão, e o custo é irrelevante.

import { t } from '../../i18n';
import { Audio } from '../../audio/Audio';
import type { TournamentMatchInfo, TournamentRound, TournamentSnapshot } from '../../net/protocol';

function teamLabel(snapshot: TournamentSnapshot, slot: number | null): string {
  if (slot === null) return t('tournament.bracket.tbd');
  const team = snapshot.teams[slot];
  if (!team) return t('tournament.bracket.tbd');
  return team.names.join(' & ');
}

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || '?';
}

function matchBoxHtml(snapshot: TournamentSnapshot, match: TournamentMatchInfo, mySlot: number | null): string {
  const nameA = teamLabel(snapshot, match.teamSlotA);
  const nameB = teamLabel(snapshot, match.teamSlotB);
  const winnerA = match.winnerTeamSlot !== null && match.winnerTeamSlot === match.teamSlotA;
  const winnerB = match.winnerTeamSlot !== null && match.winnerTeamSlot === match.teamSlotB;
  const isMineA = mySlot !== null && mySlot === match.teamSlotA;
  const isMineB = mySlot !== null && mySlot === match.teamSlotB;

  const statusClass = `bracket__status-pill bracket__status-pill--${match.status}`;
  const statusLabel =
    match.status === 'playing'
      ? t('tournament.bracket.playing')
      : match.status === 'completed'
        ? match.forfeitedTeamSlot !== null
          ? t('tournament.bracket.walkover')
          : t('tournament.bracket.done')
        : t('tournament.bracket.pending');

  const rowHtml = (name: string, score: number, isWinner: boolean, isMine: boolean, known: boolean): string => `
    <div class="bracket__team${isWinner ? ' bracket__team--winner' : ''}${isMine ? ' bracket__team--mine' : ''}${!known ? ' bracket__team--tbd' : ''}">
      <span class="bracket__team-avatar">${known ? initials(name) : '?'}</span>
      <span class="bracket__team-name">${name}</span>
      ${match.status !== 'pending' && known ? `<span class="bracket__team-score">${score}</span>` : ''}
      ${isWinner ? '<span class="bracket__team-crown">👑</span>' : ''}
    </div>
  `;

  return `
    <div class="bracket__match bracket__match--${match.status}">
      <span class="${statusClass}">${statusLabel}</span>
      ${rowHtml(nameA, match.scoreA, winnerA, isMineA, match.teamSlotA !== null)}
      ${rowHtml(nameB, match.scoreB, winnerB, isMineB, match.teamSlotB !== null)}
    </div>
  `;
}

export class TournamentBracketScreen {
  private readonly root: HTMLDivElement;
  private readonly contentEl: HTMLDivElement;

  constructor(onBack: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'menu-screen tournament-bracket-screen';
    this.root.innerHTML = `
      <div class="menu-screen__scroll">
        <header class="menu-screen__header">
          <h1 class="menu-screen__title">${t('tournament.bracket.title')}</h1>
          <p class="menu-screen__subtitle" data-champion-banner></p>
        </header>
        <main class="menu-screen__main tournament-bracket-main">
          <div class="bracket" data-bracket></div>
        </main>
        <button type="button" class="screen__button screen__button--secondary tournament-bracket__back" data-back>${t('tournament.bracket.back')}</button>
      </div>
    `;

    const bracketEl = this.root.querySelector<HTMLDivElement>('[data-bracket]');
    const backButton = this.root.querySelector<HTMLButtonElement>('[data-back]');
    if (!bracketEl || !backButton) throw new Error('Markup do TournamentBracketScreen incompleto');
    this.contentEl = bracketEl;

    backButton.addEventListener('click', () => {
      Audio.click();
      onBack();
    });

    document.body.appendChild(this.root);
  }

  update(snapshot: TournamentSnapshot, mySlot: number | null): void {
    const byRound = (round: TournamentRound): TournamentMatchInfo[] =>
      snapshot.matches.filter((m) => m.round === round).sort((a, b) => a.index - b.index);

    const qf = byRound('quarterfinal');
    const sf = byRound('semifinal');
    const final = byRound('final')[0];

    const pairsHtml = (matches: TournamentMatchInfo[]): string => {
      const pairs: string[] = [];
      for (let i = 0; i < matches.length; i += 2) {
        const a = matches[i];
        const b = matches[i + 1];
        pairs.push(`
          <div class="bracket__pair">
            ${a ? matchBoxHtml(snapshot, a, mySlot) : ''}
            ${b ? matchBoxHtml(snapshot, b, mySlot) : ''}
          </div>
        `);
      }
      return pairs.join('');
    };

    const championName = snapshot.championSlot !== null ? teamLabel(snapshot, snapshot.championSlot) : null;

    this.contentEl.innerHTML = `
      <div class="bracket__round bracket__round--qf">
        <p class="bracket__round-title">${t('tournament.bracket.quarterfinal')}</p>
        <div class="bracket__round-matches">${pairsHtml(qf)}</div>
      </div>
      <div class="bracket__round bracket__round--sf">
        <p class="bracket__round-title">${t('tournament.bracket.semifinal')}</p>
        <div class="bracket__round-matches">
          <div class="bracket__pair bracket__pair--sf">${sf.map((m) => matchBoxHtml(snapshot, m, mySlot)).join('')}</div>
        </div>
      </div>
      <div class="bracket__round bracket__round--final">
        <p class="bracket__round-title">${t('tournament.bracket.final')}</p>
        <div class="bracket__round-matches">${final ? matchBoxHtml(snapshot, final, mySlot) : ''}</div>
        <div class="bracket__trophy${championName ? ' bracket__trophy--won' : ''}">
          <span class="bracket__trophy-icon">🏆</span>
          ${championName ? `<span class="bracket__trophy-name">${championName}</span>` : ''}
        </div>
      </div>
    `;

    const bannerEl = this.root.querySelector<HTMLParagraphElement>('[data-champion-banner]');
    if (bannerEl) {
      bannerEl.textContent = championName ? t('tournament.bracket.champion', { name: championName }) : t('tournament.bracket.subtitle');
    }
  }

  show(snapshot: TournamentSnapshot, mySlot: number | null): void {
    this.update(snapshot, mySlot);
    this.root.classList.add('menu-screen--visible');
  }

  hide(): void {
    this.root.classList.remove('menu-screen--visible');
  }
}
