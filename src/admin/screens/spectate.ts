// Tela de espectador do admin (aberta como aba nova, ver
// src/admin/screens/live.ts): conecta no servidor de multiplayer,
// reautentica como admin ('adminAuth') e pede 'spectate' de UMA partida
// específica — a partir daí recebe os mesmos 'state' que os jogadores de
// verdade recebem, e desenha usando os MESMOS renderers do jogo (nenhuma
// lógica de desenho duplicada aqui, só orquestração). Nunca manda
// 'command' nenhum — é só assistir, sem interferir na partida.

import { supabase } from '../../auth/supabaseClient';
import { getWsUrl } from '../../futtrool/net/onlineClient';
import type { AdminPlayerSnapshot, ServerMessage } from '../../futtrool/net/protocol';
import type { GameState, PlayerId } from '../../futtrool/core/types';
import { Camera } from '../../futtrool/render/camera';
import { renderBall, renderField, renderPlayer, renderPlayerLabel } from '../../futtrool/render/renderer';
import { renderMatchHud } from '../../futtrool/ui/hud';
import { THEME } from '../../futtrool/render/theme';
import { adManager } from '../../futtrool/ads/adManager';
import { loadAdsConfig } from '../../futtrool/ads/loadAdsConfig';

// Espectador NÃO conta como impressão de anúncio de verdade (é o admin
// olhando, não um jogador real vendo o anúncio) — por isso usa só
// getCreative()/render*() do adManager (desenho puro), nunca
// trackFieldVisibility/trackDomSlotShown (que é o que gera os eventos de
// impression/viewable). Mesmo adManager (singleton) que o jogo de verdade
// usa — se o admin também tiver o jogo aberto na mesma aba (não é o caso
// aqui, cada aba é seu próprio bundle), não haveria conflito de qualquer
// forma, já que cada import de módulo é isolado por página.
void loadAdsConfig().then((config) => adManager.load(config));

export function mountSpectateScreen(root: HTMLElement, roomId: string): void {
  root.innerHTML = `
    <div style="position:fixed;inset:0;background:${THEME.UI_BG};">
      <canvas data-canvas style="display:block;width:100%;height:100%;"></canvas>
      <a href="/admin.html" style="position:absolute;top:1rem;left:1rem;color:#fdf6ff;text-decoration:none;background:rgba(0,0,0,0.55);padding:0.5rem 1rem;border-radius:999px;font:700 0.8rem 'Segoe UI',system-ui,sans-serif;">&larr; Painel</a>
      <p data-status style="position:absolute;bottom:1rem;left:1rem;right:1rem;color:rgba(253,246,255,0.7);font:600 0.8rem 'Segoe UI',system-ui,sans-serif;margin:0;"></p>
    </div>
  `;

  const canvas = root.querySelector<HTMLCanvasElement>('[data-canvas]')!;
  const statusEl = root.querySelector<HTMLParagraphElement>('[data-status]')!;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    statusEl.textContent = 'Contexto 2D indisponível.';
    return;
  }

  const camera = new Camera();
  let latestState: GameState | null = null;
  let playerNames: Record<string, string> = {};
  // Giro visual da bola (mesma fórmula de render/fx.ts Fx.updateBallSpin:
  // ω = velocidade/raio, "rolamento sem deslizar") — só o suficiente pro
  // ball-skin de anúncio girar junto com o movimento, igual ao jogo de
  // verdade. Pulso de chute (Fx.getBallPulseScale) fica de fora de
  // propósito: depende do evento 'kick' que o espectador não recebe (só
  // 'state'), efeito cosmético pequeno o bastante pra não fazer falta.
  let ballSpin = 0;
  let lastFrameTime = performance.now();
  // true assim que qualquer mensagem "terminal" chega (negado, partida
  // encerrada) — o handler de 'close' só usa a mensagem genérica se NENHUMA
  // dessas já tiver explicado o motivo, senão pisava em cima da mais
  // específica (bug real: recusa de admin virava "conexão encerrada" sem
  // dizer por quê).
  let terminal = false;
  let ws: WebSocket | null = null;

  function resize(): void {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    camera.resize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);
  resize();

  function labelFor(id: PlayerId): string {
    return playerNames[id] ?? `${id} (bot)`;
  }

  function draw(now: number): void {
    requestAnimationFrame(draw);
    const dt = Math.min((now - lastFrameTime) / 1000, 0.25);
    lastFrameTime = now;
    const w = window.innerWidth;
    const h = window.innerHeight;

    if (!latestState) return;
    const players = Object.values(latestState.players);
    const ball = latestState.ball;
    camera.follow(
      ball.pos,
      ball.pos, // espectador não tem "meu jogador" — câmera segue só a bola
      players.map((p) => p.pos),
    );

    renderField(ctx!, camera, w, h);
    // Placas de campo (seção 10.3): sempre atrás de jogador/bola, igual ao
    // jogo de verdade (main.ts render()).
    adManager.renderFieldSlots(ctx!, camera);

    for (const player of players) {
      const fill = { mode: 'solid' as const, colors: [player.teamId === 'teamA' ? THEME.TEAM_1 : THEME.TEAM_2] };
      renderPlayer(ctx!, camera, player, fill);
      adManager.renderPlayerBadge(ctx!, camera, player.pos, player.radius);
      renderPlayerLabel(ctx!, camera, player, labelFor(player.id));
    }

    const speed = Math.hypot(ball.vel.x, ball.vel.y);
    ballSpin = (ballSpin + (speed / ball.radius) * dt) % (Math.PI * 2);
    if (!adManager.renderBallSkin(ctx!, camera, ball.pos, ball.radius, ballSpin)) {
      renderBall(ctx!, camera, ball, ballSpin);
    }

    renderMatchHud(ctx!, w, h, latestState, 'espectador (admin)');
  }
  requestAnimationFrame(draw);

  async function connect(): Promise<void> {
    if (!supabase) {
      statusEl.textContent = 'Supabase não configurado.';
      return;
    }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
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
        terminal = true;
        statusEl.textContent = 'Servidor recusou o acesso.';
        ws?.close();
        return;
      }
      if (message.type === 'adminRooms') {
        // Chega automaticamente depois do 'adminAuth' (mesmo canal usado
        // pela tela "Ao vivo") — pede pra espectar assim que confirma que
        // a autenticação passou.
        ws?.send(JSON.stringify({ type: 'spectate', roomId }));
        return;
      }
      if (message.type === 'spectateStarted') {
        const names: Record<string, string> = {};
        for (const player of message.players as AdminPlayerSnapshot[]) {
          names[player.playerId] = player.email ? `${player.name} (${player.email})` : `${player.name} (convidado)`;
        }
        playerNames = names;
        statusEl.textContent = 'Assistindo ao vivo.';
        return;
      }
      if (message.type === 'state') {
        latestState = message.state;
        return;
      }
      if (message.type === 'spectateEnded') {
        terminal = true;
        latestState = null;
        statusEl.textContent = 'Essa partida terminou (ou já não existe mais).';
      }
    });

    ws.addEventListener('close', () => {
      if (!terminal) statusEl.textContent = 'Conexão com o servidor encerrada.';
    });
  }

  statusEl.textContent = 'Conectando…';
  void connect();
}
