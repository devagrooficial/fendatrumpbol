-- Rode isso no SQL Editor do Supabase. Painel de administrador
-- (admin.html) — acesso restrito a UM email só (luisnathanpessoal@gmail.com),
-- checado nas próprias políticas de RLS via auth.jwt() ->> 'email', não
-- confiado do lado do cliente: mesmo que alguém force a tela de admin a
-- aparecer pelo console do navegador, toda leitura/escrita nas tabelas
-- abaixo continua bloqueada pelo Postgres a não ser que o JWT de sessão
-- REALMENTE pertença a esse email (RLS roda no banco, não no navegador).
--
-- IMPORTANTE: troque o e-mail abaixo em CADA policy se um dia mudar quem é
-- admin — está hardcoded de propósito (mais simples e mais seguro que uma
-- tabela de "roles" pra um admin único).

-- ---------------------------------------------------------------------------
-- Banimento (por email, não por user_id — dá pra banir mesmo quem nunca
-- logou, só decidiu não deixar entrar). Leitura pública de propósito: o
-- servidor de multiplayer (server/src/index.ts) só tem a anon key, sem
-- sessão de admin nenhuma, e precisa conseguir consultar essa lista pra
-- recusar conexão de gente banida — não é dado sensível (só a lista de
-- emails banidos), então liberar select geral evita precisar de uma
-- service_role key só pra isso.
-- ---------------------------------------------------------------------------

create table if not exists public.admin_bans (
  email text primary key,
  reason text,
  banned_at timestamptz not null default now(),
  banned_by text
);

alter table public.admin_bans enable row level security;

create policy "Qualquer um pode ler a lista de banidos"
  on public.admin_bans for select
  using (true);

create policy "Só o admin bane"
  on public.admin_bans for insert
  to authenticated
  with check (auth.jwt() ->> 'email' = 'luisnathanpessoal@gmail.com');

create policy "Só o admin desbane"
  on public.admin_bans for delete
  to authenticated
  using (auth.jwt() ->> 'email' = 'luisnathanpessoal@gmail.com');

-- ---------------------------------------------------------------------------
-- Admin enxerga TODOS os perfis (não só o próprio) — soma à política
-- existente "Usuário lê o próprio perfil" (RLS combina policies
-- permissivas com OR, então isso só ADICIONA acesso, não tira o que já
-- existia pra usuário comum).
-- ---------------------------------------------------------------------------

create policy "Admin lê todos os perfis"
  on public.users for select
  to authenticated
  using (auth.jwt() ->> 'email' = 'luisnathanpessoal@gmail.com');

-- ---------------------------------------------------------------------------
-- Bloqueia ESCRITA de quem está banido nas tabelas do FutTrool que dependem
-- de sessão logada (replays e match_stats) — dá pra ler/logar, mas os dados
-- da partida de alguém banido não entram no banco. `admin_bans` já é
-- select-público (acima), então o "not exists" abaixo funciona sem
-- precisar de função security definer nem service_role key.
-- ---------------------------------------------------------------------------

drop policy if exists "Usuário salva os próprios replays" on public.replays;
create policy "Usuário salva os próprios replays"
  on public.replays for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and not exists (select 1 from public.admin_bans where email = auth.jwt() ->> 'email')
  );

drop policy if exists "Usuário salva as próprias estatísticas" on public.match_stats;
create policy "Usuário salva as próprias estatísticas"
  on public.match_stats for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and not exists (select 1 from public.admin_bans where email = auth.jwt() ->> 'email')
  );

-- ---------------------------------------------------------------------------
-- Publicidade do FutTrool — antes vivia só num JSON estático
-- (public/futtrool/ads.config.json, precisava de rebuild pra mudar
-- qualquer coisa); agora fica aqui, editável ao vivo pelo painel de admin.
-- Leitura pública (o jogo busca isso sem sessão nenhuma, todo mundo vê
-- anúncio); escrita só o admin.
-- ---------------------------------------------------------------------------

