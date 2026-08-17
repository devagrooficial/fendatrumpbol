// Protege uma página exigindo sessão ativa — chamada no topo do bootstrap
// de qualquer tela que só deve aparecer pra quem já tem conta (hoje: só o
// hub — "tela principal" do pedido). Sem sessão, redireciona pro login.
//
// Decisão: se o Supabase não estiver configurado (.env ausente), trata
// como "sem sessão" e redireciona também, em vez de deixar passar direto.
// É uma trava de segurança: se alguém esquecer de configurar a variável de
// ambiente no deploy, o hub fica inacessível (quebrado) em vez de
// silenciosamente destravado pra qualquer um — falhar fechado é mais
// seguro que falhar aberto aqui.
import { supabase } from './supabaseClient';

export async function requireSession(redirectTo = '/login.html'): Promise<boolean> {
  if (!supabase) {
    window.location.href = redirectTo;
    return false;
  }

  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    window.location.href = redirectTo;
    return false;
  }
  return true;
}

export async function signOut(redirectTo = '/login.html'): Promise<void> {
  await supabase?.auth.signOut();
  window.location.href = redirectTo;
}
