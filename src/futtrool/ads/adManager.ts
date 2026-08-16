// Gerenciador de anúncios (spec seção 10.5). Fica fora de core/ (não é
// simulação) e fora de render/ (renderer.ts só desenha estado de jogo,
// seção 13 decisão 5) — anúncio é conteúdo de configuração, não estado.

import type { Camera } from '../render/camera';
import type { AdCampaign, AdCreative, AdEvent, AdSlotId, AdsConfig } from './types';
import { CENTER_WATERMARK_RECT, FIELD_AD_RECTS, type WorldRect } from './slots';

const VIEWABLE_MS = 1000;
const VIEWABLE_AREA_FRACTION = 0.5;
const MAX_FIELD_SLOTS_VISIBLE = 2; // seção 10.3
const FIELD_BOARD_OPACITY = 0.95; // seção 10.3: entre 0.85 e 1.0
const WATERMARK_OPACITY = 0.12; // seção 10.3: no máximo 0.15

type VisibilityTracker = { visibleMs: number; reportedViewable: boolean };

const FIELD_SLOT_ORDER: (keyof typeof FIELD_AD_RECTS)[] = ['pitch-nw', 'pitch-ne', 'pitch-sw', 'pitch-se'];

function pickWeighted(options: AdCreative[]): AdCreative {
  const totalWeight = options.reduce((sum, o) => sum + (o.weight ?? 1), 0);
  let roll = Math.random() * totalWeight;
  for (const option of options) {
    roll -= option.weight ?? 1;
    if (roll <= 0) return option;
  }
  return options[options.length - 1] as AdCreative;
}

class AdManager {
  private config: AdsConfig | null = null;
  private events: AdEvent[] = [];
  private visibility = new Map<AdSlotId, VisibilityTracker>();
  private impressed = new Set<AdSlotId>();
  private images = new Map<string, HTMLImageElement>();
  private domTimers = new Map<AdSlotId, ReturnType<typeof setTimeout>>();

  load(config: AdsConfig): void {
    this.config = config;
  }

  // "respeita priority + weight" (seção 10.5): a campanha de maior
  // priority que tiver algum criativo pro slot vence; dentro dela, sorteio
  // ponderado pelo weight entre os criativos que miram esse slot.
  getCreative(slotId: AdSlotId): AdCreative | null {
    if (!this.config) return null;
    const campaigns = [...this.config.campaigns].sort((a, b) => b.priority - a.priority);
    for (const campaign of campaigns) {
      const options = campaign.creatives.filter((c) => c.slotId === slotId);
      if (options.length > 0) return pickWeighted(options);
    }
    return null;
  }

  private getImage(src: string): HTMLImageElement {
    let img = this.images.get(src);
    if (!img) {
      img = new Image();
      img.src = src;
      this.images.set(src, img);
    }
    return img;
  }

  private pushEvent(event: AdEvent): void {
    this.events.push(event);
    if (import.meta.env.DEV) {
      (window as unknown as { __adStats: AdEvent[] }).__adStats = this.events;
    }
  }

  getEvents(): readonly AdEvent[] {
    return this.events;
  }

  private getActiveFieldSlots(camera: Camera): (keyof typeof FIELD_AD_RECTS)[] {
    const visible = FIELD_SLOT_ORDER.filter((id) => {
      const rect = FIELD_AD_RECTS[id];
      return camera.worldRectVisibleFraction(rect.x, rect.y, rect.w, rect.h) > 0 && this.getCreative(id);
    });
    return visible.slice(0, MAX_FIELD_SLOTS_VISIBLE);
  }

  // Desenha os slots de campo (seção 10.3): sempre chamado ANTES de
  // desenhar jogadores/bola/FX no main.ts, pra nunca cobrir a jogada.
  renderFieldSlots(ctx: CanvasRenderingContext2D, camera: Camera): void {
    if (!this.config) return;
    for (const slotId of this.getActiveFieldSlots(camera)) {
      this.renderWorldSlot(ctx, camera, slotId, FIELD_AD_RECTS[slotId], FIELD_BOARD_OPACITY);
    }
    if (camera.worldRectVisibleFraction(CENTER_WATERMARK_RECT.x, CENTER_WATERMARK_RECT.y, CENTER_WATERMARK_RECT.w, CENTER_WATERMARK_RECT.h) > 0) {
      this.renderWorldSlot(ctx, camera, 'center-watermark', CENTER_WATERMARK_RECT, WATERMARK_OPACITY);
    }
  }

