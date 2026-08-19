// Email do único admin do painel (admin.html) — hardcoded de propósito
// (mais simples e mais seguro que uma tabela de "roles" pra uma pessoa
// só). Precisa bater EXATAMENTE com o valor usado nas políticas de RLS
// (supabase/migrations/004_admin.sql) e no cliente
// (src/admin/adminConfig.ts) — os três lugares checam a mesma coisa de
// formas diferentes (RLS no banco, este arquivo no servidor de
// multiplayer, o outro na tela do navegador), então divergir entre eles
// abriria um buraco de segurança num dos três.
export const ADMIN_EMAIL = 'luisnathanpessoal@gmail.com';
