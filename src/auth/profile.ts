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
