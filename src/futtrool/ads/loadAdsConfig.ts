// Carrega a config de anúncios do FutTrool. Antes vivia só num JSON
// estático (public/futtrool/ads.config.json) — precisava de rebuild pra
// mudar qualquer coisa. Agora busca do Supabase (public.ad_creatives,
// gerenciável ao vivo pelo painel de admin, ver src/admin/screens/Ads.ts),
// caindo pro JSON estático como fallback se o Supabase não estiver
// configurado, a consulta falhar, ou a tabela ainda não tiver sido
// semeada — assim o jogo nunca fica sem anúncio nenhum por causa de um
// problema de infraestrutura que não devia afetar quem só quer jogar.

import { supabase } from '../../auth/supabaseClient';
import type { AdCampaign, AdCreative, AdsConfig, AdSlotId } from './types';

type AdCreativeRow = {
  slot_id: string;
  campaign_id: string;
  advertiser: string;
  priority: number;
  weight: number;
  asset_url: string;
  alt: string | null;
  click_url: string | null;
  active: boolean;
};

// Uma linha por slot+campanha (não uma tabela de campanhas à parte) —
// assume que toda linha de uma mesma `campaign_id` usa a mesma
// `advertiser`/`priority` (é como o admin gerencia isso, ver painel); se
// alguém deixar inconsistente, prevalece a da primeira linha encontrada.
function buildAdsConfig(rows: AdCreativeRow[]): AdsConfig {
  const campaignsById = new Map<string, AdCampaign>();
  for (const row of rows) {
    let campaign = campaignsById.get(row.campaign_id);
    if (!campaign) {
      campaign = { id: row.campaign_id, advertiser: row.advertiser, priority: row.priority, creatives: [] };
      campaignsById.set(row.campaign_id, campaign);
    }
    const creative: AdCreative = {
      slotId: row.slot_id as AdSlotId,
      asset: row.asset_url,
      alt: row.alt ?? undefined,
      clickUrl: row.click_url ?? undefined,
      weight: row.weight,
    };
    campaign.creatives.push(creative);
  }
  const campaigns = Array.from(campaignsById.values());
  return { version: 1, defaultCampaign: campaigns[0]?.id ?? 'house', campaigns };
}

async function loadFromStaticFallback(): Promise<AdsConfig> {
  const res = await fetch('/futtrool/ads.config.json');
  return res.json() as Promise<AdsConfig>;
}

export async function loadAdsConfig(): Promise<AdsConfig> {
  if (!supabase) return loadFromStaticFallback();

  const { data, error } = await supabase
    .from('ad_creatives')
    .select('slot_id, campaign_id, advertiser, priority, weight, asset_url, alt, click_url, active')
    .eq('active', true);

  if (error || !data || data.length === 0) return loadFromStaticFallback();
  return buildAdsConfig(data as AdCreativeRow[]);
}
