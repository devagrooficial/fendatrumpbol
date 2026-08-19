-- Rode isso no SQL Editor do Supabase. Estatísticas do FutTrool (menu >
-- pedido: "coletar dados estatísticos... quantidade de toque na bola,
-- quantidade de gol por jogador, porcentagem de tempo com a bola no campo
-- do adversário") — uma linha por partida encerrada, do ponto de vista de
-- QUEM JOGOU (não guarda a partida inteira jogador a jogador; em 2v2/3v3
-- cada humano salva só a própria linha, ver src/futtrool/stats/storage.ts).
--
-- Segue o mesmo padrão de public.replays: vinculado à conta (user_id),
-- RLS restrita a "só o dono vê/mexe".

create table if not exists public.match_stats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  team_size integer not null default 1 check (team_size between 1 and 3),
  online boolean not null default false,
  outcome text not null check (outcome in ('win', 'loss', 'draw')),
  score_mine integer not null default 0 check (score_mine >= 0),
  score_opponent integer not null default 0 check (score_opponent >= 0),
  goals integer not null default 0 check (goals >= 0),
  touches integer not null default 0 check (touches >= 0),
  -- % (0-100) do tempo de jogo com a bola no campo de ATAQUE do jogador
  -- (ver core/types.ts MatchStats.ballInRightHalfMs).
  attack_pct numeric not null default 0 check (attack_pct >= 0 and attack_pct <= 100),
  created_at timestamptz not null default now()
);

create index if not exists match_stats_user_id_created_at_idx on public.match_stats (user_id, created_at desc);

alter table public.match_stats enable row level security;

create policy "Usuário lê as próprias estatísticas"
  on public.match_stats for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Usuário salva as próprias estatísticas"
  on public.match_stats for insert
  to authenticated
  with check (auth.uid() = user_id);
