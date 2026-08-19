-- Rode isso no SQL Editor do Supabase. Campeonato do FutTrool (quartas →
-- semifinal → final, 8 jogadores) — registro/histórico do torneio.
--
-- Quem decide de VERDADE quem ganha cada partida é sempre o servidor
-- autoritativo (server/src/index.ts, mesma simulação de sempre) — essa
-- tabela é só o REGISTRO público do que já aconteceu (pro painel da
-- chave/bracket e pra histórico), não é usada como fonte de verdade
-- durante a partida em si. Por isso RLS pública de leitura E escrita —
-- MESMO padrão já aceito em public.leaderboard (o server só tem a anon
-- key, sem service_role, de propósito, ver server/src/adminConfig.ts) —
-- alguém adulterando essa tabela direto via console não muda o resultado
-- real de nenhuma partida, só o registro público dela.
--
-- `teams`/`matches` guardados como um snapshot JSONB inteiro (não
-- relacional) — mais simples de escrever/ler um torneio inteiro de uma vez
-- só, e o volume de escrita é baixo (só muda quando alguém entra, uma
-- partida termina, ou o torneio acaba).

create table if not exists public.tournaments (
  id uuid primary key,
  team_size integer not null default 1 check (team_size between 1 and 3),
  status text not null default 'waiting' check (status in ('waiting', 'active', 'completed')),
  teams jsonb not null default '[]',
  matches jsonb not null default '[]',
  champion_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tournaments_status_idx on public.tournaments (status, created_at desc);

alter table public.tournaments enable row level security;

create policy "Qualquer um lê os torneios"
  on public.tournaments for select
  using (true);

create policy "Qualquer um registra/atualiza torneios"
  on public.tournaments for insert
  with check (true);

create policy "Qualquer um atualiza torneios"
  on public.tournaments for update
  using (true)
  with check (true);
