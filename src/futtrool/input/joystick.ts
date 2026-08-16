// Controles touch (spec seção 6): joystick virtual flutuante (aparece onde
// o dedo tocar, zona morta de 12% do raio) + botão PONTAPÉ (toque curto =
// chute fraco, segurar = carrega) + botão de dash. Usa Pointer Events pra
// tratar mouse e touch da mesma forma — cada `pointerId` é rastreado
// separadamente, então dá pra mover e chutar com dois dedos ao mesmo tempo.

import type { Command, Vec2 } from '../core/types';

const JOYSTICK_RADIUS_PX = 60;
const JOYSTICK_DEADZONE = 0.12; // seção 6: "zona morta de 12% do raio"
const KICK_BUTTON_RADIUS_PX = 58;
const DASH_BUTTON_RADIUS_PX = 34;
const BOOST_BUTTON_RADIUS_PX = 40;

export type TouchLayout = {
  kickButton: { x: number; y: number; radius: number };
  dashButton: { x: number; y: number; radius: number };
  boostButton: { x: number; y: number; radius: number };
};

// Os 3 botões (turbo, dash, chute) ficam numa única fileira colada na
// borda inferior direita, todos na mesma altura — de propósito, não
// empilhados verticalmente. Um dash "um pouco acima" do chute cresce em
// altura de tela conforme a viewport fica mais baixa/larga (celular
// deitado), e nas telas mais baixas isso colide com as placas de anúncio
// de campo (que ficam perto do topo — ver ads/slots.ts e o
// FIELD.APRON_X da câmera). Uma fileira horizontal mantém o conjunto
// sempre perto da borda inferior, não importa o formato da tela.
export function computeTouchLayout(viewportW: number, viewportH: number): TouchLayout {
  const margin = 28;
  const gap = 14;
  const kickX = viewportW - margin - KICK_BUTTON_RADIUS_PX;
  const kickY = viewportH - margin - KICK_BUTTON_RADIUS_PX;
  const dashX = kickX - KICK_BUTTON_RADIUS_PX - DASH_BUTTON_RADIUS_PX - gap;
  const boostX = dashX - DASH_BUTTON_RADIUS_PX - BOOST_BUTTON_RADIUS_PX - gap;
  return {
    kickButton: { x: kickX, y: kickY, radius: KICK_BUTTON_RADIUS_PX },
    dashButton: { x: dashX, y: kickY, radius: DASH_BUTTON_RADIUS_PX },
    boostButton: { x: boostX, y: kickY, radius: BOOST_BUTTON_RADIUS_PX },
  };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

type MoveTouch = { pointerId: number; anchor: Vec2 };

export class TouchInput {
  private layout: TouchLayout;
  private moveTouch: MoveTouch | null = null;
  private moveVector: Vec2 = { x: 0, y: 0 };
  private kickPointerId: number | null = null;
  private kickHeld = false;
  private dashPending = false;
  private boostPointerId: number | null = null;
  private boostHeld = false;

  // Exposto só pra o renderer desenhar o joystick/botões no lugar certo.
  joystickVisual: { anchor: Vec2; knob: Vec2 } | null = null;

  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, getViewportSize: () => { w: number; h: number }) {
    this.canvas = canvas;
    const { w, h } = getViewportSize();
    this.layout = computeTouchLayout(w, h);

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
  }

  updateLayout(viewportW: number, viewportH: number): void {
    this.layout = computeTouchLayout(viewportW, viewportH);
  }

  private toLocalPoint(e: PointerEvent): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // `setPointerCapture` pode lançar `NotFoundError` se o ponteiro já não
  // estiver mais ativo no momento da chamada (solto rápido demais, ou —
  // visto em teste automatizado — um evento sintético sem ponteiro nativo
  // de verdade por trás). Não é essencial pro funcionamento (só garante que
  // os eventos de move/up continuem chegando mesmo se o dedo escorregar pra
  // fora do canvas), então uma falha aqui não deve travar o resto do
  // handler.
  private trySetPointerCapture(pointerId: number): void {
    try {
      this.canvas.setPointerCapture(pointerId);
    } catch {
      // Sem captura: ainda funciona, só perde a garantia de continuar
      // recebendo eventos se o dedo sair da área do canvas.
    }
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    const p = this.toLocalPoint(e);

    if (distance(p, this.layout.dashButton) <= this.layout.dashButton.radius) {
      this.dashPending = true;
      this.trySetPointerCapture(e.pointerId);
      return;
    }

    if (distance(p, this.layout.boostButton) <= this.layout.boostButton.radius) {
      this.boostPointerId = e.pointerId;
      this.boostHeld = true;
      this.trySetPointerCapture(e.pointerId);
      return;
    }

    if (distance(p, this.layout.kickButton) <= this.layout.kickButton.radius) {
      this.kickPointerId = e.pointerId;
      this.kickHeld = true;
      this.trySetPointerCapture(e.pointerId);
      return;
    }

    if (!this.moveTouch) {
      this.moveTouch = { pointerId: e.pointerId, anchor: p };
      this.moveVector = { x: 0, y: 0 };
      this.joystickVisual = { anchor: p, knob: p };
      this.trySetPointerCapture(e.pointerId);
    }
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.moveTouch || e.pointerId !== this.moveTouch.pointerId) return;
    const p = this.toLocalPoint(e);

    const dx = p.x - this.moveTouch.anchor.x;
    const dy = p.y - this.moveTouch.anchor.y;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, JOYSTICK_RADIUS_PX);
    const angle = Math.atan2(dy, dx);
    const knob = {
      x: this.moveTouch.anchor.x + Math.cos(angle) * clamped,
      y: this.moveTouch.anchor.y + Math.sin(angle) * clamped,
    };
    this.joystickVisual = { anchor: this.moveTouch.anchor, knob };

    const magnitude = clamped / JOYSTICK_RADIUS_PX;
    if (magnitude < JOYSTICK_DEADZONE) {
      this.moveVector = { x: 0, y: 0 };
    } else {
      // Reescala pra fora da zona morta continuar suave (sem "pulo" logo
      // após sair da zona morta).
      const scaled = (magnitude - JOYSTICK_DEADZONE) / (1 - JOYSTICK_DEADZONE);
      this.moveVector = { x: Math.cos(angle) * scaled, y: Math.sin(angle) * scaled };
    }
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (this.moveTouch && e.pointerId === this.moveTouch.pointerId) {
      this.moveTouch = null;
      this.moveVector = { x: 0, y: 0 };
      this.joystickVisual = null;
    }
    if (this.kickPointerId === e.pointerId) {
      this.kickPointerId = null;
      this.kickHeld = false;
    }
    if (this.boostPointerId === e.pointerId) {
      this.boostPointerId = null;
      this.boostHeld = false;
    }
  };

  getCommand(tick: number): Command {
    const dash = this.dashPending;
    this.dashPending = false;
    return { tick, move: this.moveVector, kickHeld: this.kickHeld, dash, boost: this.boostHeld };
  }

  getLayout(): TouchLayout {
    return this.layout;
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
  }
}
