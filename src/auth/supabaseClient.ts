// Cliente único do Supabase Auth, compartilhado por todas as telas de
// autenticação (login/cadastro/esqueci senha/redefinir senha) e pelo hub
// (que confere a sessão antes de mostrar os jogos). Usa as MESMAS variáveis
// de ambiente que o ranking online (src/core/Ranking.ts) já usava —
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — é o mesmo projeto Supabase,
// só uma funcionalidade nova (Auth) além da tabela de ranking.
//
// Diferente do Ranking.ts (que só usa `fetch` cru contra o PostgREST),
// aqui usamos o SDK oficial (`@supabase/supabase-js`) de propósito: sessão,
// refresh de token e o fluxo de "esqueci senha" (que depende de um link por
// e-mail com hash na URL) são coisas que o SDK já resolve corretamente —
// reimplementar isso à mão manualmente seria arriscado (bugs de segurança
// de sessão são o tipo de coisa que não dá pra economizar esforço).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

export function isSupabaseConfigured(): boolean {
  return supabase !== null;
}
