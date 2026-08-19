// Salvar/listar replays (spec seção 8) — agora vinculado à conta de
// verdade em vez de só localStorage: guarda no Supabase (tabela
// public.replays, RLS restrita a "só o dono vê/mexe", ver
// supabase/schema.sql), então o mesmo replay aparece depois de entrar
// com a mesma conta em outro aparelho.
//
// Precisa de sessão ativa — sem login, list() devolve `null` (diferente
// de `[]`, que é "logado mas sem nenhum replay salvo ainda") e save()
// devolve `false`, pra quem chama poder distinguir "sem conta" de "deu
// erro de verdade" e mostrar a mensagem certa.

import { supabase } from '../../auth/supabaseClient';
import { REPLAY } from '../core/constants';
import type { TeamId } from '../core/types';
import type { ReplaySnapshot } from './buffer';

export type SavedReplay = {
  id: string;
  savedAt: string; // ISO 8601
  score: Record<TeamId, number>;
  snapshots: ReplaySnapshot[];
};

// Nomes de coluna no Postgres continuam score_p1/score_p2 (não vale a pena
// migrar só por causa do nome) — mapeiam pra teamA/teamB, que é sempre
// exatamente 2 times independente do tamanho de cada um (1v1, 2v2, ...).
type ReplayRow = {
  id: string;
  created_at: string;
  score_p1: number;
  score_p2: number;
  snapshots: ReplaySnapshot[];
};

function fromRow(row: ReplayRow): SavedReplay {
  return {
    id: row.id,
    savedAt: row.created_at,
    score: { teamA: row.score_p1, teamB: row.score_p2 },
    snapshots: row.snapshots,
  };
}

export class ReplayStore {
  async list(): Promise<SavedReplay[] | null> {
    if (!supabase) return null;
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return null;

    const { data, error } = await supabase
      .from('replays')
      .select('id, created_at, score_p1, score_p2, snapshots')
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return (data as ReplayRow[]).map(fromRow);
  }

  async save(score: Record<TeamId, number>, snapshots: ReplaySnapshot[]): Promise<boolean> {
    if (!supabase) return false;
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return false;

    const { error } = await supabase.from('replays').insert({
      user_id: userId,
      score_p1: score.teamA,
      score_p2: score.teamB,
      snapshots,
    });
    if (error) return false;

    await this.trimToMax();
    return true;
  }

  async remove(id: string): Promise<void> {
    if (!supabase) return;
    await supabase.from('replays').delete().eq('id', id);
  }

  // Mantém só os REPLAY.MAX_SAVED mais recentes — o Postgres não tem um
  // "insira e já apague o mais velho se passar do limite" nativo sem uma
  // função/trigger dedicada, então isso roda do lado do cliente logo
  // depois de cada save() (RLS já garante que só apaga linha do próprio
  // usuário, não precisa filtrar por user_id aqui de novo).
  private async trimToMax(): Promise<void> {
    if (!supabase) return;
    const { data } = await supabase.from('replays').select('id').order('created_at', { ascending: false });

    const idsToRemove = ((data ?? []) as { id: string }[]).slice(REPLAY.MAX_SAVED).map((row) => row.id);
    if (idsToRemove.length > 0) {
      await supabase.from('replays').delete().in('id', idsToRemove);
    }
  }
}
