import { t } from '../../i18n';
import { Audio } from '../../audio/Audio';
import type { ProgressionState } from '../../progression/storage';
import { isFullscreenActive, isFullscreenSupported, toggleFullscreen } from '../../fullscreen';
import { supabase } from '../../../auth/supabaseClient';
import { APELIDO_MAX_LENGTH, getApelido, setApelido } from '../../../auth/profile';

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

  constructor(onPlay: () => void, onReplays: () => void, onNicknameSaved: (name: string) => void) {
    this.root = document.createElement('div');
    this.root.className = 'screen';
    this.root.innerHTML = `
      <div class="screen__panel">
        <h1 class="screen__title">${t('menu.title')}</h1>
        <p class="screen__subtitle">${t('menu.subtitle')}</p>
        <div class="screen__stat-row">
          <span class="screen__stat-pill" data-level></span>
          <span class="screen__stat-pill screen__stat-pill--coins" data-coins></span>
        </div>
        <button type="button" class="screen__button" data-play>${t('menu.play')}</button>
        <div class="screen__button-row">
          <button type="button" class="screen__button screen__button--secondary" data-inventory>${t('menu.inventory')}</button>
          <button type="button" class="screen__button screen__button--secondary" data-shop>${t('menu.shop')}</button>
        </div>
        <button type="button" class="screen__button screen__button--secondary" data-replays>${t('menu.replays')}</button>
        <p class="screen__placeholder-note" data-placeholder-note></p>
        <div class="screen__field">
          <label class="screen__field-label" for="futtrool-nickname">${t('menu.nickname.label')}</label>
          <div class="screen__field-row">
            <input
              id="futtrool-nickname"
              type="text"
              class="screen__input"
              data-nickname-input
              maxlength="${APELIDO_MAX_LENGTH}"
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
      </div>
    `;

    const levelEl = this.root.querySelector<HTMLSpanElement>('[data-level]');
    const coinsEl = this.root.querySelector<HTMLSpanElement>('[data-coins]');
    const playButton = this.root.querySelector<HTMLButtonElement>('[data-play]');
    const inventoryButton = this.root.querySelector<HTMLButtonElement>('[data-inventory]');
    const shopButton = this.root.querySelector<HTMLButtonElement>('[data-shop]');
    const replaysButton = this.root.querySelector<HTMLButtonElement>('[data-replays]');
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
      !inventoryButton ||
      !shopButton ||
      !replaysButton ||
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

    playButton.addEventListener('click', () => {
      Audio.click();
      onPlay();
    });

    replaysButton.addEventListener('click', () => {
      Audio.click();
      onReplays();
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
    if (!value) {
      this.setNicknameStatus(t('menu.nickname.empty'), 'error');
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
    this.levelEl.textContent = t('menu.level', { level: progression.level });
    this.coinsEl.textContent = t('menu.coins', { coins: progression.coins });
    this.root.classList.add('screen--visible');
    void this.refreshNicknameField();
  }

  hide(): void {
    this.root.classList.remove('screen--visible');
  }
}
