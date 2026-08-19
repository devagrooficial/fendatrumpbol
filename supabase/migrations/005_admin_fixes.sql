-- Rode isso no SQL Editor do Supabase, depois do 004_admin.sql.
--
-- IMPORTANTE (correção de um bug desse próprio arquivo): o SQL Editor do
-- Supabase roda o script inteiro colado como UM lote só — se qualquer
-- statement no meio falhar, TUDO nesse lote é desfeito, inclusive as
-- policies que já tinham sido criadas com sucesso antes da falha. A versão
-- anterior deste arquivo não usava `drop policy if exists` antes de criar
-- as duas policies novas (diferente do padrão já usado em 004_admin.sql
-- pras policies de insert) — se alguém rodasse isso duas vezes, ou se o
-- `alter table` da loja no fim falhasse por qualquer motivo (ex.: já
-- existir uma linha de teste com image_url nulo), o lote inteiro seria
-- revertido e as duas policies de leitura nunca seriam aplicadas de
-- verdade, mesmo sem erro visível. Essa versão é segura de rodar quantas
-- vezes precisar.

-- ---------------------------------------------------------------------------
-- Bug: a tela "Estatísticas" do admin só enxergava os PRÓPRIOS
-- match_stats/replays do admin, não os de todo mundo — 004_admin.sql deu
-- "lê tudo" só pra public.users, esqueceu de estender o mesmo pra essas
-- duas tabelas (RLS combina policies permissivas com OR, então isso só
-- ADICIONA acesso, não tira o que já existia pra usuário comum ler os
-- próprios registros).
-- ---------------------------------------------------------------------------

drop policy if exists "Admin lê todas as estatísticas" on public.match_stats;
create policy "Admin lê todas as estatísticas"
  on public.match_stats for select
  to authenticated
  using (auth.jwt() ->> 'email' = 'luisnathanpessoal@gmail.com');

drop policy if exists "Admin lê todos os replays" on public.replays;
create policy "Admin lê todos os replays"
  on public.replays for select
  to authenticated
  using (auth.jwt() ->> 'email' = 'luisnathanpessoal@gmail.com');

-- ---------------------------------------------------------------------------
-- Loja: imagem do produto virou obrigatória (pedido: "é obrigatório ter
-- uma imagem para vender melhor"). Preenche qualquer linha de teste que já
-- tenha ficado sem imagem (string vazia, não nulo) ANTES de travar a
-- coluna como not null — sem isso, uma única linha de teste sem imagem
-- fazia esse `alter column` falhar e (pelo motivo explicado acima) derrubar
-- as duas policies de cima junto.
-- ---------------------------------------------------------------------------

alter table public.store_products
  add column if not exists image_url text;

update public.store_products set image_url = '' where image_url is null;

alter table public.store_products
  alter column image_url set not null;
