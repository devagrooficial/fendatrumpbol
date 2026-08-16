// Câmera: converte coordenadas de mundo (unidades do campo, 1200x800) pra
// coordenadas de tela. Recebe o tamanho do viewport como parâmetro — não lê
// `window` diretamente — pra dar pra testar em Node sem browser.

import { FIELD } from '../core/constants';
import type { Vec2 } from '../core/types';

export type ScreenPoint = { x: number; y: number };

// Spec seção 11: câmera segue um ponto entre a bola e o jogador (peso 0.7
// bola / 0.3 jogador), com suavização (lerp 0.12) e clamp nas bordas do
// campo; zoom dinâmico entre 0.9 e 1.3 — usamos a distância entre os dois
// jogadores pro zoom base (mais perto um do outro = mais zoom, matando a
// jogada de perto) e um empurrão extra até 1.25 quando a bola entra no
// terço final (perto de qualquer um dos dois gols).
const FOLLOW_BALL_WEIGHT = 0.7;
const FOLLOW_PLAYER_WEIGHT = 0.3;
const FOLLOW_LERP = 0.12;
const ZOOM_LERP = 0.06;
const ZOOM_MIN = 0.9;
const ZOOM_MAX = 1.3;
const ZOOM_FINAL_THIRD = 1.25;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export class Camera {
  centerX = FIELD.WIDTH / 2;
  centerY = FIELD.HEIGHT / 2;
  zoom = 1;
  // Deslocamento de tela (px) aplicado por cima de tudo — o screen shake
  // (fx.ts) escreve aqui a cada frame; câmera não sabe de gol, só desenha
  // o offset que mandarem.
  shakeOffsetPx: ScreenPoint = { x: 0, y: 0 };

  private viewportW = 0;
  private viewportH = 0;
  private scale = 1;

  resize(viewportW: number, viewportH: number): void {
    this.viewportW = viewportW;
    this.viewportH = viewportH;
    this.updateScale();
  }

  private updateScale(): void {
    // "Fit": mostra o campo inteiro sempre, com faixas (letterbox) se a
    // proporção da tela não bater com a do campo.
    this.scale = Math.min(this.viewportW / FIELD.WIDTH, this.viewportH / FIELD.HEIGHT) * this.zoom;
  }

  worldToScreen(x: number, y: number): ScreenPoint {
    return {
      x: this.viewportW / 2 + (x - this.centerX) * this.scale + this.shakeOffsetPx.x,
      y: this.viewportH / 2 + (y - this.centerY) * this.scale + this.shakeOffsetPx.y,
    };
  }

  worldLengthToScreen(length: number): number {
    return length * this.scale;
  }

  get worldScale(): number {
    return this.scale;
  }

  // Chamado uma vez por frame de render (fora do passo fixo, com o alpha
  // que quiser — na prática usamos o dt real do frame) pra atualizar
  // posição/zoom suavemente em direção ao alvo do momento.
  follow(ballPos: Vec2, myPlayerPos: Vec2, otherPlayerPos: Vec2): void {
    const desiredX = ballPos.x * FOLLOW_BALL_WEIGHT + myPlayerPos.x * FOLLOW_PLAYER_WEIGHT;
    const desiredY = ballPos.y * FOLLOW_BALL_WEIGHT + myPlayerPos.y * FOLLOW_PLAYER_WEIGHT;
    this.centerX += (desiredX - this.centerX) * FOLLOW_LERP;
    this.centerY += (desiredY - this.centerY) * FOLLOW_LERP;

    const playerDist = Math.hypot(myPlayerPos.x - otherPlayerPos.x, myPlayerPos.y - otherPlayerPos.y);
    const distFactor = clamp(playerDist / (FIELD.WIDTH * 0.5), 0, 1);
    let targetZoom = ZOOM_MAX - distFactor * (ZOOM_MAX - ZOOM_MIN);

    const distFromNearestGoalLine = Math.min(ballPos.x, FIELD.WIDTH - ballPos.x);
    if (distFromNearestGoalLine < FIELD.WIDTH / 3) {
      targetZoom = Math.max(targetZoom, ZOOM_FINAL_THIRD);
    }
    targetZoom = clamp(targetZoom, ZOOM_MIN, ZOOM_MAX);

    this.zoom += (targetZoom - this.zoom) * ZOOM_LERP;
    this.updateScale();
    this.clampCenter();
  }

  // Fração (0..1) da área de um retângulo de mundo que cai dentro do
  // viewport atual — usado pela telemetria de anúncios (spec 10.4: regra
  // de impressão "viewable" é ≥50% da área visível).
  worldRectVisibleFraction(x: number, y: number, w: number, h: number): number {
    const a = this.worldToScreen(x, y);
    const b = this.worldToScreen(x + w, y + h);
    const left = Math.min(a.x, b.x);
    const right = Math.max(a.x, b.x);
    const top = Math.min(a.y, b.y);
    const bottom = Math.max(a.y, b.y);

    const totalArea = (right - left) * (bottom - top);
    if (totalArea <= 0) return 0;

    const visW = Math.max(0, Math.min(this.viewportW, right) - Math.max(0, left));
    const visH = Math.max(0, Math.min(this.viewportH, bottom) - Math.max(0, top));
    return (visW * visH) / totalArea;
  }

  private clampCenter(): void {
    const visibleWorldW = this.viewportW / this.scale;
    const visibleWorldH = this.viewportH / this.scale;

    this.centerX =
      visibleWorldW >= FIELD.WIDTH
        ? FIELD.WIDTH / 2
        : clamp(this.centerX, visibleWorldW / 2, FIELD.WIDTH - visibleWorldW / 2);

    this.centerY =
      visibleWorldH >= FIELD.HEIGHT
        ? FIELD.HEIGHT / 2
        : clamp(this.centerY, visibleWorldH / 2, FIELD.HEIGHT - visibleWorldH / 2);
  }
}
