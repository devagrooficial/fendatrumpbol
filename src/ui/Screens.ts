import { GameState, type Game } from '../core/Game';
import { Storage } from '../core/Storage';
import { Audio } from '../core/Audio';
import { Ranking, type RankingEntry } from '../core/Ranking';
import { GAME_NAME } from '../config';
import { CHARACTER_ORDER, CHARACTER_PRESETS, type CharacterId } from '../entities/characters';
import { ICON_COIN, ICON_GEM, ICON_TROPHY } from './icons';

function toCssHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Escapa texto pra injeção segura em innerHTML — nomes vêm de outros jogadores. */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/** Sincroniza a visibilidade do overlay de game over com `game.state`. */
export class GameOverScreen {
  private readonly root: HTMLDivElement;
  private readonly scoreEl: HTMLParagraphElement;
  private readonly coinsEl: HTMLSpanElement;
  private readonly gemsEl: HTMLSpanElement;
  private readonly recordEl: HTMLParagraphElement;
  private readonly rankingBlock: HTMLDivElement;
  private readonly nameInput: HTMLInputElement;
  private readonly submitButton: HTMLButtonElement;
  private readonly submitStatus: HTMLParagraphElement;
  private readonly game: Game;
  private lastState: GameState | null = null;
  private submitted = false;

  constructor(game: Game, onRestart: () => void) {
    this.game = game;

    this.root = document.createElement('div');
    this.root.className = 'screen';
    this.root.innerHTML = `
      <div class="screen__panel">
        <h1>Fim de jogo</h1>
        <p class="screen__record" data-record></p>
        <p class="screen__stat" data-score></p>
        <p class="screen__stat screen__stat--icon"><span class="hud__icon">${ICON_COIN}</span><span data-coins></span></p>
        <p class="screen__stat screen__stat--icon"><span class="hud__icon">${ICON_GEM}</span><span data-gems></span></p>
        <div class="ranking-submit" data-ranking-block>
          <input type="text" class="screen__input" data-name-input placeholder="Seu nome" maxlength="20" />
          <button type="button" class="screen__button screen__button--secondary" data-submit-score>Enviar pro ranking</button>
          <p class="ranking-submit__status" data-submit-status></p>
        </div>
        <button type="button" class="screen__button" data-restart>Jogar novamente</button>
      </div>
    `;

    const scoreEl = this.root.querySelector<HTMLParagraphElement>('[data-score]');
    const coinsEl = this.root.querySelector<HTMLSpanElement>('[data-coins]');
    const gemsEl = this.root.querySelector<HTMLSpanElement>('[data-gems]');
    const recordEl = this.root.querySelector<HTMLParagraphElement>('[data-record]');
    const restartButton = this.root.querySelector<HTMLButtonElement>('[data-restart]');
    const rankingBlock = this.root.querySelector<HTMLDivElement>('[data-ranking-block]');
    const nameInput = this.root.querySelector<HTMLInputElement>('[data-name-input]');
    const submitButton = this.root.querySelector<HTMLButtonElement>('[data-submit-score]');
    const submitStatus = this.root.querySelector<HTMLParagraphElement>('[data-submit-status]');
    if (
      !scoreEl || !coinsEl || !gemsEl || !recordEl || !restartButton ||
      !rankingBlock || !nameInput || !submitButton || !submitStatus
    ) {
      throw new Error('Markup do GameOverScreen incompleto');
    }
    this.scoreEl = scoreEl;
    this.coinsEl = coinsEl;
    this.gemsEl = gemsEl;
    this.recordEl = recordEl;
    this.rankingBlock = rankingBlock;
    this.nameInput = nameInput;
    this.submitButton = submitButton;
    this.submitStatus = submitStatus;

    restartButton.addEventListener('click', () => {
      Audio.click();
      onRestart();
    });
    submitButton.addEventListener('click', () => {
      void this.submitScore();
    });

    document.body.appendChild(this.root);
  }

  private async submitScore(): Promise<void> {
    const name = this.nameInput.value.trim();
    if (!name || this.submitted) return;

    Audio.click();
    this.submitButton.disabled = true;
    this.nameInput.disabled = true;
    this.submitStatus.textContent = 'Enviando...';

    const ok = await Ranking.submitScore({
      name,
      score: this.game.score,
      distance: this.game.distanceTravelled,
      coins: this.game.coinsCollected,
      gems: this.game.gemsCollected,
      characterId: this.game.player.characterId,
    });

    if (ok) {
      this.submitted = true;
      Storage.setPlayerName(name);
      this.submitStatus.textContent = 'Enviado! Você está no ranking.';
    } else {
      this.submitButton.disabled = false;
      this.nameInput.disabled = false;
      this.submitStatus.textContent = 'Falha ao enviar — tenta de novo.';
    }
  }

