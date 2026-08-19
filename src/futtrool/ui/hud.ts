// HUD durante a partida (spec seção 7): placar com pips de gol, cronômetro,
// indicador de ping/região (placeholder — real só na entrega 2), banner de
// gol/prorrogação/kickoff. Só lê estado e desenha — nenhuma lógica de jogo
// aqui (mesma regra do renderer, seção 13 decisão 5).

import type { GameState } from '../core/types';
import { MATCH } from '../core/constants';
import { THEME } from '../render/theme';
import { t } from '../i18n';

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function drawPips(ctx: CanvasRenderingContext2D, centerX: number, y: number, score: number, color: string, direction: 1 | -1): void {
  const radius = 4;
  const gap = 12;
  for (let i = 0; i < MATCH.GOALS_TO_WIN; i++) {
    const x = centerX + direction * (10 + i * gap);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    if (i < score) {
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
}

export function renderMatchHud(
  ctx: CanvasRenderingContext2D,
  viewportW: number,
  _viewportH: number,
  state: GameState,
  aiFsmLabel: string,
): void {
  const centerX = viewportW / 2;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  ctx.font = "800 26px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = THEME.TEAM_1;
  ctx.textAlign = 'right';
  ctx.fillText(String(state.score.teamA), centerX - 6, 34);
  ctx.fillStyle = 'rgba(253, 246, 255, 0.5)';
  ctx.textAlign = 'center';
  ctx.fillText('-', centerX, 34);
  ctx.fillStyle = THEME.TEAM_2;
  ctx.textAlign = 'left';
  ctx.fillText(String(state.score.teamB), centerX + 6, 34);

  drawPips(ctx, centerX - 4, 48, state.score.teamA, THEME.TEAM_1, -1);
  drawPips(ctx, centerX + 4, 48, state.score.teamB, THEME.TEAM_2, 1);

  // Reta final (últimos MATCH.FINAL_COUNTDOWN_MS, 20s): relógio muda pra
  // cor de alerta o tempo todo, mais um banner curto (3s reais) bem na
  // hora que cruza o limiar — o SOM desse instante já dispara junto (ver
  // core/simulation.ts: evento 'finalCountdown'), aqui é só o visual, sem
  // precisar de timer próprio porque timeLeftMs já conta em tempo real.
  const isFinalCountdown = state.phase === 'playing' && state.timeLeftMs <= MATCH.FINAL_COUNTDOWN_MS;

  ctx.font = "600 14px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = isFinalCountdown ? THEME.ACCENT_PRIMARY : 'rgba(253, 246, 255, 0.75)';
  ctx.textAlign = 'center';
  ctx.fillText(formatClock(state.timeLeftMs), centerX, 70);

  if (state.overtime && state.phase === 'playing') {
    ctx.font = "700 12px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = THEME.ACCENT_PRIMARY;
    ctx.fillText(t('hud.overtime'), centerX, 88);
  }

  if (isFinalCountdown && state.timeLeftMs > MATCH.FINAL_COUNTDOWN_MS - 3000) {
    ctx.font = "800 20px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = THEME.ACCENT_PRIMARY;
    ctx.textAlign = 'center';
    ctx.fillText(t('hud.finalCountdown'), centerX, 100);
  }

  // Ping/região — placeholder estático (seção 7: "real na entrega 2").
  ctx.font = "600 11px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = 'rgba(253, 246, 255, 0.35)';
  ctx.textAlign = 'right';
  ctx.fillText(t('hud.ping'), viewportW - 14, 22);

  ctx.font = "600 11px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = 'rgba(75, 155, 240, 0.7)';
  ctx.fillText(aiFsmLabel, viewportW - 14, 38);

  if (state.phase === 'kickoff') {
    ctx.font = "700 15px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = 'rgba(253, 246, 255, 0.85)';
    ctx.textAlign = 'center';
    ctx.fillText(t('hud.kickoffIn', { seconds: (state.phaseTimer / 1000).toFixed(1) }), centerX, 100);
  }

  if (state.phase === 'goal') {
    ctx.font = "800 22px 'Segoe UI', system-ui, sans-serif";
    ctx.fillStyle = '#fdf6ff';
    ctx.textAlign = 'center';
    ctx.fillText(t('hud.goal'), centerX, 100);
  }

  // scoreboard-sponsor (seção 10.1) removido de propósito — mesmo depois
  // de resolver a sobreposição com o gramado (margem em fieldTopY), o
  // Mateus reportou de novo que a faixa "Apresentado por..." não deveria
  // aparecer no meio da partida de jeito nenhum. Fica só como possibilidade
  // futura (o slot 'scoreboard-sponsor' continua existindo em ads/slots.ts,
  // só não é mais desenhado aqui).
}
