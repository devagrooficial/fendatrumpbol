// Desenha o campo a partir da câmera. Renderer só lê estado/config e desenha
// — nenhuma lógica de jogo aqui (decisão 5 da seção 13 da spec).

import type { Camera } from './camera';
import type { Ball, Player, Vec2 } from '../core/types';
import { FIELD } from '../core/constants';
import { THEME } from './theme';
import type { TouchLayout } from '../input/joystick';

export function renderField(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  viewportW: number,
  viewportH: number,
): void {
  ctx.fillStyle = THEME.UI_BG;
  ctx.fillRect(0, 0, viewportW, viewportH);

  drawGrassStripes(ctx, camera);
  drawGoalAreas(ctx, camera);
  drawBoundaryAndCenter(ctx, camera);
}

function drawGrassStripes(ctx: CanvasRenderingContext2D, camera: Camera): void {
  const stripeCount = Math.ceil(FIELD.WIDTH / THEME.GRASS_STRIPE_WIDTH);
  for (let i = 0; i < stripeCount; i++) {
    const worldX0 = i * THEME.GRASS_STRIPE_WIDTH;
    const worldX1 = Math.min(worldX0 + THEME.GRASS_STRIPE_WIDTH, FIELD.WIDTH);
    const p0 = camera.worldToScreen(worldX0, 0);
    const p1 = camera.worldToScreen(worldX1, FIELD.HEIGHT);
    ctx.fillStyle = i % 2 === 0 ? THEME.GRASS_A : THEME.GRASS_B;
    ctx.fillRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
  }
}

// Área do gol / rede (spec seção 11): marcação sólida atrás da linha de
// fundo, não pra dentro do campo — é onde fica a rede de verdade, igual
// num campo real e igual às capturas de tela de referência (ver
// docs/NOTES.md, seção 3). Bate com a física da parede (physics.ts:
// resolveWallCollision já trata GOAL_DEPTH como o fundo da rede, *fora*
// do campo — de -GOAL_DEPTH a 0, não de 0 a +GOAL_DEPTH). Corrigido depois
// que o Mateus reparou, comparando com o print, que o M1 tinha desenhado
// isso do lado errado da linha.
function drawGoalAreas(ctx: CanvasRenderingContext2D, camera: Camera): void {
  const openingTop = FIELD.HEIGHT / 2 - FIELD.GOAL_OPENING / 2;
  const openingBottom = FIELD.HEIGHT / 2 + FIELD.GOAL_OPENING / 2;

  ctx.fillStyle = THEME.GOAL_AREA_COLOR;

  // Esquerda: de x=-GOAL_DEPTH até x=0 (atrás da linha de fundo).
  {
    const p0 = camera.worldToScreen(-FIELD.GOAL_DEPTH, openingTop);
    const p1 = camera.worldToScreen(0, openingBottom);
    ctx.fillRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
  }

  // Direita: de x=WIDTH até x=WIDTH+GOAL_DEPTH (atrás da linha de fundo).
  {
    const p0 = camera.worldToScreen(FIELD.WIDTH, openingTop);
    const p1 = camera.worldToScreen(FIELD.WIDTH + FIELD.GOAL_DEPTH, openingBottom);
    ctx.fillRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
  }
}

function drawBoundaryAndCenter(ctx: CanvasRenderingContext2D, camera: Camera): void {
  const openingTop = FIELD.HEIGHT / 2 - FIELD.GOAL_OPENING / 2;
  const openingBottom = FIELD.HEIGHT / 2 + FIELD.GOAL_OPENING / 2;

  ctx.strokeStyle = THEME.LINE_COLOR;
  ctx.lineWidth = camera.worldLengthToScreen(THEME.LINE_WIDTH);
  ctx.lineCap = 'round';

  const tl = camera.worldToScreen(0, 0);
  const tr = camera.worldToScreen(FIELD.WIDTH, 0);
  const bl = camera.worldToScreen(0, FIELD.HEIGHT);
  const br = camera.worldToScreen(FIELD.WIDTH, FIELD.HEIGHT);
  const leftGoalTop = camera.worldToScreen(0, openingTop);
  const leftGoalBottom = camera.worldToScreen(0, openingBottom);
  const rightGoalTop = camera.worldToScreen(FIELD.WIDTH, openingTop);
  const rightGoalBottom = camera.worldToScreen(FIELD.WIDTH, openingBottom);

  // Borda superior.
  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y);
  ctx.lineTo(tr.x, tr.y);
  ctx.stroke();

  // Borda inferior.
  ctx.beginPath();
  ctx.moveTo(bl.x, bl.y);
  ctx.lineTo(br.x, br.y);
  ctx.stroke();

  // Lateral esquerda, com buraco na boca do gol.
  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y);
  ctx.lineTo(leftGoalTop.x, leftGoalTop.y);
  ctx.moveTo(leftGoalBottom.x, leftGoalBottom.y);
  ctx.lineTo(bl.x, bl.y);
  ctx.stroke();

  // Lateral direita, com buraco na boca do gol.
  ctx.beginPath();
  ctx.moveTo(tr.x, tr.y);
  ctx.lineTo(rightGoalTop.x, rightGoalTop.y);
  ctx.moveTo(rightGoalBottom.x, rightGoalBottom.y);
  ctx.lineTo(br.x, br.y);
  ctx.stroke();

  // Linha do meio.
  const midTop = camera.worldToScreen(FIELD.WIDTH / 2, 0);
  const midBottom = camera.worldToScreen(FIELD.WIDTH / 2, FIELD.HEIGHT);
  ctx.beginPath();
  ctx.moveTo(midTop.x, midTop.y);
  ctx.lineTo(midBottom.x, midBottom.y);
  ctx.stroke();

  // Círculo central.
  const center = camera.worldToScreen(FIELD.WIDTH / 2, FIELD.HEIGHT / 2);
  ctx.beginPath();
  ctx.arc(center.x, center.y, camera.worldLengthToScreen(FIELD.CENTER_CIRCLE_RADIUS), 0, Math.PI * 2);
  ctx.stroke();
}

