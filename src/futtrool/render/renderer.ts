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
  ctx.fillStyle = THEME.FIELD_BG;
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

const NET_MESH_SPACING = 13; // unidades de mundo entre fios da rede

// Rede do gol desenhada como malha quadriculada branca (fios finos, fundo
// escuro por trás) — igual a uma rede de gol de verdade, em vez do
// preenchimento sólido laranja de antes.
function drawNetMesh(ctx: CanvasRenderingContext2D, camera: Camera, x0: number, y0: number, x1: number, y1: number): void {
  const a = camera.worldToScreen(x0, y0);
  const b = camera.worldToScreen(x1, y1);
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const bottom = Math.max(a.y, b.y);

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, right - left, bottom - top);
  ctx.clip();

  ctx.fillStyle = THEME.FIELD_BG;
  ctx.fillRect(left, top, right - left, bottom - top);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 1;
  const spacing = Math.max(2, camera.worldLengthToScreen(NET_MESH_SPACING));

  for (let x = left; x <= right; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
  }
  for (let y = top; y <= bottom; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }

  ctx.restore();
}

// Área do gol / rede (spec seção 11): marcação atrás da linha de fundo,
// não pra dentro do campo — é onde fica a rede de verdade, igual num
// campo real e igual às capturas de tela de referência (ver
// docs/NOTES.md, seção 3). Bate com a física da parede (physics.ts:
// resolveWallCollision já trata GOAL_DEPTH como o fundo da rede, *fora*
// do campo — de -GOAL_DEPTH a 0, não de 0 a +GOAL_DEPTH). Corrigido depois
// que o Mateus reparou, comparando com o print, que o M1 tinha desenhado
// isso do lado errado da linha.
function drawGoalAreas(ctx: CanvasRenderingContext2D, camera: Camera): void {
  const openingTop = FIELD.HEIGHT / 2 - FIELD.GOAL_OPENING / 2;
  const openingBottom = FIELD.HEIGHT / 2 + FIELD.GOAL_OPENING / 2;

  // Esquerda: de x=-GOAL_DEPTH até x=0 (atrás da linha de fundo).
  drawNetMesh(ctx, camera, -FIELD.GOAL_DEPTH, openingTop, 0, openingBottom);

  // Direita: de x=WIDTH até x=WIDTH+GOAL_DEPTH (atrás da linha de fundo).
  drawNetMesh(ctx, camera, FIELD.WIDTH, openingTop, FIELD.WIDTH + FIELD.GOAL_DEPTH, openingBottom);
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

// Seta de direção (facing): só a parte que fica FORA do círculo do
// jogador — nada de haste cortando por cima do preenchimento colorido.
// Começa exatamente na borda do círculo (não no centro) e vai só pra
// fora: haste curta + ponta triangular.
function renderFacingArrow(ctx: CanvasRenderingContext2D, p: { x: number; y: number }, r: number, facing: number): void {
  const dirX = Math.cos(facing);
  const dirY = Math.sin(facing);
  const shaftLen = r * 0.4;
  const headLen = r * 0.6;
  const headHalfWidth = r * 0.32;

  const edgeX = p.x + dirX * r;
  const edgeY = p.y + dirY * r;
  const shaftEndX = p.x + dirX * (r + shaftLen);
  const shaftEndY = p.y + dirY * (r + shaftLen);
  const tipX = p.x + dirX * (r + shaftLen + headLen);
  const tipY = p.y + dirY * (r + shaftLen + headLen);
  const perpX = -dirY;
  const perpY = dirX;

  ctx.beginPath();
  ctx.moveTo(edgeX, edgeY);
  ctx.lineTo(shaftEndX, shaftEndY);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.lineWidth = Math.max(2, r * 0.14);
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(shaftEndX + perpX * headHalfWidth, shaftEndY + perpY * headHalfWidth);
  ctx.lineTo(shaftEndX - perpX * headHalfWidth, shaftEndY - perpY * headHalfWidth);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fill();
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

  renderFacingArrow(ctx, p, r, player.facing);

  // Anel de carga do chute.
  if (player.kickCharge > 0) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * player.kickCharge);
    ctx.strokeStyle = THEME.ACCENT_PRIMARY;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Anel de combustível do turbo — só aparece enquanto não está cheio
  // (em uso ou recarregando), pra não poluir a tela o tempo todo.
  if (player.boostStamina < 0.999) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * player.boostStamina);
    ctx.strokeStyle = THEME.ACCENT_BOOST;
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

// spin em radianos (Fx.getBallSpin()) — 3 "gomos" espalhados a 120° um do
// outro, igual a um desenho simplificado de bola de futebol, girando
// junto com o deslocamento (ver Fx.updateBallSpin: ω = velocidade/raio,
// rolamento sem deslizar). Só estilização, não tem física real por trás.
export function renderBall(ctx: CanvasRenderingContext2D, camera: Camera, ball: Ball, spin = 0): void {
  const p = camera.worldToScreen(ball.pos.x, ball.pos.y);
  const r = camera.worldLengthToScreen(ball.radius);

  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.strokeStyle = THEME.UI_BG;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(11, 11, 14, 0.55)';
  for (let i = 0; i < 3; i++) {
    const angle = spin + (i * Math.PI * 2) / 3;
    const cx = p.x + Math.cos(angle) * r * 0.55;
    const cy = p.y + Math.sin(angle) * r * 0.55;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.34, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Rastro da bola (spec seção 11): últimas N posições, desenhadas com
// gradiente radial (em vez de um disco de cor sólida) pra parecer um
// borrão de movimento suave em vez de bolinhas com contorno duro. A
// intensidade também escala com a velocidade atual (speedFactor) — bola
// parada ou quase parada não mostra rastro nenhum, só quando anda rápido
// o bastante pra "borrão" fazer sentido.
export function renderBallTrail(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  trail: readonly Vec2[],
  radius: number,
  speed: number,
): void {
  const BLUR_FULL_SPEED = 220; // u/s — velocidade a partir da qual o borrão já está no máximo
  const speedFactor = Math.min(1, speed / BLUR_FULL_SPEED);
  if (speedFactor <= 0.03) return;

  const r = camera.worldLengthToScreen(radius);
  trail.forEach((pos, i) => {
    const t = (i + 1) / trail.length;
    const alpha = t * 0.45 * speedFactor;
    const p = camera.worldToScreen(pos.x, pos.y);
    const blobR = r * (0.6 + t * 0.5);
    const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, blobR);
    gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.beginPath();
    ctx.arc(p.x, p.y, blobR, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
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
// anel de carga + botão de dash + botão de turbo com anel de combustível.
// Desenhados por cima de tudo, em espaço de tela (não de mundo) — por isso
// não usam a câmera.
export function renderTouchControls(
  ctx: CanvasRenderingContext2D,
  layout: TouchLayout,
  joystick: { anchor: Vec2; knob: Vec2 } | null,
  kickCharge: number,
  boostStamina: number,
): void {
  const { kickButton, dashButton, boostButton } = layout;

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

  ctx.beginPath();
  ctx.arc(boostButton.x, boostButton.y, boostButton.radius, 0, Math.PI * 2);
  ctx.fillStyle = boostStamina > 0 ? 'rgba(56, 189, 248, 0.28)' : 'rgba(120, 120, 120, 0.2)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(253, 246, 255, 0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(boostButton.x, boostButton.y, boostButton.radius + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * boostStamina);
  ctx.strokeStyle = THEME.ACCENT_BOOST;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = "800 11px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = 'rgba(253, 246, 255, 0.85)';
  ctx.fillText('TURBO', boostButton.x, boostButton.y);
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
