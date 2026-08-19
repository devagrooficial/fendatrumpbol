// Tela "Publicidade" do admin: CRUD de public.ad_creatives — cada linha é
// um anúncio num slot do FutTrool (ver src/futtrool/ads/slots.ts pros 12
// slots possíveis). Muda a hora que o admin salva, sem precisar de
// rebuild/redeploy (ver src/futtrool/ads/loadAdsConfig.ts, que busca essa
// mesma tabela no boot do jogo).

import { supabase } from '../../auth/supabaseClient';
import { AD_SLOT_IDS } from '../../futtrool/ads/slots';

type AdRow = {
  id: string;
  slot_id: string;
  campaign_id: string;
  advertiser: string;
  priority: number;
  weight: number;
  asset_url: string;
  alt: string | null;
  click_url: string | null;
  active: boolean;
};

function emptyDraft(): Omit<AdRow, 'id'> {
  return {
    slot_id: AD_SLOT_IDS[0]!, // lista fixa, sempre tem pelo menos 1 slot
    campaign_id: 'house',
    advertiser: '',
    priority: 100,
    weight: 1,
    asset_url: '',
    alt: '',
    click_url: '',
    active: true,
  };
}

function formHtml(prefix: string, draft: Omit<AdRow, 'id'>): string {
  const slotOptions = AD_SLOT_IDS.map((slot) => `<option value="${slot}" ${slot === draft.slot_id ? 'selected' : ''}>${slot}</option>`).join('');
  return `
    <div class="admin__form-row">
      <div class="admin__field" style="margin:0;">
        <label>Slot</label>
        <select class="admin__select" data-${prefix}-slot>${slotOptions}</select>
      </div>
      <div class="admin__field" style="margin:0;">
        <label>Campanha</label>
        <input type="text" class="admin__input" value="${draft.campaign_id}" data-${prefix}-campaign />
      </div>
      <div class="admin__field" style="margin:0;">
        <label>Anunciante</label>
        <input type="text" class="admin__input" value="${draft.advertiser}" data-${prefix}-advertiser />
      </div>
      <div class="admin__field" style="margin:0;width:5rem;">
        <label>Prioridade</label>
        <input type="number" class="admin__input" value="${draft.priority}" data-${prefix}-priority />
      </div>
      <div class="admin__field" style="margin:0;width:5rem;">
        <label>Peso</label>
        <input type="number" class="admin__input" value="${draft.weight}" data-${prefix}-weight />
      </div>
    </div>
    <div class="admin__form-row">
      <div class="admin__field" style="margin:0;flex:1;min-width:200px;">
        <label>URL da imagem</label>
        <input type="text" class="admin__input" style="width:100%;" value="${draft.asset_url}" data-${prefix}-asset placeholder="/futtrool/ads/algo.svg" />
      </div>
      <div class="admin__field" style="margin:0;flex:1;min-width:150px;">
        <label>Texto alternativo</label>
        <input type="text" class="admin__input" style="width:100%;" value="${draft.alt ?? ''}" data-${prefix}-alt />
      </div>
      <div class="admin__field" style="margin:0;flex:1;min-width:150px;">
        <label>Link ao clicar (opcional)</label>
        <input type="text" class="admin__input" style="width:100%;" value="${draft.click_url ?? ''}" data-${prefix}-click />
      </div>
      <div class="admin__field" style="margin:0;">
        <label><input type="checkbox" data-${prefix}-active ${draft.active ? 'checked' : ''} /> Ativo</label>
      </div>
    </div>
  `;
}

function readForm(el: HTMLElement, prefix: string): Omit<AdRow, 'id'> {
  const slot = el.querySelector<HTMLSelectElement>(`[data-${prefix}-slot]`)!.value;
  const campaign = el.querySelector<HTMLInputElement>(`[data-${prefix}-campaign]`)!.value.trim() || 'house';
  const advertiser = el.querySelector<HTMLInputElement>(`[data-${prefix}-advertiser]`)!.value.trim();
  const priority = Number(el.querySelector<HTMLInputElement>(`[data-${prefix}-priority]`)!.value) || 100;
  const weight = Number(el.querySelector<HTMLInputElement>(`[data-${prefix}-weight]`)!.value) || 1;
  const asset = el.querySelector<HTMLInputElement>(`[data-${prefix}-asset]`)!.value.trim();
  const alt = el.querySelector<HTMLInputElement>(`[data-${prefix}-alt]`)!.value.trim();
  const click = el.querySelector<HTMLInputElement>(`[data-${prefix}-click]`)!.value.trim();
  const active = el.querySelector<HTMLInputElement>(`[data-${prefix}-active]`)!.checked;
  return {
    slot_id: slot,
    campaign_id: campaign,
    advertiser,
    priority,
    weight,
    asset_url: asset,
    alt: alt || null,
    click_url: click || null,
    active,
  };
}

