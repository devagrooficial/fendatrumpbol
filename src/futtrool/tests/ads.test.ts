import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adManager } from '../ads/adManager';
import type { AdsConfig } from '../ads/types';
import { AD_SLOT_IDS } from '../ads/slots';

// getCreative() é a única parte do adManager totalmente livre de DOM
// (não mexe em window/Image) — o resto (render/track/onClick) precisa de
// canvas/Image de verdade, então fica pra verificação manual no browser
// (ver docs/NOTES.md).

const CONFIG: AdsConfig = {
  version: 1,
  defaultCampaign: 'house',
  campaigns: [
    {
      id: 'house',
      advertiser: 'Casa',
      priority: 100,
      creatives: [{ slotId: 'pitch-nw', asset: 'house.svg', weight: 1 }],
    },
    {
      id: 'premium',
      advertiser: 'Anunciante VIP',
      priority: 200,
      creatives: [
        { slotId: 'pitch-nw', asset: 'premium-a.svg', weight: 3 },
        { slotId: 'pitch-nw', asset: 'premium-b.svg', weight: 1 },
      ],
    },
  ],
};

describe('adManager.getCreative', () => {
  it('lista os slots da tabela da seção 10.1 (12 linhas, embora o texto diga "11" — ver docs/NOTES.md)', () => {
    expect(AD_SLOT_IDS).toHaveLength(12);
  });

  it('devolve null sem config carregada', () => {
    adManager.load(undefined as unknown as AdsConfig);
    expect(adManager.getCreative('pitch-nw')).toBeNull();
  });

  it('devolve null se nenhuma campanha tiver criativo pro slot', () => {
    adManager.load(CONFIG);
    expect(adManager.getCreative('ball-skin')).toBeNull();
  });

  it('prioriza a campanha de maior priority', () => {
    adManager.load(CONFIG);
    const creative = adManager.getCreative('pitch-nw');
    // premium (priority 200) deve vencer a house (priority 100) — nenhum
    // dos dois criativos da house apareceria aqui.
    expect(creative?.asset).not.toBe('house.svg');
  });

  it('sorteio ponderado respeita o weight (mock de Math.random)', () => {
    adManager.load(CONFIG);
    const randomSpy = vi.spyOn(Math, 'random');

    // premium-a tem weight 3, premium-b tem weight 1 — total 4. Um roll
    // bem baixo (perto de 0) deve cair no primeiro (maior peso).
    randomSpy.mockReturnValue(0.01);
    expect(adManager.getCreative('pitch-nw')?.asset).toBe('premium-a.svg');

    // Um roll alto deve estourar o weight do primeiro (3/4 do total) e
    // cair no segundo.
    randomSpy.mockReturnValue(0.99);
    expect(adManager.getCreative('pitch-nw')?.asset).toBe('premium-b.svg');

    randomSpy.mockRestore();
  });
});

describe('adManager telemetria (window.__adStats)', () => {
  beforeEach(() => {
    (globalThis as unknown as { window?: unknown }).window = globalThis;
    (globalThis as unknown as { window: { __adStats?: unknown } }).window.__adStats = undefined;
  });

  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('onClick sem criativo configurado não faz nada (não lança)', () => {
    adManager.load({ version: 1, defaultCampaign: 'house', campaigns: [] });
    expect(() => adManager.onClick('menu-footer')).not.toThrow();
  });
});
