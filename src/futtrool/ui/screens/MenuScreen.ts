import { t } from '../../i18n';
import { Audio } from '../../audio/Audio';
import type { ProgressionState } from '../../progression/storage';
import { isFullscreenActive, isFullscreenSupported, toggleFullscreen } from '../../fullscreen';
import { supabase } from '../../../auth/supabaseClient';
import { APELIDO_MAX_LENGTH, APELIDO_MIN_LENGTH, getApelido, setApelido } from '../../../auth/profile';

// Ícones (mesmo estilo simples/traço único do hub, ver src/hub/main.ts) —
// só pra dar apoio visual às seções, não precisa de biblioteca externa
// pra 24x24 hand-drawn.
const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7-11-7z"/></svg>';
const ICON_ONLINE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 8.5a15 15 0 0 1 20 0"/><path d="M5.5 12a10 10 0 0 1 13 0"/><path d="M9 15.5a5 5 0 0 1 6 0"/><circle cx="12" cy="19" r="1.1" fill="currentColor" stroke="none"/></svg>';
const ICON_INVITE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5"/><path d="M18 8v5M15.5 10.5h5"/></svg>';
const ICON_INVENTORY =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l9-4 9 4-9 4-9-4z"/><path d="M3 8v8l9 4 9-4V8"/><path d="M12 12v8"/></svg>';
const ICON_SHOP =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h16l-1.5 10a2 2 0 0 1-2 1.7H7.5a2 2 0 0 1-2-1.7L4 8z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/></svg>';
const ICON_REPLAY =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v4l3 2"/></svg>';
const ICON_TIMER =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M9 2h6"/></svg>';
const ICON_PALETTE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.9 2-2 0-.6-.2-1-.5-1.4-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-7.5-9-7.5z"/><circle cx="7.5" cy="10.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="10.5" cy="7" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="7.5" r="1.1" fill="currentColor" stroke="none"/></svg>';
const ICON_TROPHY =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 5H4a3 3 0 0 0 3 4M17 5h3a3 3 0 0 1-3 4"/><path d="M12 14v3M9 20h6M10 17h4v3h-4z"/></svg>';
const ICON_STAR = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.1 6.6L12 17.5 6.2 20.6l1.1-6.6-4.8-4.6 6.6-.9L12 2.5z"/></svg>';
const ICON_COIN =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path stroke-linecap="round" d="M12 7v10M9.5 9.3c0-1.1 1-2 2.5-2s2.5.7 2.5 1.8-1 1.6-2.5 1.9-2.5.8-2.5 1.9 1 1.8 2.5 1.8 2.5-.9 2.5-2"/></svg>';

// Uma vaga (1v1/2v2/3v3) do multiplayer — mesmas duas ações de sempre
// (entrar na fila pública ou convidar amigo por link), só que agora
// agrupadas visualmente por tamanho de time em vez de 6 pills soltas
// idênticas empilhadas.
function modeCardHtml(teamSize: number, modifier: string): string {
  return `
    <div class="menu-mode-card menu-mode-card--${modifier}">
      <span class="menu-mode-card__badge">${teamSize}v${teamSize}</span>
      <button type="button" class="menu-mode-card__action menu-mode-card__action--primary" data-play-online="${teamSize}">
        <span class="menu-mode-card__icon">${ICON_ONLINE}</span>${t('menu.online')}
      </button>
      <button type="button" class="menu-mode-card__action" data-invite-friend="${teamSize}">
        <span class="menu-mode-card__icon">${ICON_INVITE}</span>${t('menu.inviteFriend')}
      </button>
    </div>
  `;
}

function menuTileHtml(dataAttr: string, icon: string, label: string): string {
  return `
    <button type="button" class="menu-tile" data-${dataAttr}>
      <span class="menu-tile__icon">${icon}</span>
      <span class="menu-tile__label">${label}</span>
    </button>
  `;
}

export class MenuScreen {
  private readonly root: HTMLDivElement;
  private readonly levelEl: HTMLSpanElement;
  private readonly coinsEl: HTMLSpanElement;
  private readonly soundToggle: HTMLButtonElement;
  private readonly fullscreenToggle: HTMLButtonElement;
  private readonly placeholderNote: HTMLParagraphElement;
  private readonly nicknameInput: HTMLInputElement;
  private readonly nicknameSaveButton: HTMLButtonElement;
  private readonly nicknameStatus: HTMLParagraphElement;

