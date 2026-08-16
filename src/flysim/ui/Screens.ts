import { GameState, type Game } from '../core/Game';
import { Storage } from '../core/Storage';
import { Audio } from '../core/Audio';
import { GAME_NAME } from '../config';
import { ICON_CHECKPOINT, ICON_TROPHY } from './icons';

const GAME_OVER_MESSAGE: Record<'fuel' | 'crash', string> = {
  fuel: 'Sem combustível!',
  crash: 'Você bateu!',
};

/** Tela inicial: título, recorde, instruções rápidas e botão de jogar. */
export class MenuScreen {
  private readonly root: HTMLDivElement;
  private readonly highscoreEl: HTMLSpanElement;
  private readonly soundToggle: HTMLButtonElement;
  private readonly game: Game;
  private lastState: GameState | null = null;

  constructor(game: Game, onPlay: () => void) {
    this.game = game;

    this.root = document.createElement('div');
    this.root.className = 'screen';
    this.root.innerHTML = `
      <div class="screen__panel">
        <h1>${GAME_NAME}</h1>
        <p class="screen__stat screen__stat--icon"><span class="hud__icon">${ICON_TROPHY}</span><span data-highscore></span></p>
        <p class="screen__hint">
          Manche: <strong>W/S</strong> ou arraste o toque · Rolagem: <strong>A/D</strong> ·
          Leme: <strong>Q/E</strong> · Manete: <strong>Shift/Ctrl</strong> ou os botões +/−
        </p>
        <p class="screen__hint">Voe pelo anel <strong>laranja</strong> (o mais próximo) e pouse na pista antes que o combustível acabe.</p>
        <button type="button" class="screen__button" data-play>Decolar</button>
        <button type="button" class="screen__toggle" data-sound></button>
      </div>
    `;

    const highscoreEl = this.root.querySelector<HTMLSpanElement>('[data-highscore]');
    const playButton = this.root.querySelector<HTMLButtonElement>('[data-play]');
    const soundToggle = this.root.querySelector<HTMLButtonElement>('[data-sound]');
    if (!highscoreEl || !playButton || !soundToggle) {
      throw new Error('Markup do MenuScreen incompleto');
    }
    this.highscoreEl = highscoreEl;
    this.soundToggle = soundToggle;

    playButton.addEventListener('click', () => {
      Audio.click();
      onPlay();
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

  sync(): void {
    if (this.game.state === this.lastState) return;
    this.lastState = this.game.state;

    const visible = this.game.state === GameState.MENU;
    this.root.classList.toggle('screen--visible', visible);
    if (!visible) return;

    this.highscoreEl.textContent = ` Recorde: ${Storage.getHighscore()}`;
  }
}

/** Tela de fim de jogo: motivo (sem combustível / colisão), estatísticas e reinício. */
export class GameOverScreen {
  private readonly root: HTMLDivElement;
  private readonly reasonEl: HTMLParagraphElement;
  private readonly scoreEl: HTMLParagraphElement;
  private readonly distanceEl: HTMLParagraphElement;
  private readonly checkpointsEl: HTMLSpanElement;
  private readonly recordEl: HTMLParagraphElement;
  private readonly game: Game;
  private lastState: GameState | null = null;

  constructor(game: Game, onRestart: () => void) {
    this.game = game;

    this.root = document.createElement('div');
    this.root.className = 'screen';
    this.root.innerHTML = `
      <div class="screen__panel">
        <h1 data-reason></h1>
        <p class="screen__record" data-record></p>
        <p class="screen__stat" data-score></p>
        <p class="screen__stat" data-distance></p>
        <p class="screen__stat screen__stat--icon"><span class="hud__icon">${ICON_CHECKPOINT}</span><span data-checkpoints></span></p>
        <button type="button" class="screen__button" data-restart>Jogar novamente</button>
      </div>
    `;

    const reasonEl = this.root.querySelector<HTMLParagraphElement>('[data-reason]');
    const recordEl = this.root.querySelector<HTMLParagraphElement>('[data-record]');
    const scoreEl = this.root.querySelector<HTMLParagraphElement>('[data-score]');
    const distanceEl = this.root.querySelector<HTMLParagraphElement>('[data-distance]');
    const checkpointsEl = this.root.querySelector<HTMLSpanElement>('[data-checkpoints]');
    const restartButton = this.root.querySelector<HTMLButtonElement>('[data-restart]');
    if (!reasonEl || !recordEl || !scoreEl || !distanceEl || !checkpointsEl || !restartButton) {
      throw new Error('Markup do GameOverScreen incompleto');
    }
    this.reasonEl = reasonEl;
    this.recordEl = recordEl;
    this.scoreEl = scoreEl;
    this.distanceEl = distanceEl;
    this.checkpointsEl = checkpointsEl;

    restartButton.addEventListener('click', () => {
      Audio.click();
      onRestart();
    });

    document.body.appendChild(this.root);
  }

  sync(): void {
    if (this.game.state === this.lastState) return;
    this.lastState = this.game.state;

    const visible = this.game.state === GameState.GAME_OVER;
    this.root.classList.toggle('screen--visible', visible);
    if (!visible) return;

    const reason = this.game.gameOverReasonValue;
    this.reasonEl.textContent = reason ? GAME_OVER_MESSAGE[reason] : 'Fim de voo';
    this.scoreEl.textContent = `Score: ${this.game.score}`;
    this.distanceEl.textContent = `Distância: ${Math.round(this.game.distanceFlownValue)} m`;
    this.checkpointsEl.textContent = ` ${this.game.checkpointsPassedValue} checkpoints · ${this.game.landingsValue} pousos`;
    this.recordEl.textContent = this.game.isNewHighscore ? 'Novo recorde!' : '';
    this.recordEl.classList.toggle('screen__record--visible', this.game.isNewHighscore);
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
