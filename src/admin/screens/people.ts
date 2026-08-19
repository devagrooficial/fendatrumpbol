// Tela "Pessoas" do admin: lista quem já se cadastrou (public.users — a
// política de RLS "Admin lê todos os perfis", ver
// supabase/migrations/004_admin.sql, é o que permite essa consulta trazer
// TODAS as linhas em vez de só a própria) e deixa banir/desbanir por
// email (public.admin_bans). Banir não impede login (isso precisaria de
// service_role key, fora do escopo — ver conversa) — impede jogar
// multiplayer (server/src/index.ts recusa a conexão) e salvar
// replays/estatísticas (RLS bloqueia o insert).

import { supabase } from '../../auth/supabaseClient';

type UserRow = { user_id: string; email: string | null; nome: string | null; apelido: string | null; created_at: string };
type BanRow = { email: string; reason: string | null; banned_at: string };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function mountPeopleScreen(el: HTMLElement): () => void {
  let cancelled = false;

  el.innerHTML = `
    <h2 class="admin__section-title">Pessoas</h2>
    <div class="admin__card">
      <p class="admin__field-label" style="margin:0 0 0.5rem;font-size:0.8rem;color:rgba(253,246,255,0.6);">Banir por email</p>
      <div class="admin__form-row">
        <div class="admin__field" style="margin:0;">
          <input type="email" class="admin__input" placeholder="email@exemplo.com" data-ban-email />
        </div>
        <div class="admin__field" style="margin:0;">
          <input type="text" class="admin__input" placeholder="Motivo (opcional)" data-ban-reason />
        </div>
        <button type="button" class="admin__button admin__button--danger" data-ban-submit>Banir</button>
      </div>
      <p class="admin__message" data-ban-message></p>
    </div>
    <div class="admin__table-wrap" data-table-wrap>
      <p class="admin__empty">Carregando…</p>
    </div>
  `;

  const banEmailInput = el.querySelector<HTMLInputElement>('[data-ban-email]')!;
  const banReasonInput = el.querySelector<HTMLInputElement>('[data-ban-reason]')!;
  const banSubmitButton = el.querySelector<HTMLButtonElement>('[data-ban-submit]')!;
  const banMessageEl = el.querySelector<HTMLParagraphElement>('[data-ban-message]')!;
  const tableWrap = el.querySelector<HTMLDivElement>('[data-table-wrap]')!;

  function setBanMessage(text: string, kind: 'error' | 'success' | '' = ''): void {
    banMessageEl.textContent = text;
    banMessageEl.className = `admin__message${kind ? ` admin__message--${kind}` : ''}`;
  }

  async function banEmail(email: string, reason: string): Promise<void> {
    if (!supabase) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const bannedBy = sessionData.session?.user.email ?? null;
    const { error } = await supabase.from('admin_bans').upsert({ email, reason: reason || null, banned_by: bannedBy });
    if (error) {
      setBanMessage(`Falha ao banir: ${error.message}`, 'error');
      return;
    }
    setBanMessage(`${email} banido.`, 'success');
    await load();
  }

  async function unbanEmail(email: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.from('admin_bans').delete().eq('email', email);
    if (error) {
      setBanMessage(`Falha ao desbanir: ${error.message}`, 'error');
      return;
    }
    await load();
  }

  banSubmitButton.addEventListener('click', () => {
    const email = banEmailInput.value.trim().toLowerCase();
    if (!email) {
      setBanMessage('Digita um email primeiro.', 'error');
      return;
    }
    void banEmail(email, banReasonInput.value.trim());
    banEmailInput.value = '';
    banReasonInput.value = '';
  });

  function renderTable(users: UserRow[], bans: Map<string, BanRow>): void {
    if (users.length === 0) {
      tableWrap.innerHTML = '<p class="admin__empty">Ninguém cadastrado ainda.</p>';
      return;
    }

    const rows = users
      .map((user) => {
        const email = user.email ?? '';
        const ban = email ? bans.get(email.toLowerCase()) : undefined;
        const statusTag = ban
          ? `<span class="admin__tag admin__tag--danger" title="${ban.reason ?? ''}">Banido</span>`
          : '<span class="admin__tag admin__tag--ok">Ok</span>';
        const actionButton = ban
          ? `<button type="button" class="admin__button admin__button--secondary" data-unban="${email}">Desbanir</button>`
          : `<button type="button" class="admin__button admin__button--danger" data-ban="${email}">Banir</button>`;
        return `
          <tr>
            <td>${email || '—'}</td>
            <td>${user.nome ?? '—'}</td>
            <td>${user.apelido ?? '—'}</td>
            <td>${formatDate(user.created_at)}</td>
            <td>${statusTag}</td>
            <td>${email ? actionButton : ''}</td>
          </tr>
        `;
      })
      .join('');

    tableWrap.innerHTML = `
      <table class="admin__table">
        <thead>
          <tr><th>Email</th><th>Nome</th><th>Apelido</th><th>Cadastro</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    tableWrap.querySelectorAll<HTMLButtonElement>('[data-ban]').forEach((button) => {
      button.addEventListener('click', () => void banEmail(button.dataset.ban!, ''));
    });
    tableWrap.querySelectorAll<HTMLButtonElement>('[data-unban]').forEach((button) => {
      button.addEventListener('click', () => void unbanEmail(button.dataset.unban!));
    });
  }

  async function load(): Promise<void> {
    if (!supabase) {
      tableWrap.innerHTML = '<p class="admin__empty">Supabase não configurado.</p>';
      return;
    }

    const [usersRes, bansRes] = await Promise.all([
      supabase.from('users').select('user_id, email, nome, apelido, created_at').order('created_at', { ascending: false }),
      supabase.from('admin_bans').select('email, reason, banned_at'),
    ]);

    if (cancelled) return;

    if (usersRes.error) {
      tableWrap.innerHTML = `<p class="admin__empty">Erro ao carregar: ${usersRes.error.message}</p>`;
      return;
    }

    const bans = new Map<string, BanRow>();
    for (const row of (bansRes.data ?? []) as BanRow[]) bans.set(row.email.toLowerCase(), row);

    renderTable((usersRes.data ?? []) as UserRow[], bans);
  }

  void load();

  return () => {
    cancelled = true;
  };
}