  constructor(
    onPlay: () => void,
    onPlayOnline: (teamSize: number) => void,
    onInviteFriend: (teamSize: number) => void,
    onReplays: () => void,
    onMatchSettings: () => void,
    onAvatarColor: () => void,
    onTournament: () => void,
    onNicknameSaved: (name: string) => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'menu-screen';
    this.root.innerHTML = `
      <div class="menu-screen__scroll">
        <header class="menu-screen__header">
          <h1 class="menu-screen__title">${t('menu.title')}</h1>
          <p class="menu-screen__subtitle">${t('menu.subtitle')}</p>
          <div class="menu-stat-row">
            <span class="menu-stat-badge" data-level><span class="menu-stat-badge__icon">${ICON_STAR}</span></span>
            <span class="menu-stat-badge menu-stat-badge--coins" data-coins><span class="menu-stat-badge__icon">${ICON_COIN}</span></span>
          </div>
        </header>
        <main class="menu-screen__main">
          <button type="button" class="menu-cta" data-play>
            <span class="menu-cta__icon">${ICON_PLAY}</span>
            <span class="menu-cta__text">
              <span class="menu-cta__title">${t('menu.play')}</span>
              <span class="menu-cta__subtitle">${t('menu.playSubtitle')}</span>
            </span>
          </button>

          <section class="menu-section">
            <h2 class="menu-section__title">${t('menu.section.multiplayer')}</h2>
            <div class="menu-mode-grid">
              ${modeCardHtml(1, 'blue')}
              ${modeCardHtml(2, 'orange')}
              ${modeCardHtml(3, 'green')}
            </div>
          </section>

          <section class="menu-section">
            <h2 class="menu-section__title">${t('menu.section.more')}</h2>
            <div class="menu-tile-grid">
              ${menuTileHtml('tournament', ICON_TROPHY, t('menu.tournament'))}
              ${menuTileHtml('inventory', ICON_INVENTORY, t('menu.inventory'))}
              ${menuTileHtml('shop', ICON_SHOP, t('menu.shop'))}
              ${menuTileHtml('replays', ICON_REPLAY, t('menu.replays'))}
              ${menuTileHtml('match-settings', ICON_TIMER, t('menu.matchSettings'))}
              ${menuTileHtml('avatar-color', ICON_PALETTE, t('menu.avatarColor'))}
            </div>
          </section>

          <p class="screen__placeholder-note" data-placeholder-note></p>

          <section class="menu-section menu-section--settings">
            <h2 class="menu-section__title">${t('menu.section.settings')}</h2>
            <div class="screen__field">
              <label class="screen__field-label" for="futtrool-nickname">${t('menu.nickname.label')}</label>
              <div class="screen__field-row">
                <input
                  id="futtrool-nickname"
                  type="text"
                  class="screen__input"
                  data-nickname-input
                  maxlength="${APELIDO_MAX_LENGTH}"
                  minlength="${APELIDO_MIN_LENGTH}"
                  placeholder="${t('menu.nickname.placeholder')}"
                />
                <button type="button" class="screen__button screen__button--secondary" data-nickname-save>${t('menu.nickname.save')}</button>
              </div>
              <p class="screen__placeholder-note" data-nickname-status></p>
            </div>
            <div class="screen__button-row">
              <button type="button" class="screen__toggle" data-sound></button>
              <button type="button" class="screen__toggle" data-fullscreen></button>
            </div>
          </section>
        </main>
      </div>
    `;

    const levelEl = this.root.querySelector<HTMLSpanElement>('[data-level]');
    const coinsEl = this.root.querySelector<HTMLSpanElement>('[data-coins]');
    const playButton = this.root.querySelector<HTMLButtonElement>('[data-play]');
    const playOnlineButtons = this.root.querySelectorAll<HTMLButtonElement>('[data-play-online]');
    const inviteFriendButtons = this.root.querySelectorAll<HTMLButtonElement>('[data-invite-friend]');
    const inventoryButton = this.root.querySelector<HTMLButtonElement>('[data-inventory]');
    const shopButton = this.root.querySelector<HTMLButtonElement>('[data-shop]');
    const replaysButton = this.root.querySelector<HTMLButtonElement>('[data-replays]');
    const matchSettingsButton = this.root.querySelector<HTMLButtonElement>('[data-match-settings]');
    const avatarColorButton = this.root.querySelector<HTMLButtonElement>('[data-avatar-color]');
    const tournamentButton = this.root.querySelector<HTMLButtonElement>('[data-tournament]');
    const placeholderNote = this.root.querySelector<HTMLParagraphElement>('[data-placeholder-note]');
    const soundToggle = this.root.querySelector<HTMLButtonElement>('[data-sound]');
    const fullscreenToggle = this.root.querySelector<HTMLButtonElement>('[data-fullscreen]');
    const nicknameInput = this.root.querySelector<HTMLInputElement>('[data-nickname-input]');
    const nicknameSaveButton = this.root.querySelector<HTMLButtonElement>('[data-nickname-save]');
    const nicknameStatus = this.root.querySelector<HTMLParagraphElement>('[data-nickname-status]');
    if (
      !levelEl ||
      !coinsEl ||
      !playButton ||
      playOnlineButtons.length !== 3 ||
      inviteFriendButtons.length !== 3 ||
      !inventoryButton ||
      !shopButton ||
      !replaysButton ||
      !matchSettingsButton ||
      !avatarColorButton ||
      !tournamentButton ||
      !placeholderNote ||
      !soundToggle ||
      !fullscreenToggle ||
      !nicknameInput ||
      !nicknameSaveButton ||
      !nicknameStatus
    ) {
      throw new Error('Markup do MenuScreen incompleto');
    }
    this.levelEl = levelEl;
    this.coinsEl = coinsEl;
    this.soundToggle = soundToggle;
    this.fullscreenToggle = fullscreenToggle;
    this.placeholderNote = placeholderNote;
    this.nicknameInput = nicknameInput;
    this.nicknameSaveButton = nicknameSaveButton;
    this.nicknameStatus = nicknameStatus;

    playOnlineButtons.forEach((button) => {
      const teamSize = Number(button.dataset.playOnline);
      button.addEventListener('click', () => {
        Audio.click();
        onPlayOnline(teamSize);
      });
    });

    inviteFriendButtons.forEach((button) => {
      const teamSize = Number(button.dataset.inviteFriend);
      button.addEventListener('click', () => {
        Audio.click();
        onInviteFriend(teamSize);
      });
    });

    playButton.addEventListener('click', () => {
      Audio.click();
      onPlay();
    });

    replaysButton.addEventListener('click', () => {
      Audio.click();
      onReplays();
    });

    matchSettingsButton.addEventListener('click', () => {
      Audio.click();
      onMatchSettings();
    });

    avatarColorButton.addEventListener('click', () => {
      Audio.click();
      onAvatarColor();
    });

    tournamentButton.addEventListener('click', () => {
      Audio.click();
      onTournament();
    });

    // Inventário/Loja: placeholder da entrega 1 (spec seção 7) — só avisa
    // que ainda não existe, não é uma tela de verdade.
    const showPlaceholder = (): void => {
      Audio.click();
      placeholderNote.textContent = t('menu.comingSoon');
    };
    inventoryButton.addEventListener('click', showPlaceholder);
    shopButton.addEventListener('click', showPlaceholder);

    soundToggle.addEventListener('click', () => {
      Audio.setEnabled(!Audio.isEnabled);
      this.syncSoundToggle();
      Audio.click();
    });
    this.syncSoundToggle();

    // Tela cheia (pedido depois de testar no celular — a barra de endereço
    // do navegador ficava sempre visível). Só funciona de verdade em
    // Android Chrome/desktop (Fullscreen API); no Safari do iPhone não tem
    // API pra isso, então mostra a alternativa que funciona lá (adicionar
    // à tela de início) em vez de um botão que não faz nada em silêncio.
    fullscreenToggle.addEventListener('click', () => {
      Audio.click();
      if (!isFullscreenSupported()) {
        this.placeholderNote.textContent = t('menu.fullscreen.unsupported');
        return;
      }
      void toggleFullscreen();
    });
    document.addEventListener('fullscreenchange', this.syncFullscreenToggle);
    this.syncFullscreenToggle();

    // Apelido (até 12 caracteres) pra aparecer no jogo no lugar de "Você"
    // — vinculado à conta (public.users.apelido), não localStorage, pra
    // seguir o mesmo padrão de "segue a conta em qualquer aparelho" do
    // resto do jogo (login, ranking, replays).
    nicknameSaveButton.addEventListener('click', () => {
      void this.saveNickname(onNicknameSaved);
    });
    void this.refreshNicknameField();

    document.body.appendChild(this.root);
  }

