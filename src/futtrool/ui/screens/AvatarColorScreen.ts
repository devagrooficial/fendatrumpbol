import { t } from '../../i18n';
import { Audio } from '../../audio/Audio';
import { AVATAR_COLOR_PALETTE } from '../../core/constants';
import type { AvatarColor, AvatarColorMode } from '../../core/types';

function swatchesHtml(group: string): string {
  return AVATAR_COLOR_PALETTE.map(
    (hex) => `<button type="button" class="avatar-swatch" data-${group}="${hex}" style="background:${hex}" aria-label="${hex}"></button>`,
  ).join('');
}

export class AvatarColorScreen {
  private readonly root: HTMLDivElement;
  private readonly preview: HTMLDivElement;
  private readonly modeButtons: HTMLButtonElement[];
  private readonly color1Buttons: HTMLButtonElement[];
  private readonly color2Buttons: HTMLButtonElement[];
  private readonly color2Field: HTMLDivElement;

  constructor(onChange: (color: AvatarColor) => AvatarColor, onBack: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'screen';

    const modeButtonsHtml = (['solid', 'duo', 'gradient'] as AvatarColorMode[])
      .map((mode) => `<button type="button" class="pill-options__button" data-mode="${mode}">${t(`avatarColor.mode.${mode}`)}</button>`)
      .join('');

    this.root.innerHTML = `
      <div class="screen__panel">
        <h1 class="screen__title">${t('avatarColor.title')}</h1>
        <p class="screen__subtitle">${t('avatarColor.subtitle')}</p>
        <div class="avatar-preview-wrap"><div class="avatar-preview" data-preview></div></div>
        <div class="screen__field">
          <p class="screen__field-label">${t('avatarColor.mode.label')}</p>
          <div class="pill-options" data-mode-options>${modeButtonsHtml}</div>
        </div>
        <div class="screen__field">
          <p class="screen__field-label">${t('avatarColor.color1.label')}</p>
          <div class="avatar-swatches" data-color1-options>${swatchesHtml('color1')}</div>
        </div>
        <div class="screen__field" data-color2-field>
          <p class="screen__field-label">${t('avatarColor.color2.label')}</p>
          <div class="avatar-swatches" data-color2-options>${swatchesHtml('color2')}</div>
        </div>
        <button type="button" class="screen__button screen__button--secondary" data-back>${t('avatarColor.back')}</button>
      </div>
    `;

    this.preview = this.root.querySelector<HTMLDivElement>('[data-preview]')!;
    this.color2Field = this.root.querySelector<HTMLDivElement>('[data-color2-field]')!;
    this.modeButtons = Array.from(this.root.querySelectorAll<HTMLButtonElement>('[data-mode]'));
    this.color1Buttons = Array.from(this.root.querySelectorAll<HTMLButtonElement>('[data-color1]'));
    this.color2Buttons = Array.from(this.root.querySelectorAll<HTMLButtonElement>('[data-color2]'));
    const backButton = this.root.querySelector<HTMLButtonElement>('[data-back]');
    if (!backButton || !this.preview || this.modeButtons.length === 0 || this.color1Buttons.length === 0) {
      throw new Error('Markup do AvatarColorScreen incompleto');
    }

    this.modeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        Audio.click();
        const mode = button.dataset.mode as AvatarColorMode;
        this.syncSelection(onChange(this.buildColor(mode)));
      });
    });

    this.color1Buttons.forEach((button) => {
      button.addEventListener('click', () => {
        Audio.click();
        this.selectSwatch(this.color1Buttons, button);
        this.syncSelection(onChange(this.buildColor(this.currentMode())));
      });
    });

    this.color2Buttons.forEach((button) => {
      button.addEventListener('click', () => {
        Audio.click();
        this.selectSwatch(this.color2Buttons, button);
        this.syncSelection(onChange(this.buildColor(this.currentMode())));
      });
    });

    backButton.addEventListener('click', () => {
      Audio.click();
      onBack();
    });

    document.body.appendChild(this.root);
  }

  private selectSwatch(group: HTMLButtonElement[], picked: HTMLButtonElement): void {
    for (const button of group) button.classList.toggle('avatar-swatch--selected', button === picked);
  }

  private currentMode(): AvatarColorMode {
    const selected = this.modeButtons.find((b) => b.classList.contains('pill-options__button--selected'));
    return (selected?.dataset.mode as AvatarColorMode) ?? 'solid';
  }

  private currentColor(group: HTMLButtonElement[], attr: string): string {
    const selected = group.find((b) => b.classList.contains('avatar-swatch--selected'));
    return selected?.dataset[attr] ?? group[0]!.dataset[attr]!;
  }

  private buildColor(mode: AvatarColorMode): AvatarColor {
    const color1 = this.currentColor(this.color1Buttons, 'color1');
    if (mode === 'solid') return { mode, colors: [color1] };
    const color2 = this.currentColor(this.color2Buttons, 'color2');
    return { mode, colors: [color1, color2] };
  }

  private syncSelection(color: AvatarColor): void {
    for (const button of this.modeButtons) {
      button.classList.toggle('pill-options__button--selected', button.dataset.mode === color.mode);
    }
    for (const button of this.color1Buttons) {
      button.classList.toggle('avatar-swatch--selected', button.dataset.color1 === color.colors[0]);
    }
    for (const button of this.color2Buttons) {
      button.classList.toggle('avatar-swatch--selected', button.dataset.color2 === (color.colors[1] ?? color.colors[0]));
    }
    this.color2Field.classList.toggle('avatar-color2-field--hidden', color.mode === 'solid');
    this.updatePreview(color);
  }

  private updatePreview(color: AvatarColor): void {
    const [c1, c2] = color.colors;
    if (color.mode === 'gradient' && c2) this.preview.style.background = `linear-gradient(90deg, ${c1}, ${c2})`;
    else if (color.mode === 'duo' && c2) this.preview.style.background = `linear-gradient(90deg, ${c1} 50%, ${c2} 50%)`;
    else this.preview.style.background = c1 ?? '';
  }

  show(current: AvatarColor): void {
    this.syncSelection(current);
    this.root.classList.add('screen--visible');
  }

  hide(): void {
    this.root.classList.remove('screen--visible');
  }
}