  sync(): void {
    if (this.game.state === this.lastState) return;
    this.lastState = this.game.state;

    const visible = this.game.state === GameState.GAME_OVER;
    this.root.classList.toggle('screen--visible', visible);
    if (!visible) return;

    this.scoreEl.textContent = `Score: ${this.game.score}`;
    this.coinsEl.textContent = ` Moedas: ${this.game.coinsCollected}`;
    this.gemsEl.textContent = ` Gemas: ${this.game.gemsCollected}`;
    this.recordEl.textContent = this.game.isNewHighscore ? 'Novo recorde!' : '';
    this.recordEl.classList.toggle('screen__record--visible', this.game.isNewHighscore);

    this.rankingBlock.classList.toggle('ranking-submit--hidden', !Ranking.isConfigured());
    this.submitted = false;
    this.submitButton.disabled = false;
    this.nameInput.disabled = false;
    this.nameInput.value = Storage.getPlayerName();
    this.submitStatus.textContent = '';
  }
}

/** Tela inicial: título, seleção de personagem, jogar, ranking, highscore, moedas totais e toggle de som. */
export class MenuScreen {
  private readonly root: HTMLDivElement;
  private readonly highscoreEl: HTMLSpanElement;
  private readonly totalCoinsEl: HTMLSpanElement;
  private readonly totalGemsEl: HTMLSpanElement;
  private readonly soundToggle: HTMLButtonElement;
  private readonly rankingButton: HTMLButtonElement;
  private readonly characterCards: HTMLButtonElement[];
  private readonly game: Game;
  private lastState: GameState | null = null;

  constructor(game: Game, onPlay: () => void, onOpenRanking: () => void) {
    this.game = game;

    const cardsMarkup = CHARACTER_ORDER.map((id) => {
      const preset = CHARACTER_PRESETS[id];
      const gradient = `linear-gradient(160deg, ${toCssHex(preset.hairColor)} 0 45%, ${toCssHex(preset.skinColor)} 45% 100%)`;
      return `
        <button type="button" class="character-card" data-character="${id}">
          <span class="character-card__swatch" style="background:${gradient}"></span>
          <span class="character-card__label">${preset.label}</span>
        </button>
      `;
    }).join('');

    this.root = document.createElement('div');
    this.root.className = 'screen';
    this.root.innerHTML = `
      <div class="screen__panel">
        <h1>${GAME_NAME}</h1>
        <p class="screen__stat screen__stat--icon"><span class="hud__icon">${ICON_TROPHY}</span><span data-highscore></span></p>
        <p class="screen__stat screen__stat--icon"><span class="hud__icon">${ICON_COIN}</span><span data-total-coins></span></p>
        <p class="screen__stat screen__stat--icon"><span class="hud__icon">${ICON_GEM}</span><span data-total-gems></span></p>
        <div class="character-select" data-character-select>${cardsMarkup}</div>
        <button type="button" class="screen__button" data-play>Jogar</button>
        <button type="button" class="screen__button screen__button--secondary" data-ranking>Ranking</button>
        <button type="button" class="screen__toggle" data-sound></button>
      </div>
    `;

    const highscoreEl = this.root.querySelector<HTMLSpanElement>('[data-highscore]');
    const totalCoinsEl = this.root.querySelector<HTMLSpanElement>('[data-total-coins]');
    const totalGemsEl = this.root.querySelector<HTMLSpanElement>('[data-total-gems]');
    const playButton = this.root.querySelector<HTMLButtonElement>('[data-play]');
    const rankingButton = this.root.querySelector<HTMLButtonElement>('[data-ranking]');
    const soundToggle = this.root.querySelector<HTMLButtonElement>('[data-sound]');
    if (!highscoreEl || !totalCoinsEl || !totalGemsEl || !playButton || !rankingButton || !soundToggle) {
      throw new Error('Markup do MenuScreen incompleto');
    }
    this.highscoreEl = highscoreEl;
    this.totalCoinsEl = totalCoinsEl;
    this.totalGemsEl = totalGemsEl;
    this.soundToggle = soundToggle;
    this.rankingButton = rankingButton;
    this.characterCards = Array.from(this.root.querySelectorAll<HTMLButtonElement>('[data-character]'));

    for (const card of this.characterCards) {
      card.addEventListener('click', () => {
        const id = card.dataset.character as CharacterId;
        this.game.setCharacter(id);
        this.syncCharacterCards();
        Audio.click();
      });
    }
    this.syncCharacterCards();

    playButton.addEventListener('click', () => {
      Audio.click();
      onPlay();
    });
    this.rankingButton.addEventListener('click', () => {
      Audio.click();
      onOpenRanking();
    });
    soundToggle.addEventListener('click', () => {
      Audio.setEnabled(!Audio.isEnabled);
      this.syncSoundToggle();
      Audio.click();
    });
    this.syncSoundToggle();

    document.body.appendChild(this.root);
  }

