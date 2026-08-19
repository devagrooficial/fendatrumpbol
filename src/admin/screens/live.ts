// Tela "Ao vivo" do admin: conecta no MESMO servidor de multiplayer do
// FutTrool (server/, ver getWsUrl) por um canal separado — manda
// 'adminAuth' com o access_token da sessão, e SÓ o servidor decide se
// esse email é realmente o admin (nunca confiado do lado do cliente,
// mesmo aqui). Servidor manda 'adminRooms' a cada ~2s com nome+email de
// quem está jogando em cada sala/fila ativa.

import { supabase } from '../../auth/supabaseClient';
import { getWsUrl } from '../../futtrool/net/onlineClient';
import type { AdminPlayerSnapshot, AdminRoomSnapshot, ServerMessage } from '../../futtrool/net/protocol';

function playerLine(player: AdminPlayerSnapshot): string {
  return `${player.name} ${player.email ? `(${player.email})` : '(convidado, sem login)'}`;
}

function renderRoom(room: AdminRoomSnapshot): string {
  const teamA = room.players.filter((p) => p.playerId.startsWith('teamA'));
  const teamB = room.players.filter((p) => p.playerId.startsWith('teamB'));
  const statusTag =
    room.status === 'playing'
      ? '<span class="admin__tag admin__tag--ok">Em partida</span>'
      : '<span class="admin__tag admin__tag--muted">Esperando</span>';

  const teamList = (players: AdminPlayerSnapshot[]): string =>
    players.length > 0
      ? `<ul style="margin:0.25rem 0 0;padding-left:1.1rem;">${players.map((p) => `<li>${playerLine(p)}</li>`).join('')}</ul>`
      : '<p style="margin:0.25rem 0 0;opacity:0.5;font-size:0.8rem;">vazio (bot)</p>';

  return `
    <div class="admin__card">
      <div class="admin__form-row" style="align-items:center;">
        ${statusTag}
        <span>${room.teamSize}v${room.teamSize}</span>
        ${room.code ? `<span style="font-size:0.75rem;color:rgba(253,246,255,0.5);">sala ${room.code}</span>` : ''}
      </div>
      <div class="admin__form-row" style="margin-top:0.5rem;align-items:flex-start;">
        <div style="flex:1;min-width:180px;"><strong>Time A</strong>${teamList(teamA)}</div>
        <div style="flex:1;min-width:180px;"><strong>Time B</strong>${teamList(teamB)}</div>
      </div>
    </div>
  `;
}

export function mountLiveScreen(el: HTMLElement): () => void {
  let cancelled = false;
  let ws: WebSocket | null = null;

  el.innerHTML = `
    <h2 class="admin__section-title">Ao vivo</h2>
    <p class="admin__message" data-status>Conectando…</p>
    <div data-rooms></div>
  `;
  const statusEl = el.querySelector<HTMLParagraphElement>('[data-status]')!;
  const roomsEl = el.querySelector<HTMLDivElement>('[data-rooms]')!;

  function renderRooms(rooms: AdminRoomSnapshot[]): void {
    roomsEl.innerHTML = rooms.length > 0 ? rooms.map(renderRoom).join('') : '<p class="admin__empty">Nenhuma sala ativa agora.</p>';
  }

  async function connect(): Promise<void> {
    if (!supabase) {
      statusEl.textContent = 'Supabase não configurado.';
      return;
    }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (cancelled) return;
    if (!token) {
      statusEl.textContent = 'Sessão inválida — recarregue a página.';
      return;
    }

    ws = new WebSocket(getWsUrl());

    ws.addEventListener('open', () => {
      ws?.send(JSON.stringify({ type: 'adminAuth', token }));
    });

    ws.addEventListener('message', (ev) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      if (message.type === 'adminDenied') {
        statusEl.textContent = 'Servidor recusou o acesso a esse canal.';
        ws?.close();
        return;
      }
      if (message.type === 'adminRooms') {
        const now = new Date().toLocaleTimeString('pt-BR');
        statusEl.textContent = `${message.rooms.length} sala(s)/fila(s) ativa(s) — atualizado às ${now}`;
        renderRooms(message.rooms);
      }
    });

    ws.addEventListener('close', () => {
      if (!cancelled) statusEl.textContent = 'Conexão com o servidor encerrada.';
    });
  }

  void connect();

  return () => {
    cancelled = true;
    ws?.close();
  };
}
