import { RANKING } from '../config';

export type RankingEntry = {
  name: string;
  score: number;
  distance: number;
  coins: number;
  gems: number;
  characterId: string;
};

type SupabaseConfig = { url: string; key: string };

function getConfig(): SupabaseConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url, key };
}

type LeaderboardRow = {
  name: string;
  score: number;
  distance: number;
  coins: number;
  gems: number;
  character_id: string;
};

/**
 * Ranking online via REST API do Supabase (PostgREST), sem SDK — só fetch.
 * Fica automaticamente desativado se as variáveis de ambiente não existirem
 * (ver .env.example e supabase/schema.sql).
 */
export const Ranking = {
  isConfigured(): boolean {
    return getConfig() !== null;
  },

  async submitScore(entry: RankingEntry): Promise<boolean> {
    const config = getConfig();
    if (!config) return false;

    const name = entry.name.trim().slice(0, RANKING.NAME_MAX_LENGTH);
    if (!name) return false;

    try {
      const response = await fetch(`${config.url}/rest/v1/${RANKING.TABLE}`, {
        method: 'POST',
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          score: Math.floor(entry.score),
          distance: Math.floor(entry.distance),
          coins: Math.floor(entry.coins),
          gems: Math.floor(entry.gems),
          character_id: entry.characterId,
        }),
      });
      return response.ok;
    } catch {
      return false;
    }
  },

  async fetchTop(limit: number = RANKING.TOP_LIMIT): Promise<RankingEntry[]> {
    const config = getConfig();
    if (!config) return [];

    try {
      const query = `select=name,score,distance,coins,gems,character_id&order=score.desc&limit=${limit}`;
      const response = await fetch(`${config.url}/rest/v1/${RANKING.TABLE}?${query}`, {
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
        },
      });
      if (!response.ok) return [];

      const rows = (await response.json()) as LeaderboardRow[];
      return rows.map((row) => ({
        name: row.name,
        score: row.score,
        distance: row.distance,
        coins: row.coins,
        gems: row.gems ?? 0,
        characterId: row.character_id,
      }));
    } catch {
      return [];
    }
  },
};
