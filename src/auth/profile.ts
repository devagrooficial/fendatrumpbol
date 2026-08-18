// Grava o perfil (email/nome) na tabela public.users depois do cadastro —
// além do que o Supabase Auth já guarda em auth.users (que o cliente não
// consegue ler diretamente, é tabela interna). `user_id` precisa da coluna
// nova (uuid, referencia auth.users) e das políticas de RLS descritas em
// supabase/schema.sql — sem isso, o insert cai numa tabela sem política
// nenhuma e o Supabase recusa (RLS ligado sem policy = tudo bloqueado).

import { supabase } from './supabaseClient';

export async function upsertProfile(userId: string, email: string, nome: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase não configurado' };

  const { error } = await supabase.from('users').upsert({ user_id: userId, email, nome }, { onConflict: 'user_id' });

  return { error: error?.message ?? null };
}

// Apelido: nome curto escolhido só pra aparecer DENTRO do jogo (acima do
// jogador, na tela de fim de partida) — separado do `nome` do cadastro,
// que pode ser bem mais longo. Limite de 12 caracteres batendo com a
// coluna `apelido varchar(12)` (supabase/schema.sql) — o Postgres já
// recusa qualquer coisa maior que isso, o corte aqui é só pra dar
// feedback melhor na hora, sem esperar o erro do servidor.
export const APELIDO_MAX_LENGTH = 12;

export async function getApelido(userId: string): Promise<string | null> {
  if (!supabase) return null;

  const { data, error } = await supabase.from('users').select('apelido').eq('user_id', userId).maybeSingle();
  if (error || !data) return null;

  const apelido = data.apelido;
  return typeof apelido === 'string' && apelido.trim() ? apelido.trim() : null;
}

export async function setApelido(userId: string, apelido: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase não configurado' };

  const trimmed = apelido.trim().slice(0, APELIDO_MAX_LENGTH);
  if (!trimmed) return { error: 'Nome vazio' };

  const { error } = await supabase.from('users').upsert({ user_id: userId, apelido: trimmed }, { onConflict: 'user_id' });
  return { error: error?.message ?? null };
}
