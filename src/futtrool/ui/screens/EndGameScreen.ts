import { t } from '../../i18n';
import { Audio } from '../../audio/Audio';
import type { LevelProgress, MatchOutcome, MatchReward } from '../../progression/economy';

// Estatísticas da partida (core/types.ts MatchStats) — já resolvidas do
// ponto de vista de quem está vendo a tela (mesma regra do resto de
// EndGameData): `mine` marca o time de quem chamou show(), não sempre
// teamA (online o humano local pode ter caído em qualquer time).
export type EndGamePlayerStat = {
  label: string;
  mine: boolean;
  goals: number;
  touches: number;
};

export type EndGameData = {
  outcome: MatchOutcome;
  // Sempre do ponto de vista de QUEM ESTÁ VENDO a tela — em modo online o
  // humano local pode ter sido o time A ou o B (ver localPlayerId em
  // main.ts), então nunca é seguro assumir "meu time = teamA".
  score: { myTeam: number; opponentTeam: number };
  opponentLabel: string;
  reward: MatchReward;
  // Moedas garantidas mesmo saindo — menor que `reward.coins` (o total),
  // que só é creditado por completo se a pessoa escolher "Mais uma!" em
  // vez de "Sair" (ver economy.ts: splitExitReward).
  exitCoins: number;
  // Apelido escolhido pelo jogador (até 12 caracteres) — substitui o
  // "Você" fixo de antes.
  youLabel: string;
  levelAfter: LevelProgress;
  players: EndGamePlayerStat[];
  // % (0..100) do tempo de jogo com a bola no campo de ATAQUE de cada
  // time — soma ~100 entre os dois (ver core/types.ts ballInRightHalfMs).
  attackPct: { myTeam: number; opponentTeam: number };
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
  private readonly rowP1Label: HTMLSpanElement;
  private readonly rowP1Stats: HTMLSpanElement;
  private readonly rowP2Stats: HTMLSpanElement;
  private readonly rowP2Label: HTMLSpanElement;
  private readonly territoryMyEl: HTMLSpanElement;
  private readonly territoryOppEl: HTMLSpanElement;
  private readonly territoryFillEl: HTMLDivElement;
  private readonly statsPlayersEl: HTMLDivElement;
  private readonly gainLabelEl: HTMLSpanElement;
  private readonly gainValueEl: HTMLSpanElement;
  private readonly gainFillEl: HTMLDivElement;
  private readonly levelLabelEl: HTMLSpanElement;
  private readonly levelValueEl: HTMLSpanElement;
  private readonly levelFillEl: HTMLDivElement;
  private readonly exitButton: HTMLButtonElement;
  private readonly rematchButton: HTMLButtonElement;

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
            <span data-row-p1-label></span>
            <span class="endgame-row__stats" data-row-p1-stats></span>
          </div>
          <div class="endgame-row endgame-row--p2">
            <span data-row-p2-label></span>
            <span class="endgame-row__stats" data-row-p2-stats></span>
          </div>
        </div>
        <div class="endgame-stats">
          <p class="screen__field-label">${t('endgame.stats.title')}</p>
          <div class="endgame-stats__territory">
            <span data-territory-my></span>
            <div class="endgame-stats__territory-bar"><div class="endgame-stats__territory-fill" data-territory-fill></div></div>
            <span data-territory-opp></span>
          </div>
          <div class="endgame-stats__players" data-stats-players></div>
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
        <div class="screen__button-row">
          <button type="button" class="screen__button screen__button--secondary" data-exit></button>
          <button type="button" class="screen__button screen__button--outline" data-rematch></button>
        </div>
      </div>
    `;

    const scoreP1 = this.root.querySelector<HTMLSpanElement>('[data-score-p1]');
    const scoreP2 = this.root.querySelector<HTMLSpanElement>('[data-score-p2]');
    const resultEl = this.root.querySelector<HTMLParagraphElement>('[data-result]');
    const streakEl = this.root.querySelector<HTMLParagraphElement>('[data-streak]');
    const rowP1Label = this.root.querySelector<HTMLSpanElement>('[data-row-p1-label]');
    const rowP1Stats = this.root.querySelector<HTMLSpanElement>('[data-row-p1-stats]');
    const rowP2Stats = this.root.querySelector<HTMLSpanElement>('[data-row-p2-stats]');
    const rowP2Label = this.root.querySelector<HTMLSpanElement>('[data-row-p2-label]');
    const territoryMyEl = this.root.querySelector<HTMLSpanElement>('[data-territory-my]');
    const territoryOppEl = this.root.querySelector<HTMLSpanElement>('[data-territory-opp]');
    const territoryFillEl = this.root.querySelector<HTMLDivElement>('[data-territory-fill]');
    const statsPlayersEl = this.root.querySelector<HTMLDivElement>('[data-stats-players]');
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
      !rowP1Label ||
      !rowP1Stats ||
      !rowP2Stats ||
      !rowP2Label ||
      !territoryMyEl ||
      !territoryOppEl ||
      !territoryFillEl ||
      !statsPlayersEl ||
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
    this.rowP1Label = rowP1Label;
    this.rowP1Stats = rowP1Stats;
    this.rowP2Stats = rowP2Stats;
    this.rowP2Label = rowP2Label;
    this.territoryMyEl = territoryMyEl;
    this.territoryOppEl = territoryOppEl;
    this.territoryFillEl = territoryFillEl;
    this.statsPlayersEl = statsPlayersEl;
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
    this.scoreP1El.textContent = String(data.score.myTeam);
    this.scoreP2El.textContent = String(data.score.opponentTeam);

    this.resultEl.textContent = t(RESULT_KEY[data.outcome]);
    this.resultEl.className = `endgame-result ${RESULT_CLASS[data.outcome]}`;

    // Só mostra a partir de 2 vitórias seguidas — "sequência de 1" não lê
    // bem como sequência, mesmo já valendo bônus de moeda desde a 1ª (ver economy.ts).
    this.streakEl.textContent = data.reward.newStreak > 1 ? t('endgame.streak', { streak: data.reward.newStreak }) : '';

    this.rowP1Label.textContent = data.youLabel;
    this.rowP1Stats.textContent = `${t('endgame.goals')}: ${data.score.myTeam}`;
    this.rowP2Label.textContent = data.opponentLabel;
    this.rowP2Stats.textContent = `${t('endgame.goals')}: ${data.score.opponentTeam}`;

    const myPct = Math.round(data.attackPct.myTeam);
    this.territoryMyEl.textContent = `${data.youLabel} ${myPct}%`;
    this.territoryOppEl.textContent = `${Math.round(data.attackPct.opponentTeam)}% ${data.opponentLabel}`;
    this.territoryFillEl.style.width = `${myPct}%`;

    this.statsPlayersEl.innerHTML = '';
    for (const player of data.players) {
      const row = document.createElement('div');
      row.className = `endgame-stats__player-row${player.mine ? ' endgame-stats__player-row--me' : ''}`;
      const label = document.createElement('span');
      label.textContent = player.label;
      const detail = document.createElement('span');
      detail.className = 'endgame-stats__player-detail';
      detail.textContent = t('endgame.stats.playerLine', { goals: player.goals, touches: player.touches });
      row.append(label, detail);
      this.statsPlayersEl.append(row);
    }

    // Nível máximo (MAX_LEVEL, ver progression/economy.ts): xpToNextLevel
    // vira 0 nesse ponto — não dá pra mostrar "X / 0 XP" nem dividir por
    // zero pra calcular a barra, então troca pelo rótulo fixo de "no topo".
    const isMaxLevel = data.levelAfter.xpToNextLevel === 0;

    this.gainLabelEl.textContent = t('endgame.level', { level: data.levelAfter.level });
    this.gainValueEl.textContent = t('endgame.xpGained', { xp: data.reward.xp });
    this.levelLabelEl.textContent = t('endgame.level', { level: data.levelAfter.level });
    this.levelValueEl.textContent = isMaxLevel
      ? t('endgame.levelMax')
      : `${data.levelAfter.levelXp} / ${data.levelAfter.xpToNextLevel} XP`;

    this.exitButton.textContent = t('endgame.exit.reward', { coins: data.exitCoins });
    this.rematchButton.textContent = t('endgame.rematch.reward', { coins: data.reward.coins });

    // Zera antes de mostrar pra garantir que a transição de largura anima
    // (senão, se já estivesse em 100% de uma vez anterior, não haveria
    // mudança de valor pra disparar a animação CSS).
    this.gainFillEl.style.width = '0%';
    this.levelFillEl.style.width = '0%';
    this.root.classList.add('screen--visible');

    requestAnimationFrame(() => {
      this.gainFillEl.style.width = '100%';
      const pct = isMaxLevel ? 100 : Math.min(100, (data.levelAfter.levelXp / data.levelAfter.xpToNextLevel) * 100);
      this.levelFillEl.style.width = `${pct}%`;
    });
  }

  hide(): void {
    this.root.classList.remove('screen--visible');
  }
}
