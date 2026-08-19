// Tela "Estatísticas" do admin: números agregados de uso, um bloco por
// jogo do hub. Só lê o que já existe (nenhuma tabela nova pra isso) —
// FutTrool tem dados de verdade (match_stats/replays/users), Trumpbol só
// tem o ranking (leaderboard, anônimo — sem como saber jogador único),
// Flysim não salva nada ainda (ver pesquisa que fundamentou essa tela).

import { supabase } from '../../auth/supabaseClient';

function card(value: string, label: string): string {
  return `<div class="admin__card"><div class="admin__stat-value">${value}</div><div class="admin__stat-label">${label}</div></div>`;
}

export function mountStatsScreen(el: HTMLElement): () => void {
  let cancelled = false;

  el.innerHTML = `
    <h2 class="admin__section-title">Estatísticas gerais</h2>
    <div data-body><p class="admin__empty">Carregando…</p></div>
  `;
  const body = el.querySelector<HTMLDivElement>('[data-body]')!;

  async function load(): Promise<void> {
    if (!supabase) {
      body.innerHTML = '<p class="admin__empty">Supabase não configurado.</p>';
      return;
    }

    const [usersCount, matchStats, replaysCount, leaderboard] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('match_stats').select('outcome, goals, touches'),
      supabase.from('replays').select('*', { count: 'exact', head: true }),
      supabase.from('leaderboard').select('score'),
    ]);

    if (cancelled) return;

    const matchRows = (matchStats.data ?? []) as { outcome: string; goals: number; touches: number }[];
    const totalMatches = matchRows.length;
    const wins = matchRows.filter((r) => r.outcome === 'win').length;
    const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;
    const totalGoals = matchRows.reduce((sum, r) => sum + r.goals, 0);
    const totalTouches = matchRows.reduce((sum, r) => sum + r.touches, 0);

    const scores = ((leaderboard.data ?? []) as { score: number }[]).map((r) => r.score);
    const topScore = scores.length > 0 ? Math.max(...scores) : 0;
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    body.innerHTML = `
      <h3 class="admin__section-title" style="font-size:0.9rem;color:rgba(253,246,255,0.7);">FutTrool</h3>
      <div class="admin__cards-row">
        ${card(String(usersCount.count ?? 0), 'Contas cadastradas')}
        ${card(String(totalMatches), 'Partidas registradas (por jogador logado)')}
        ${card(`${winRate}%`, 'Taxa de vitória')}
        ${card(String(totalGoals), 'Gols no total')}
        ${card(String(totalTouches), 'Toques na bola no total')}
        ${card(String(replaysCount.count ?? 0), 'Replays salvos')}
      </div>

      <h3 class="admin__section-title" style="font-size:0.9rem;color:rgba(253,246,255,0.7);">Trumpbol</h3>
      <div class="admin__cards-row">
        ${card(String(scores.length), 'Partidas registradas no ranking')}
        ${card(String(topScore), 'Maior pontuação')}
        ${card(String(avgScore), 'Pontuação média')}
      </div>
      <p class="admin__message" style="color:rgba(253,246,255,0.5);">Ranking do Trumpbol é anônimo (sem login) — não dá pra saber quantas pessoas ÚNICAS jogaram, só quantas partidas foram registradas.</p>

      <h3 class="admin__section-title" style="font-size:0.9rem;color:rgba(253,246,255,0.7);">Flysim</h3>
      <p class="admin__empty">Esse jogo ainda não salva nenhum dado — sem estatística pra mostrar.</p>
    `;
  }

  void load();

  return () => {
    cancelled = true;
  };
}
