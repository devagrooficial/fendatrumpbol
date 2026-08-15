-- Rode isso no SQL Editor do seu projeto Supabase (Project > SQL Editor > New query).
-- Cria a tabela do ranking e as políticas de RLS necessárias pro jogo (rodando
-- só com a anon key no navegador) conseguir ler o ranking e enviar novos scores.

create table if not exists public.leaderboard (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 20),
  score integer not null check (score >= 0),
  distance integer not null default 0 check (distance >= 0),
  coins integer not null default 0 check (coins >= 0),
  gems integer not null default 0 check (gems >= 0),
  character_id text not null default 'mulher-loira',
  created_at timestamptz not null default now()
);

create index if not exists leaderboard_score_idx on public.leaderboard (score desc);

alter table public.leaderboard enable row level security;

-- Qualquer um pode ler o ranking (é público, tipo placar de arcade).
create policy "Leitura publica do ranking"
  on public.leaderboard for select
  using (true);

-- Qualquer um pode registrar um score (sem login) — mas não pode editar
-- nem apagar nada depois. Os checks acima já limitam nome/score no insert.
create policy "Qualquer um pode enviar seu score"
  on public.leaderboard for insert
  with check (true);