create table if not exists public.ad_creatives (
  id uuid primary key default gen_random_uuid(),
  slot_id text not null,
  campaign_id text not null default 'house',
  advertiser text not null default 'FutTrool',
  priority integer not null default 100,
  weight numeric not null default 1 check (weight > 0),
  asset_url text not null,
  alt text,
  click_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ad_creatives_slot_id_idx on public.ad_creatives (slot_id);

alter table public.ad_creatives enable row level security;

create policy "Qualquer um lê os anúncios"
  on public.ad_creatives for select
  using (true);

create policy "Só o admin cria anúncio"
  on public.ad_creatives for insert
  to authenticated
  with check (auth.jwt() ->> 'email' = 'luisnathanpessoal@gmail.com');

create policy "Só o admin edita anúncio"
  on public.ad_creatives for update
  to authenticated
  using (auth.jwt() ->> 'email' = 'luisnathanpessoal@gmail.com')
  with check (auth.jwt() ->> 'email' = 'luisnathanpessoal@gmail.com');

create policy "Só o admin apaga anúncio"
  on public.ad_creatives for delete
  to authenticated
  using (auth.jwt() ->> 'email' = 'luisnathanpessoal@gmail.com');

-- Semente: os mesmos 12 anúncios "casa" que já viviam em
-- public/futtrool/ads.config.json (agora só um fallback estático caso o
-- Supabase esteja fora do ar, ver src/futtrool/main.ts) — sem isso, o
-- primeiro deploy dessa migration deixaria TODOS os slots em branco até
-- alguém recriar cada um manualmente pelo painel de admin. Só insere se a
-- tabela ainda estiver vazia (`where not exists`) — seguro rodar esse
-- arquivo de novo sem duplicar linha.
insert into public.ad_creatives (slot_id, campaign_id, advertiser, priority, weight, asset_url, alt, click_url)
select * from (values
  ('pitch-nw', 'house', 'FutTrool (casa)', 100, 1, '/futtrool/ads/house-pitch-board.svg', 'FutTrool', null),
  ('pitch-ne', 'house', 'FutTrool (casa)', 100, 1, '/futtrool/ads/house-pitch-board-alt.svg', 'Mateus Almeida', 'https://github.com'),
  ('pitch-sw', 'house', 'FutTrool (casa)', 100, 1, '/futtrool/ads/house-pitch-board-alt.svg', 'Mateus Almeida', 'https://github.com'),
  ('pitch-se', 'house', 'FutTrool (casa)', 100, 1, '/futtrool/ads/house-pitch-board.svg', 'FutTrool', null),
  ('center-watermark', 'house', 'FutTrool (casa)', 100, 1, '/futtrool/ads/house-watermark.svg', 'FutTrool', null),
  ('scoreboard-sponsor', 'house', 'FutTrool (casa)', 100, 1, '/futtrool/ads/house-scoreboard.svg', 'FutTrool', null),
  ('loading-hero', 'house', 'FutTrool (casa)', 100, 1, '/futtrool/ads/house-loading-hero.svg', 'FutTrool', null),
  ('endgame-banner', 'house', 'FutTrool (casa)', 100, 1, '/futtrool/ads/house-endgame-banner.svg', 'FutTrool', null),
  ('replay-lower-third', 'house', 'FutTrool (casa)', 100, 1, '/futtrool/ads/house-replay-lower-third.svg', 'FutTrool', null),
  ('menu-footer', 'house', 'FutTrool (casa)', 100, 1, '/futtrool/ads/house-menu-footer.svg', 'FutTrool', null),
  ('ball-skin', 'house', 'FutTrool (casa)', 100, 1, '/futtrool/ads/house-ball-skin.svg', 'FutTrool', null),
  ('player-badge', 'house', 'FutTrool (casa)', 100, 1, '/futtrool/ads/house-player-badge.svg', 'FutTrool', null)
) as seed(slot_id, campaign_id, advertiser, priority, weight, asset_url, alt, click_url)
where not exists (select 1 from public.ad_creatives);

-- ---------------------------------------------------------------------------
-- Loja de produtos digitais — pedido explícito: "deixa já criado, mas
-- vazio, pra CRUD e estatística de uso de cada um". Sem sistema de compra
-- ainda (fora do escopo desta entrega), então `views`/`purchases` só
-- existem como contadores prontos pra uso futuro — começam e ficam em 0
-- até existir alguma tela de loja de verdade incrementando isso.
-- ---------------------------------------------------------------------------

create table if not exists public.store_products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  description text,
  price_coins integer not null default 0 check (price_coins >= 0),
  active boolean not null default true,
  views integer not null default 0 check (views >= 0),
  purchases integer not null default 0 check (purchases >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.store_products enable row level security;

create policy "Qualquer um lê os produtos"
  on public.store_products for select
  using (true);

create policy "Só o admin cria produto"
  on public.store_products for insert
  to authenticated
  with check (auth.jwt() ->> 'email' = 'luisnathanpessoal@gmail.com');

create policy "Só o admin edita produto"
  on public.store_products for update
  to authenticated
  using (auth.jwt() ->> 'email' = 'luisnathanpessoal@gmail.com')
  with check (auth.jwt() ->> 'email' = 'luisnathanpessoal@gmail.com');

create policy "Só o admin apaga produto"
  on public.store_products for delete
  to authenticated
  using (auth.jwt() ->> 'email' = 'luisnathanpessoal@gmail.com');