  private renderWorldSlot(ctx: CanvasRenderingContext2D, camera: Camera, slotId: AdSlotId, rect: WorldRect, opacity: number): void {
    const topLeft = camera.worldToScreen(rect.x, rect.y);
    const bottomRight = camera.worldToScreen(rect.x + rect.w, rect.y + rect.h);
    const screenX = Math.min(topLeft.x, bottomRight.x);
    const screenY = Math.min(topLeft.y, bottomRight.y);
    const screenW = Math.abs(bottomRight.x - topLeft.x);
    const screenH = Math.abs(bottomRight.y - topLeft.y);
    this.renderScreenRect(ctx, slotId, screenX, screenY, screenW, screenH, opacity);
  }

  // Slots "de tela" com coordenadas fixas em pixels, sem passar pela
  // câmera — usado pelo HUD (scoreboard-sponsor, seção 10.1).
  renderScreenRect(ctx: CanvasRenderingContext2D, slotId: AdSlotId, screenX: number, screenY: number, screenW: number, screenH: number, opacity = 1): void {
    const creative = this.getCreative(slotId);
    if (!creative) {
      // "Se o asset não carregar, o slot fica vazio... em dev desenha
      // borda tracejada com o slotId" (seção 10.3) — aplicado aqui também
      // pra falta de criativo configurado, não só falha de carregamento.
      if (import.meta.env.DEV) this.renderDevPlaceholder(ctx, slotId, screenX, screenY, screenW, screenH);
      return;
    }

    const img = this.getImage(creative.asset);
    if (!img.complete || img.naturalWidth === 0) {
      if (import.meta.env.DEV) this.renderDevPlaceholder(ctx, slotId, screenX, screenY, screenW, screenH);
      return;
    }

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.imageSmoothingEnabled = true;
    // "nunca esticar" (seção 10.3): escala tipo "contain", respeitando o
    // aspect ratio do criativo dentro do retângulo do slot.
    const scale = Math.min(screenW / img.naturalWidth, screenH / img.naturalHeight);
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    const drawX = screenX + (screenW - drawW) / 2;
    const drawY = screenY + (screenH - drawH) / 2;
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.restore();
  }