export function mountAdsScreen(el: HTMLElement): () => void {
  let cancelled = false;

  el.innerHTML = `
    <h2 class="admin__section-title">Publicidade</h2>
    <div class="admin__card">
      <p class="admin__section-title" style="font-size:0.85rem;">Novo anúncio</p>
      ${formHtml('new', emptyDraft())}
      <button type="button" class="admin__button" data-create style="margin-top:0.75rem;">Criar</button>
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
    const { data, error } = await supabase.from('ad_creatives').select('*').order('slot_id');
    if (cancelled) return;
    if (error) {
      listEl.innerHTML = `<p class="admin__empty">Erro ao carregar: ${error.message}</p>`;
      return;
    }
    renderList((data ?? []) as AdRow[]);
  }

  function renderList(rows: AdRow[]): void {
    if (rows.length === 0) {
      listEl.innerHTML = '<p class="admin__empty">Nenhum anúncio cadastrado ainda.</p>';
      return;
    }

    listEl.innerHTML = rows
      .map(
        (row) => `
      <div class="admin__card" data-row="${row.id}">
        <div class="admin__form-row" style="align-items:center;margin-bottom:0.5rem;">
          <strong>${row.slot_id}</strong>
          <span class="admin__tag ${row.active ? 'admin__tag--ok' : 'admin__tag--muted'}">${row.active ? 'Ativo' : 'Inativo'}</span>
          <span style="flex:1;"></span>
          <button type="button" class="admin__button admin__button--secondary" data-edit="${row.id}">Editar</button>
          <button type="button" class="admin__button admin__button--danger" data-delete="${row.id}">Apagar</button>
        </div>
        <p style="margin:0;font-size:0.8rem;color:rgba(253,246,255,0.7);">${row.advertiser} · campanha "${row.campaign_id}" · prioridade ${row.priority} · peso ${row.weight}</p>
        <p style="margin:0.2rem 0 0;font-size:0.75rem;color:rgba(253,246,255,0.5);word-break:break-all;">${row.asset_url}</p>
        <div data-edit-form-${row.id}></div>
      </div>
    `,
      )
      .join('');

    rows.forEach((row) => {
      listEl.querySelector<HTMLButtonElement>(`[data-edit="${row.id}"]`)?.addEventListener('click', () => toggleEdit(row));
      listEl.querySelector<HTMLButtonElement>(`[data-delete="${row.id}"]`)?.addEventListener('click', () => void remove(row.id));
    });
  }

  function toggleEdit(row: AdRow): void {
    const container = listEl.querySelector<HTMLDivElement>(`[data-edit-form-${row.id}]`);
    if (!container) return;
    if (container.dataset.open === 'true') {
      container.innerHTML = '';
      container.dataset.open = 'false';
      return;
    }
    const prefix = `edit-${row.id}`;
    container.innerHTML = `
      <div style="margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid rgba(253,246,255,0.1);">
        ${formHtml(prefix, row)}
        <button type="button" class="admin__button" data-save="${row.id}" style="margin-top:0.5rem;">Salvar</button>
        <p class="admin__message" data-save-message="${row.id}"></p>
      </div>
    `;
    container.dataset.open = 'true';
    container.querySelector<HTMLButtonElement>(`[data-save="${row.id}"]`)?.addEventListener('click', () => void save(row.id, prefix, container));
  }

  async function save(id: string, prefix: string, container: HTMLElement): Promise<void> {
    if (!supabase) return;
    const draft = readForm(container, prefix);
    const { error } = await supabase.from('ad_creatives').update({ ...draft, updated_at: new Date().toISOString() }).eq('id', id);
    const messageEl = container.querySelector<HTMLParagraphElement>(`[data-save-message="${id}"]`);
    if (error) {
      if (messageEl) {
        messageEl.textContent = `Falha: ${error.message}`;
        messageEl.className = 'admin__message admin__message--error';
      }
      return;
    }
    await load();
  }

  async function remove(id: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.from('ad_creatives').delete().eq('id', id);
    if (!error) await load();
  }

  el.querySelector<HTMLButtonElement>('[data-create]')?.addEventListener('click', () => void create());

  async function create(): Promise<void> {
    if (!supabase) return;
    const draft = readForm(el, 'new');
    if (!draft.advertiser || !draft.asset_url) {
      createMessage.textContent = 'Anunciante e URL da imagem são obrigatórios.';
      createMessage.className = 'admin__message admin__message--error';
      return;
    }
    const { error } = await supabase.from('ad_creatives').insert(draft);
    if (error) {
      createMessage.textContent = `Falha: ${error.message}`;
      createMessage.className = 'admin__message admin__message--error';
      return;
    }
    createMessage.textContent = 'Criado!';
    createMessage.className = 'admin__message admin__message--success';
    await load();
  }

  void load();

  return () => {
    cancelled = true;
  };
}
