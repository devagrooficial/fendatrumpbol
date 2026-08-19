// Tela "Loja" do admin: CRUD de public.store_products — pedido explícito:
// "deixa já criado, mas vazio, pra CRUD e estatística de uso de cada um".
// Não existe loja de verdade pro jogador ainda (fora do escopo desta
// entrega) — `views`/`purchases` ficam prontos pra uso futuro e mostram 0
// até existir alguma tela incrementando isso de verdade.

import { supabase } from '../../auth/supabaseClient';

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  price_coins: number;
  active: boolean;
  views: number;
  purchases: number;
};

export function mountStoreScreen(el: HTMLElement): () => void {
  let cancelled = false;

  el.innerHTML = `
    <h2 class="admin__section-title">Loja (produtos digitais)</h2>
    <p class="admin__message" style="color:rgba(253,246,255,0.5);">Ainda não existe loja de verdade pro jogador — isso aqui só gerencia o catálogo por enquanto. "Visualizações"/"Compras" ficam em 0 até essa parte ser construída.</p>
    <div class="admin__card">
      <p class="admin__section-title" style="font-size:0.85rem;">Novo produto</p>
      <div class="admin__form-row">
        <div class="admin__field" style="margin:0;flex:1;min-width:150px;">
          <label>Nome</label>
          <input type="text" class="admin__input" style="width:100%;" data-new-name />
        </div>
        <div class="admin__field" style="margin:0;width:6rem;">
          <label>Preço ($)</label>
          <input type="number" class="admin__input" data-new-price value="0" />
        </div>
        <div class="admin__field" style="margin:0;">
          <label><input type="checkbox" data-new-active checked /> Ativo</label>
        </div>
      </div>
      <div class="admin__field">
        <label>Descrição</label>
        <textarea class="admin__textarea" rows="2" data-new-description></textarea>
      </div>
      <button type="button" class="admin__button" data-create>Criar</button>
      <p class="admin__message" data-create-message></p>
    </div>
    <div data-list><p class="admin__empty">Carregando…</p></div>
  `;

  const listEl = el.querySelector<HTMLDivElement>('[data-list]')!;
  const createMessage = el.querySelector<HTMLParagraphElement>('[data-create-message]')!;

  async function load(): Promise<void> {
    if (!supabase) {
      listEl.innerHTML = '<p class="admin__empty">Supabase não configurado.</p>';
      return;
    }
    const { data, error } = await supabase.from('store_products').select('*').order('created_at', { ascending: false });
    if (cancelled) return;
    if (error) {
      listEl.innerHTML = `<p class="admin__empty">Erro ao carregar: ${error.message}</p>`;
      return;
    }
    renderList((data ?? []) as ProductRow[]);
  }

  function renderList(rows: ProductRow[]): void {
    if (rows.length === 0) {
      listEl.innerHTML = '<p class="admin__empty">Nenhum produto cadastrado ainda.</p>';
      return;
    }

    listEl.innerHTML = `
      <div class="admin__table-wrap">
        <table class="admin__table">
          <thead><tr><th>Nome</th><th>Preço</th><th>Status</th><th>Visualizações</th><th>Compras</th><th></th></tr></thead>
          <tbody>
            ${rows
              .map(
                (row) => `
              <tr>
                <td>${row.name}</td>
                <td>$ ${row.price_coins}</td>
                <td><span class="admin__tag ${row.active ? 'admin__tag--ok' : 'admin__tag--muted'}">${row.active ? 'Ativo' : 'Inativo'}</span></td>
                <td>${row.views}</td>
                <td>${row.purchases}</td>
                <td>
                  <button type="button" class="admin__button admin__button--secondary" data-toggle="${row.id}">${row.active ? 'Desativar' : 'Ativar'}</button>
                  <button type="button" class="admin__button admin__button--danger" data-delete="${row.id}">Apagar</button>
                </td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;

    rows.forEach((row) => {
      listEl.querySelector<HTMLButtonElement>(`[data-toggle="${row.id}"]`)?.addEventListener('click', () => void toggleActive(row));
      listEl.querySelector<HTMLButtonElement>(`[data-delete="${row.id}"]`)?.addEventListener('click', () => void remove(row.id));
    });
  }

  async function toggleActive(row: ProductRow): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase
      .from('store_products')
      .update({ active: !row.active, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (!error) await load();
  }

  async function remove(id: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.from('store_products').delete().eq('id', id);
    if (!error) await load();
  }

  el.querySelector<HTMLButtonElement>('[data-create]')?.addEventListener('click', () => void create());

  async function create(): Promise<void> {
    if (!supabase) return;
    const name = el.querySelector<HTMLInputElement>('[data-new-name]')!.value.trim();
    const price = Number(el.querySelector<HTMLInputElement>('[data-new-price]')!.value) || 0;
    const active = el.querySelector<HTMLInputElement>('[data-new-active]')!.checked;
    const description = el.querySelector<HTMLTextAreaElement>('[data-new-description]')!.value.trim();

    if (!name) {
      createMessage.textContent = 'Nome é obrigatório.';
      createMessage.className = 'admin__message admin__message--error';
      return;
    }

    const { error } = await supabase.from('store_products').insert({
      name,
      description: description || null,
      price_coins: price,
      active,
    });

    if (error) {
      createMessage.textContent = `Falha: ${error.message}`;
      createMessage.className = 'admin__message admin__message--error';
      return;
    }

    createMessage.textContent = 'Criado!';
    createMessage.className = 'admin__message admin__message--success';
    el.querySelector<HTMLInputElement>('[data-new-name]')!.value = '';
    el.querySelector<HTMLTextAreaElement>('[data-new-description]')!.value = '';
    await load();
  }

  void load();

  return () => {
    cancelled = true;
  };
}
