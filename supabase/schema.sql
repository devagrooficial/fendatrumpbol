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


-- ---------------------------------------------------------------------------
-- Auth (cadastro/login/esqueci senha) — rode isso depois de já ter criado a
-- tabela public.users pelo Table Editor (id bigint identity, created_at,
-- email varchar, nome varchar). Falta só a coluna que liga cada linha ao
-- usuário de verdade do Supabase Auth (auth.users) e as políticas de RLS —
-- sem elas, a tabela fica com RLS ligado e ZERO política, o que bloqueia
-- toda leitura/escrita (é o aviso "Policies are required to query data" que
-- aparece no painel).
--
-- Importante: só rode o "not null" da coluna nova se a tabela ainda
-- estiver vazia (não tem nenhuma linha de teste) — senão o ALTER falha
-- porque as linhas existentes não têm valor pra essa coluna.
-- ---------------------------------------------------------------------------

alter table public.users
  add column if not exists user_id uuid not null references auth.users (id) on delete cascade;

create unique index if not exists users_user_id_key on public.users (user_id);

alter table public.users enable row level security;

-- Cada usuário só enxerga/edita a própria linha — nunca a de outra pessoa.
create policy "Usuário lê o próprio perfil"
  on public.users for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Usuário cria o próprio perfil"
  on public.users for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Usuário atualiza o próprio perfil"
  on public.users for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