  private renderDevPlaceholder(ctx: CanvasRenderingContext2D, slotId: AdSlotId, x: number, y: number, w: number, h: number): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(253, 246, 255, 0.35)';
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = 'rgba(253, 246, 255, 0.5)';
    ctx.font = "10px 'Segoe UI', monospace";
    ctx.textAlign = 'left';
    ctx.fillText(slotId, x + 4, y + 14);
    ctx.restore();
  }

  // Chamado a cada tick da partida (seção 10.4): acumula tempo visível dos
  // slots de campo ativos e dispara impression/viewable.
  trackFieldVisibility(camera: Camera, dt: number): void {
    if (!this.config) return;
    const active = this.getActiveFieldSlots(camera);
    const candidates: { slotId: AdSlotId; rect: WorldRect }[] = active.map((id) => ({ slotId: id, rect: FIELD_AD_RECTS[id] }));
    if (camera.worldRectVisibleFraction(CENTER_WATERMARK_RECT.x, CENTER_WATERMARK_RECT.y, CENTER_WATERMARK_RECT.w, CENTER_WATERMARK_RECT.h) > 0) {
      candidates.push({ slotId: 'center-watermark', rect: CENTER_WATERMARK_RECT });
    }

    for (const { slotId, rect } of candidates) {
      const creative = this.getCreative(slotId);
      if (!creative) continue;

      if (!this.impressed.has(slotId)) {
        this.pushEvent({ type: 'impression', slotId, creativeId: creative.asset, t: Date.now() });
        this.impressed.add(slotId);
      }

      const fraction = camera.worldRectVisibleFraction(rect.x, rect.y, rect.w, rect.h);
      const tracker = this.visibility.get(slotId) ?? { visibleMs: 0, reportedViewable: false };

      if (fraction >= VIEWABLE_AREA_FRACTION) {
        tracker.visibleMs += dt * 1000;
        if (!tracker.reportedViewable && tracker.visibleMs >= VIEWABLE_MS) {
          this.pushEvent({ type: 'viewable', slotId, creativeId: creative.asset, visibleMs: tracker.visibleMs });
          tracker.reportedViewable = true;
        }
      } else {
        tracker.visibleMs = 0;
        tracker.reportedViewable = false;
      }
      this.visibility.set(slotId, tracker);
    }
  }

  // Pra slots de tela (menu, matchmaking, fim de jogo, replay) — a "área
  // visível" não depende de câmera, é 100% ou nada, então o impression
  // dispara na hora e o viewable só precisa de 1s contínuo em tela.
  trackDomSlotShown(slotId: AdSlotId): void {
    const creative = this.getCreative(slotId);
    if (!creative) return;

    this.pushEvent({ type: 'impression', slotId, creativeId: creative.asset, t: Date.now() });

    const existing = this.domTimers.get(slotId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.pushEvent({ type: 'viewable', slotId, creativeId: creative.asset, visibleMs: VIEWABLE_MS });
    }, VIEWABLE_MS);
    this.domTimers.set(slotId, timer);
  }

  trackDomSlotHidden(slotId: AdSlotId): void {
    const timer = this.domTimers.get(slotId);
    if (timer) {
      clearTimeout(timer);
      this.domTimers.delete(slotId);
    }
  }

  // Slots de campo não são clicáveis durante a partida (arruinaria o
  // controle) — só nas telas (seção 10.3). Quem decide QUANDO chamar isso
  // é o main.ts/telas; adManager só registra o clique e abre o link.
  onClick(slotId: AdSlotId): void {
    const creative = this.getCreative(slotId);
    if (!creative) return;
    this.pushEvent({ type: 'click', slotId, creativeId: creative.asset });
    if (creative.clickUrl) window.open(creative.clickUrl, '_blank', 'noopener,noreferrer');
  }

  getCreativeImageSrc(slotId: AdSlotId): string | null {
    return this.getCreative(slotId)?.asset ?? null;
  }

  // ball-skin / player-badge (seção 10.1): "patrocínio premium", sem
  // retângulo fixo — desenhados por cima da bola/jogador quando houver
  // criativo configurado; sem criativo, não desenham nada (não são slots
  // "sempre visíveis" como os de campo).
  renderBallSkin(ctx: CanvasRenderingContext2D, camera: Camera, pos: { x: number; y: number }, radius: number): boolean {
    const creative = this.getCreative('ball-skin');
    if (!creative) return false;
    const img = this.getImage(creative.asset);
    if (!img.complete || img.naturalWidth === 0) return false;

    const center = camera.worldToScreen(pos.x, pos.y);
    const r = camera.worldLengthToScreen(radius);
    ctx.save();
    ctx.beginPath();
    ctx.arc(center.x, center.y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, center.x - r, center.y - r, r * 2, r * 2);
    ctx.restore();
    return true;
  }

  renderPlayerBadge(ctx: CanvasRenderingContext2D, camera: Camera, pos: { x: number; y: number }, radius: number): void {
    const creative = this.getCreative('player-badge');
    if (!creative) return;
    const img = this.getImage(creative.asset);
    if (!img.complete || img.naturalWidth === 0) return;

    const center = camera.worldToScreen(pos.x, pos.y);
    const r = camera.worldLengthToScreen(radius);
    const badgeSize = Math.max(10, r * 0.55);
    ctx.drawImage(img, center.x + r * 0.4, center.y + r * 0.4, badgeSize, badgeSize);
  }
}

export const adManager = new AdManager();
export type { AdCampaign };
