-- Rode isso no SQL Editor do Supabase se você já criou a tabela `leaderboard`
-- a partir do schema.sql original (antes da gema entrar no jogo). Sem essa
-- coluna, o envio de score com `gems` no corpo falha.

alter table public.leaderboard
  add column if not exists gems integer not null default 0 check (gems >= 0);
