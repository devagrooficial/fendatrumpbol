import { t } from '../../i18n';
import { Audio } from '../../audio/Audio';
import { createAdSlotImg, hideAdSlot, showAdSlot } from '../adSlot';

// Spec seção 7: "PROCURANDO PARTIDA..." (2-4s, animado — prepara o ritual
// do online, mesmo sendo local na entrega 1).
const MIN_DURATION_MS = 2000;
const MAX_DURATION_MS = 4000;

export class MatchmakingScreen {
  private readonly root: HTMLDivElement;
  private readonly subtitleEl: HTMLParagraphElement;
  private readonly countdownEl: HTMLParagraphElement;
  private readonly queueStatusEl: HTMLParagraphElement;
  private readonly roomInfoEl: HTMLDivElement;
  private readonly roomLinkInput: HTMLInputElement;
  private readonly copyStatusEl: HTMLParagraphElement;
  private readonly heroAd: HTMLImageElement;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(onCancel: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'screen';
    this.root.innerHTML = `
      <div class="screen__panel">
        <h1 class="screen__title">${t('matchmaking.title')}</h1>
        <p class="screen__subtitle" data-subtitle></p>
        <div data-hero-ad-slot></div>
        <div class="matchmaking-spinner"></div>
        <p class="matchmaking-countdown" data-countdown></p>
        <p class="screen__placeholder-note" data-queue-status></p>
        <div class="screen__field" data-room-info hidden>
          <p class="screen__field-label">${t('matchmaking.online.roomLinkLabel')}</p>
          <div class="screen__field-row">
            <input type="text" class="screen__input" data-room-link readonly />
            <button type="button" class="screen__button screen__button--secondary" data-copy-link>${t('matchmaking.online.copyLink')}</button>
          </div>
          <p class="screen__placeholder-note" data-copy-status></p>
        </div>
        <button type="button" class="screen__button screen__button--secondary" data-cancel>${t('matchmaking.cancel')}</button>
      </div>
    `;

    this.heroAd = createAdSlotImg('loading-hero', 'ad-slot ad-slot--loading-hero');
    this.root.querySelector('[data-hero-ad-slot]')?.replaceWith(this.heroAd);

    const subtitleEl = this.root.querySelector<HTMLParagraphElement>('[data-subtitle]');
    const countdownEl = this.root.querySelector<HTMLParagraphElement>('[data-countdown]');
    const queueStatusEl = this.root.querySelector<HTMLParagraphElement>('[data-queue-status]');
    const roomInfoEl = this.root.querySelector<HTMLDivElement>('[data-room-info]');
    const roomLinkInput = this.root.querySelector<HTMLInputElement>('[data-room-link]');
    const copyLinkButton = this.root.querySelector<HTMLButtonElement>('[data-copy-link]');
    const copyStatusEl = this.root.querySelector<HTMLParagraphElement>('[data-copy-status]');
    const cancelButton = this.root.querySelector<HTMLButtonElement>('[data-cancel]');
    if (
      !subtitleEl ||
      !countdownEl ||
      !queueStatusEl ||
      !roomInfoEl ||
      !roomLinkInput ||
      !copyLinkButton ||
      !copyStatusEl ||
      !cancelButton
    ) {
      throw new Error('Markup do MatchmakingScreen incompleto');
    }
    this.subtitleEl = subtitleEl;
    this.countdownEl = countdownEl;
    this.queueStatusEl = queueStatusEl;
    this.roomInfoEl = roomInfoEl;
    this.roomLinkInput = roomLinkInput;
    this.copyStatusEl = copyStatusEl;

    copyLinkButton.addEventListener('click', () => {
      Audio.click();
      void this.copyRoomLink();
    });

    cancelButton.addEventListener('click', () => {
      Audio.click();
      this.stopTimers();
      onCancel();
    });

    document.body.appendChild(this.root);
  }