export function renderPlayer(ctx: CanvasRenderingContext2D, camera: Camera, player: Player, color: string): void {
  const p = camera.worldToScreen(player.pos.x, player.pos.y);
  const r = camera.worldLengthToScreen(player.radius);

  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = player.stunTimer > 0 ? 'rgba(255,255,255,0.35)' : color;
  ctx.fill();
  ctx.lineWidth = camera.worldLengthToScreen(THEME.PLAYER_OUTLINE_WIDTH);
  ctx.strokeStyle = THEME.PLAYER_OUTLINE;
  ctx.stroke();

  // Indicador de facing — dobra como mira do chute.
  const facingLen = r * 1.5;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + Math.cos(player.facing) * facingLen, p.y + Math.sin(player.facing) * facingLen);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = Math.max(2, r * 0.15);
  ctx.stroke();

  // Anel de carga do chute.
  if (player.kickCharge > 0) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * player.kickCharge);
    ctx.strokeStyle = THEME.ACCENT_PRIMARY;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

// Nome flutuando acima do jogador (spec seções 7 e 8: kickoff e replay).
export function renderPlayerLabel(ctx: CanvasRenderingContext2D, camera: Camera, player: Player, label: string): void {
  const p = camera.worldToScreen(player.pos.x, player.pos.y);
  const r = camera.worldLengthToScreen(player.radius);
  ctx.textAlign = 'center';
  ctx.font = "700 12px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = 'rgba(253, 246, 255, 0.9)';
  ctx.fillText(label, p.x, p.y - r - 10);
}

export function renderBall(ctx: CanvasRenderingContext2D, camera: Camera, ball: Ball): void {
  const p = camera.worldToScreen(ball.pos.x, ball.pos.y);
  const r = camera.worldLengthToScreen(ball.radius);

  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.strokeStyle = THEME.UI_BG;
  ctx.stroke();
}

// Rastro da bola (spec seção 11): últimas N posições em alpha decrescente,
// a mais antiga primeiro (mais apagada), a mais recente por último.
export function renderBallTrail(ctx: CanvasRenderingContext2D, camera: Camera, trail: readonly Vec2[], radius: number): void {
  const r = camera.worldLengthToScreen(radius);
  trail.forEach((pos, i) => {
    const alpha = ((i + 1) / trail.length) * 0.35;
    const p = camera.worldToScreen(pos.x, pos.y);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fill();
  });
}

export function renderParticles(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  particles: readonly { pos: Vec2; life: number }[],
): void {
  for (const particle of particles) {
    const p = camera.worldToScreen(particle.pos.x, particle.pos.y);
    const alpha = Math.max(0, particle.life / 0.4);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3 + alpha * 2, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(253, 246, 255, ${alpha})`;
    ctx.fill();
  }
}

export function renderGoalFlash(ctx: CanvasRenderingContext2D, viewportW: number, viewportH: number, alpha: number): void {
  if (alpha <= 0) return;
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.6})`;
  ctx.fillRect(0, 0, viewportW, viewportH);
}

// Controles touch (spec seção 6): joystick flutuante + botão PONTAPÉ com
// anel de carga + botão de dash. Desenhados por cima de tudo, em espaço de
// tela (não de mundo) — por isso não usam a câmera.
export function renderTouchControls(
  ctx: CanvasRenderingContext2D,
  layout: TouchLayout,
  joystick: { anchor: Vec2; knob: Vec2 } | null,
  kickCharge: number,
): void {
  const { kickButton, dashButton } = layout;

  ctx.beginPath();
  ctx.arc(kickButton.x, kickButton.y, kickButton.radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(233, 61, 130, 0.28)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(253, 246, 255, 0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  if (kickCharge > 0) {
    ctx.beginPath();
    ctx.arc(kickButton.x, kickButton.y, kickButton.radius + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * kickCharge);
    ctx.strokeStyle = THEME.ACCENT_PRIMARY;
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(253, 246, 255, 0.85)';
  ctx.font = "800 13px 'Segoe UI', system-ui, sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PONTAPÉ', kickButton.x, kickButton.y);

  ctx.beginPath();
  ctx.arc(dashButton.x, dashButton.y, dashButton.radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(74, 222, 128, 0.28)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(253, 246, 255, 0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = "800 10px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = 'rgba(253, 246, 255, 0.85)';
  ctx.fillText('DASH', dashButton.x, dashButton.y);
  ctx.textBaseline = 'alphabetic';

  if (joystick) {
    ctx.beginPath();
    ctx.arc(joystick.anchor.x, joystick.anchor.y, 60, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(253, 246, 255, 0.12)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(joystick.knob.x, joystick.knob.y, 26, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(253, 246, 255, 0.4)';
    ctx.fill();
  }
}