  private syncSoundToggle(): void {
    this.soundToggle.textContent = Audio.isEnabled ? 'Som: ligado' : 'Som: desligado';
  }

  private syncCharacterCards(): void {
    const selected = this.game.player.characterId;
    for (const card of this.characterCards) {
      card.classList.toggle('character-card--selected', card.dataset.character === selected);
    }
  }

  sync(): void {
    if (this.game.state === this.lastState) return;
    this.lastState = this.game.state;

    const visible = this.game.state === GameState.MENU;
    this.root.classList.toggle('screen--visible', visible);
    if (!visible) return;

    this.highscoreEl.textContent = ` Recorde: ${Storage.getHighscore()}`;
    this.totalCoinsEl.textContent = ` Moedas totais: ${Storage.getTotalCoins()}`;
    this.totalGemsEl.textContent = ` Gemas totais: ${Storage.getTotalGems()}`;
  }
}

/** Tela de pausa: retomar, reiniciar, voltar ao menu. */
export class PauseScreen {
  private readonly root: HTMLDivElement;
  private readonly game: Game;
  private lastState: GameState | null = null;

  constructor(game: Game, onResume: () => void, onRestart: () => void, onExitToMenu: () => void) {
    this.game = game;

    this.root = document.createElement('div');
    this.root.className = 'screen';
    this.root.innerHTML = `
      <div class="screen__panel">
        <h1>Pausado</h1>
        <button type="button" class="screen__button" data-resume>Retomar</button>
        <button type="button" class="screen__button screen__button--secondary" data-restart>Reiniciar</button>
        <button type="button" class="screen__button screen__button--secondary" data-menu>Voltar ao menu</button>
      </div>
    `;

    const resumeButton = this.root.querySelector<HTMLButtonElement>('[data-resume]');
    const restartButton = this.root.querySelector<HTMLButtonElement>('[data-restart]');
    const menuButton = this.root.querySelector<HTMLButtonElement>('[data-menu]');
    if (!resumeButton || !restartButton || !menuButton) {
      throw new Error('Markup do PauseScreen incompleto');
    }

    resumeButton.addEventListener('click', () => {
      Audio.click();
      onResume();
    });
    restartButton.addEventListener('click', () => {
      Audio.click();
      onRestart();
    });
    menuButton.addEventListener('click', () => {
      Audio.click();
      onExitToMenu();
    });

    document.body.appendChild(this.root);
  }

  sync(): void {
    if (this.game.state === this.lastState) return;
    this.lastState = this.game.state;
    this.root.classList.toggle('screen--visible', this.game.state === GameState.PAUSED);
  }
}

/** Modal com o top do ranking online — independente da máquina de estados do jogo. */
export class RankingScreen {
  private readonly root: HTMLDivElement;
  private readonly listEl: HTMLDivElement;
  private readonly statusEl: HTMLParagraphElement;

  constructor(onClose: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'screen screen--modal';
    this.root.innerHTML = `
      <div class="screen__panel">
        <h1>Ranking</h1>
        <p class="ranking-status" data-ranking-status></p>
        <div class="ranking-list" data-ranking-list></div>
        <button type="button" class="screen__button screen__button--secondary" data-close>Fechar</button>
      </div>
    `;

    const listEl = this.root.querySelector<HTMLDivElement>('[data-ranking-list]');
    const statusEl = this.root.querySelector<HTMLParagraphElement>('[data-ranking-status]');
    const closeButton = this.root.querySelector<HTMLButtonElement>('[data-close]');
    if (!listEl || !statusEl || !closeButton) {
      throw new Error('Markup do RankingScreen incompleto');
    }
    this.listEl = listEl;
    this.statusEl = statusEl;

    closeButton.addEventListener('click', () => {
      Audio.click();
      this.close();
      onClose();
    });

    document.body.appendChild(this.root);
  }

  async open(): Promise<void> {
    this.root.classList.add('screen--visible');
    this.listEl.innerHTML = '';

    if (!Ranking.isConfigured()) {
      this.statusEl.textContent = 'Ranking online não configurado.';
      return;
    }

    this.statusEl.textContent = 'Carregando...';
    const entries = await Ranking.fetchTop();

    if (entries.length === 0) {
      this.statusEl.textContent = 'Ninguém no ranking ainda — seja o primeiro!';
      return;
    }

    this.statusEl.textContent = '';
    this.listEl.innerHTML = entries.map((entry: RankingEntry, index: number) => `
      <div class="ranking-row">
        <span class="ranking-row__pos">${index + 1}</span>
        <span class="ranking-row__name">${escapeHtml(entry.name)}</span>
        <span class="ranking-row__gems">${entry.gems > 0 ? `${ICON_GEM} ${entry.gems}` : ''}</span>
        <span class="ranking-row__score">${entry.score}</span>
      </div>
    `).join('');
  }

  close(): void {
    this.root.classList.remove('screen--visible');
  }
}
