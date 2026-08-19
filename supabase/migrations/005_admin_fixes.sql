-- Rode isso no SQL Editor do Supabase, depois do 004_admin.sql.

-- ---------------------------------------------------------------------------
-- Bug: a tela "Estatísticas" do admin só enxergava os PRÓPRIOS
-- match_stats/replays do admin, não os de todo mundo — 004_admin.sql deu
-- "lê tudo" só pra public.users, esqueceu de estender o mesmo pra essas
-- duas tabelas (RLS combina policies permissivas com OR, então isso só
-- ADICIONA acesso, não tira o que já existia pra usuário comum ler os
-- próprios registros).
-- ---------------------------------------------------------------------------

create policy "Admin lê todas as estatísticas"
  on public.match_stats for select
  to authenticated
  using (auth.jwt() ->> 'email' = 'luisnathanpessoal@gmail.com');

create policy "Admin lê todos os replays"
  on public.replays for select
  to authenticated
  using (auth.jwt() ->> 'email' = 'luisnathanpessoal@gmail.com');

-- ---------------------------------------------------------------------------
-- Loja: imagem do produto virou obrigatória (pedido: "é obrigatório ter
-- uma imagem para vender melhor"). Tabela está vazia (confirmado no
-- painel antes desse pedido), então dá pra ir direto com not null.
-- ---------------------------------------------------------------------------

alter table public.store_products
  add column if not exists image_url text;

alter table public.store_products
  alter column image_url set not null;
