// Tipos do sistema de publicidade (spec seção 10). Puro dado — sem lógica
// aqui, isso mora em adManager.ts.

export type AdSlotId =
  | 'pitch-nw'
  | 'pitch-sw'
  | 'pitch-ne'
  | 'pitch-se'
  | 'center-watermark'
  | 'scoreboard-sponsor'
  | 'loading-hero'
  | 'endgame-banner'
  | 'replay-lower-third'
  | 'menu-footer'
  | 'ball-skin'
  | 'player-badge';

export type AdCreative = {
  slotId: AdSlotId;
  asset: string;
  alt?: string;
  clickUrl?: string;
  weight?: number;
};

export type AdCampaign = {
  id: string;
  advertiser: string;
  priority: number;
  creatives: AdCreative[];
};

export type AdsConfig = {
  version: number;
  defaultCampaign: string;
  campaigns: AdCampaign[];
};

// Telemetria (seção 10.4) — exposta em window.__adStats em dev.
export type AdEvent =
  | { type: 'impression'; slotId: AdSlotId; creativeId: string; t: number }
  | { type: 'viewable'; slotId: AdSlotId; creativeId: string; visibleMs: number }
  | { type: 'click'; slotId: AdSlotId; creativeId: string };
