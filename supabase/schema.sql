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


-- ---------------------------------------------------------------------------
-- Replays salvos do FutTrool — antes viviam só em localStorage (presos no
-- aparelho); agora ficam vinculados à conta, então dá pra ver o mesmo
-- replay depois de entrar em outro aparelho. Cada linha guarda o clipe
-- inteiro (snapshots) como jsonb — cabe tranquilo (cada replay tem no
-- máximo ~200KB, e o app já limita a 5 salvos por pessoa do lado do
-- cliente, ver REPLAY.MAX_SAVED em core/constants.ts).
-- ---------------------------------------------------------------------------

create table if not exists public.replays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  score_p1 integer not null default 0 check (score_p1 >= 0),
  score_p2 integer not null default 0 check (score_p2 >= 0),
  snapshots jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists replays_user_id_created_at_idx on public.replays (user_id, created_at desc);

alter table public.replays enable row level security;

create policy "Usuário lê os próprios replays"
  on public.replays for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Usuário salva os próprios replays"
  on public.replays for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Usuário apaga os próprios replays"
  on public.replays for delete
  to authenticated
  using (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- Apelido do FutTrool: nome curto (3 a 15 caracteres — o mínimo só é
-- garantido do lado do cliente, ver src/auth/profile.ts; o `varchar(15)`
-- só cobre o máximo) que a pessoa escolhe pra aparecer DENTRO do jogo
-- (acima do jogador, tela de fim de partida) — separado do `nome`
-- completo do cadastro, que pode ser bem mais longo e quebraria o layout.
-- Já cai sob as políticas de RLS que a public.users já tem (mesma tabela).
--
-- O `alter column ... type` funciona tanto se a coluna nunca existiu
-- (acabou de ser criada pelo `add column` acima, já no tamanho certo)
-- quanto se já existia como varchar(12) de uma versão anterior desse
-- arquivo — seguro rodar de novo dos dois jeitos.
-- ---------------------------------------------------------------------------

alter table public.users
  add column if not exists apelido varchar(15);

alter table public.users
  alter column apelido type varchar(15);
