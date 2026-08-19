// Trava de acesso do painel de admin (admin.html) — client-side é só
// CONVENIÊNCIA de UI (evita renderizar a tela pra quem obviamente não devia
// ver); a segurança de verdade mora nas políticas de RLS
// (supabase/migrations/004_admin.sql) e na verificação do servidor de
// multiplayer (server/src/index.ts) — as duas reconferem o email de quem
// está autenticado de verdade, então mesmo alguém forçando essa checagem
// aqui a passar pelo console do navegador não ganha acesso real a nada:
// toda consulta/escrita nas tabelas de admin continua bloqueada pelo
// Postgres pra qualquer sessão cujo JWT não seja desse email.
//
// IMPORTANTE: precisa bater com o email hardcoded nas políticas de RLS e
// em server/src/adminConfig.ts — os três lugares checam a mesma coisa de
// formas diferentes, divergir entre eles abriria um buraco num dos três.
import { supabase } from '../auth/supabaseClient';
import { requireSession } from '../auth/session';

export const ADMIN_EMAIL = 'luisnathanpessoal@gmail.com';

function showDenied(): void {
  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0b0e;color:#fdf6ff;font:600 16px/1.5 system-ui,sans-serif;text-align:center;padding:2rem;">
      <div>
        <p style="font-size:1.4rem;margin-bottom:0.5rem;">Acesso negado</p>
        <p style="opacity:0.7;">Essa conta não tem permissão pra ver esse painel.</p>
        <p style="margin-top:1.5rem;"><a href="/" style="color:#e93d82;">&larr; Voltar pros jogos</a></p>
      </div>
    </div>
  `;
}

// Devolve o email de quem está logado se (e só se) for o admin — `null`
// em qualquer outro caso, já tendo cuidado do redirecionamento/mensagem
// certa (sem sessão -> manda pro login; logado mas não é o admin -> mostra
// "acesso negado" sem nem tentar montar o resto da tela).
export async function requireAdmin(): Promise<{ email: string } | null> {
  const hasSession = await requireSession('/login.html');
  if (!hasSession || !supabase) return null;

  const { data } = await supabase.auth.getSession();
  const email = data.session?.user.email;
  if (email !== ADMIN_EMAIL) {
    showDenied();
    return null;
  }
  return { email };
}