  // Aviso de uma linha no mesmo slot do "Em breve" — usado hoje pra avisar
  // que a partida online caiu (adversário saiu, ou nem deu pra conectar no
  // servidor). `show()` não limpa isso sozinho de propósito (mesma regra
  // que já valia pro "Em breve": some só quando outra coisa escreve por
  // cima ou a pessoa recarrega a tela).
  showNotice(text: string): void {
    this.placeholderNote.textContent = text;
  }

  private setNicknameStatus(text: string, kind: 'error' | 'success' | '' = ''): void {
    this.nicknameStatus.textContent = text;
    this.nicknameStatus.className = `screen__placeholder-note${kind ? ` screen__placeholder-note--${kind}` : ''}`;
  }

  private async refreshNicknameField(): Promise<void> {
    if (!supabase) {
      this.nicknameInput.disabled = true;
      this.nicknameSaveButton.disabled = true;
      this.setNicknameStatus(t('menu.nickname.needsLogin'));
      return;
    }

    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) {
      this.nicknameInput.disabled = true;
      this.nicknameSaveButton.disabled = true;
      this.setNicknameStatus(t('menu.nickname.needsLogin'));
      return;
    }

    this.nicknameInput.disabled = false;
    this.nicknameSaveButton.disabled = false;
    const apelido = await getApelido(userId);
    if (apelido) this.nicknameInput.value = apelido;
  }

  private async saveNickname(onNicknameSaved: (name: string) => void): Promise<void> {
    if (!supabase) return;
    Audio.click();

    const value = this.nicknameInput.value.trim();
    if (value.length < APELIDO_MIN_LENGTH) {
      this.setNicknameStatus(t('menu.nickname.tooShort', { min: APELIDO_MIN_LENGTH }), 'error');
      return;
    }

    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) {
      this.setNicknameStatus(t('menu.nickname.needsLogin'), 'error');
      return;
    }

    this.nicknameSaveButton.disabled = true;
    this.setNicknameStatus(t('menu.nickname.saving'));

    const { error } = await setApelido(userId, value);
    this.nicknameSaveButton.disabled = false;

    if (error) {
      this.setNicknameStatus(t('menu.nickname.saveFailed'), 'error');
      return;
    }

    const saved = value.slice(0, APELIDO_MAX_LENGTH);
    this.nicknameInput.value = saved;
    this.setNicknameStatus(t('menu.nickname.saved'), 'success');
    onNicknameSaved(saved);
  }

  private syncSoundToggle(): void {
    this.soundToggle.textContent = Audio.isEnabled ? t('menu.sound.on') : t('menu.sound.off');
  }

  private readonly syncFullscreenToggle = (): void => {
    this.fullscreenToggle.textContent = isFullscreenActive() ? t('menu.fullscreen.on') : t('menu.fullscreen.off');
  };

  show(progression: ProgressionState): void {
    this.levelEl.innerHTML = `<span class="menu-stat-badge__icon">${ICON_STAR}</span>${t('menu.level', { level: progression.level })}`;
    this.coinsEl.innerHTML = `<span class="menu-stat-badge__icon">${ICON_COIN}</span>${t('menu.coins', { coins: progression.coins })}`;
    this.root.classList.add('menu-screen--visible');
    void this.refreshNicknameField();
  }

  hide(): void {
    this.root.classList.remove('menu-screen--visible');
  }
}
