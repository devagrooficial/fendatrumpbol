// Helper compartilhado pelos slots de anúncio "de tela" (loading-hero,
// endgame-banner, replay-lower-third, menu-footer) — as 4 telas DOM
// seguem o mesmo padrão (seção 10.1/10.4), então isso evita repetir a
// lógica de mostrar/rastrear/clicar em cada uma.

import { adManager } from '../ads/adManager';
import type { AdSlotId } from '../ads/types';

export function createAdSlotImg(slotId: AdSlotId, className: string): HTMLImageElement {
  const img = document.createElement('img');
  img.className = className;
  img.alt = '';
  img.style.display = 'none';
  img.addEventListener('click', () => adManager.onClick(slotId));
  return img;
}

// Chamar quando a tela dona do slot for exibida — atualiza o criativo
// atual e começa a contar a visibilidade (impression + viewable, seção
// 10.4). Se não houver criativo configurado, o slot fica vazio (seção
// 10.3), sem quebrar o layout.
export function showAdSlot(img: HTMLImageElement, slotId: AdSlotId): void {
  const src = adManager.getCreativeImageSrc(slotId);
  if (!src) {
    img.style.display = 'none';
    return;
  }
  img.src = src;
  img.style.display = '';
  adManager.trackDomSlotShown(slotId);
}

export function hideAdSlot(slotId: AdSlotId): void {
  adManager.trackDomSlotHidden(slotId);
}
