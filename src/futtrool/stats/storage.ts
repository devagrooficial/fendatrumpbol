// Salva o resumo estatístico de UMA partida encerrada (menu > pedido:
// toque na bola, gol por jogador, % de tempo com a bola no campo do
// adversário) — do ponto de vista de quem jogou (ver
// supabase/migrations/003_add_match_stats.sql). Mesmo padrão de
// replay/storage.ts: precisa de sessão ativa, senão save() devolve
// `false` em silêncio (offline sem login continua jogável, só não
// persiste histórico).

import { supabase } from '../../auth/supabaseClient';
import type { MatchOutcome } from '../progression/economy';

export type MatchStatsRecord = {
  teamSize: number;
  online: boolean;
  outcome: MatchOutcome;
  scoreMine: number;
  scoreOpponent: number;
  goals: number;
  touches: number;
  attackPct: number;
};

export class MatchStatsStore {
  async save(record: MatchStatsRecord): Promise<boolean> {
    if (!supabase) return false;
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return false;

    const { error } = await supabase.from('match_stats').insert({
      user_id: userId,
      team_size: record.teamSize,
      online: record.online,
      outcome: record.outcome,
      score_mine: record.scoreMine,
      score_opponent: record.scoreOpponent,
      goals: record.goals,
      touches: record.touches,
      attack_pct: Math.round(record.attackPct * 10) / 10,
    });

    return !error;
  }
}