  private async copyRoomLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.roomLinkInput.value);
      this.copyStatusEl.textContent = t('matchmaking.online.linkCopied');
    } catch {
      // Clipboard API pode falhar (permissão negada, contexto não-seguro
      // etc.) — o input já fica com o texto selecionado como fallback, dá
      // pra copiar na mão (segurar e copiar funciona em qualquer navegador).
      this.roomLinkInput.select();
      this.copyStatusEl.textContent = t('matchmaking.online.copyManually');
    }
  }

  show(difficultyLabel: string, onDone: () => void): void {
    this.subtitleEl.textContent = t('matchmaking.subtitle', { difficulty: difficultyLabel });
    this.root.classList.add('screen--visible');
    showAdSlot(this.heroAd, 'loading-hero');

    const duration = MIN_DURATION_MS + Math.random() * (MAX_DURATION_MS - MIN_DURATION_MS);
    const startedAt = performance.now();

    this.stopTimers();
    this.intervalId = setInterval(() => {
      const elapsed = (performance.now() - startedAt) / 1000;
      this.countdownEl.textContent = `${elapsed.toFixed(1)}s`;
    }, 100);
    this.timeoutId = setTimeout(() => {
      this.stopTimers();
      onDone();
    }, duration);
  }

  // Multiplayer 1v1 (server/): a espera aqui não tem duração fixa — só
  // termina quando o servidor pareia com outro jogador de verdade (ou a
  // pessoa cancela). Quem decide encerrar essa tela é o main.ts, chamando
  // `hide()` na hora certa (partida encontrada, erro de conexão, cancelado).
  showOnline(): void {
    this.subtitleEl.textContent = t('matchmaking.online.subtitle');
    this.root.classList.add('screen--visible');
    this.roomInfoEl.hidden = true;
    this.queueStatusEl.textContent = '';
    showAdSlot(this.heroAd, 'loading-hero');

    const startedAt = performance.now();
    this.stopTimers();
    this.intervalId = setInterval(() => {
      const elapsed = (performance.now() - startedAt) / 1000;
      this.countdownEl.textContent = `${elapsed.toFixed(1)}s`;
    }, 100);
  }

  // Só relevante durante showOnline() em modo fila aleatória (quickMatch) —
  // sala privada não tem fila, então main.ts nunca chama isso nesse modo.
  setQueueStatus(waitingCount: number): void {
    // waitingCount inclui a própria conexão — "esperando..." plano quando
    // não há mais ninguém (0 outras pessoas), sem forçar singular/plural
    // estranho tipo "0 pessoas".
    const others = Math.max(0, waitingCount - 1);
    this.queueStatusEl.textContent =
      others === 0
        ? t('matchmaking.online.queueEmpty')
        : t('matchmaking.online.queueStatus', { count: others });
  }

  // Sala privada (convite por link/código) — mesma tela de espera, mas com
  // o link pra compartilhar em vez de contador de fila.
  showRoomCreated(code: string, link: string): void {
    this.subtitleEl.textContent = t('matchmaking.online.roomWaiting', { code });
    this.root.classList.add('screen--visible');
    this.roomInfoEl.hidden = false;
    this.roomLinkInput.value = link;
    this.copyStatusEl.textContent = '';
    showAdSlot(this.heroAd, 'loading-hero');

    const startedAt = performance.now();
    this.stopTimers();
    this.intervalId = setInterval(() => {
      const elapsed = (performance.now() - startedAt) / 1000;
      this.countdownEl.textContent = `${elapsed.toFixed(1)}s`;
    }, 100);
  }

  hide(): void {
    this.stopTimers();
    this.root.classList.remove('screen--visible');
    this.roomInfoEl.hidden = true;
    hideAdSlot('loading-hero');
  }

  refreshAd(): void {
    showAdSlot(this.heroAd, 'loading-hero');
  }

  private stopTimers(): void {
    if (this.timeoutId !== null) clearTimeout(this.timeoutId);
    if (this.intervalId !== null) clearInterval(this.intervalId);
    this.timeoutId = null;
    this.intervalId = null;
  }
}
