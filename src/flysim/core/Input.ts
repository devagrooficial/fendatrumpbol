import { CONTROLS } from '../config';
import type { FlightAxes } from '../entities/Aircraft';

export type ThrottleDirection = -1 | 0 | 1;
export type SimAction = 'pause';
export type ActionListener = (action: SimAction) => void;

const KEY_PITCH_UP = new Set(['KeyW', 'ArrowUp']);
const KEY_PITCH_DOWN = new Set(['KeyS', 'ArrowDown']);
const KEY_ROLL_LEFT = new Set(['KeyA', 'ArrowLeft']);
const KEY_ROLL_RIGHT = new Set(['KeyD', 'ArrowRight']);
const KEY_YAW_LEFT = new Set(['KeyQ']);
const KEY_YAW_RIGHT = new Set(['KeyE']);
const KEY_THROTTLE_UP = new Set(['ShiftLeft', 'ShiftRight', 'Equal', 'NumpadAdd']);
const KEY_THROTTLE_DOWN = new Set(['ControlLeft', 'ControlRight', 'Minus', 'NumpadSubtract']);
const KEY_PAUSE = new Set(['Escape', 'KeyP']);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Eixos contínuos (teclado + joystick virtual de toque), diferente do padrão
 * discreto de ação do runner — voo precisa de entrada analógica contínua.
 */
export class Input {
  private readonly listener: ActionListener;
  private readonly pressed = new Set<string>();
  private readonly root: HTMLDivElement;
  private readonly stick: HTMLDivElement;
  private stickBaseX = 0;
  private stickBaseY = 0;
  private stickDx = 0;
  private stickDy = 0;
  private stickActive = false;
  private stickTouchId: number | null = null;
  private throttleTouchDirection: ThrottleDirection = 0;

  constructor(listener: ActionListener) {
    this.listener = listener;
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);

    const ui = buildTouchControls();
    this.root = ui.root;
    this.stick = ui.stick;
    document.body.appendChild(this.root);

    // touchmove/touchend continuam "presos" ao elemento onde o touch começou
    // (o próprio manípulo do joystick) — nunca borbulham pro canvas, que é
    // um irmão na árvore, não um ancestral. Por isso escutam em `window` e
    // filtram pelo identifier, em vez de escutar no `target`.
    ui.base.addEventListener('touchstart', this.handleStickStart, { passive: true });
    window.addEventListener('touchmove', this.handleStickMove, { passive: true });
    window.addEventListener('touchend', this.handleStickEnd, { passive: true });
    window.addEventListener('touchcancel', this.handleStickEnd, { passive: true });

    ui.throttleUp.addEventListener('touchstart', () => (this.throttleTouchDirection = 1), { passive: true });
    ui.throttleUp.addEventListener('touchend', () => (this.throttleTouchDirection = 0), { passive: true });
    ui.throttleDown.addEventListener('touchstart', () => (this.throttleTouchDirection = -1), { passive: true });
    ui.throttleDown.addEventListener('touchend', () => (this.throttleTouchDirection = 0), { passive: true });
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.root.remove();
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    this.pressed.add(event.code);
    if (KEY_PAUSE.has(event.code)) this.listener('pause');
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.code);
  };

  private handleStickStart = (event: TouchEvent): void => {
    const touch = event.changedTouches[0];
    if (!touch || this.stickActive) return;
    this.stickActive = true;
    this.stickTouchId = touch.identifier;
    this.stickBaseX = touch.clientX;
    this.stickBaseY = touch.clientY;
    this.stickDx = 0;
    this.stickDy = 0;
  };

  private handleStickMove = (event: TouchEvent): void => {
    if (!this.stickActive) return;
    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i];
      if (!touch || touch.identifier !== this.stickTouchId) continue;
      const radius = CONTROLS.JOYSTICK_RADIUS_PX;
      const dx = clamp(touch.clientX - this.stickBaseX, -radius, radius);
      const dy = clamp(touch.clientY - this.stickBaseY, -radius, radius);
      this.stickDx = dx;
      this.stickDy = dy;
      this.stick.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  };

  private handleStickEnd = (event: TouchEvent): void => {
    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i];
      if (!touch || touch.identifier !== this.stickTouchId) continue;
      this.stickActive = false;
      this.stickTouchId = null;
      this.stickDx = 0;
      this.stickDy = 0;
      this.stick.style.transform = 'translate(0, 0)';
    }
  };

  private axisFromKeys(negative: Set<string>, positive: Set<string>): number {
    let value = 0;
    for (const code of this.pressed) {
      if (negative.has(code)) value -= 1;
      if (positive.has(code)) value += 1;
    }
    return clamp(value, -1, 1);
  }

  getAxes(): FlightAxes {
    const radius = CONTROLS.JOYSTICK_RADIUS_PX;
    const deadzone = CONTROLS.JOYSTICK_DEADZONE;
    let rollFromStick = this.stickDx / radius;
    let pitchFromStick = -this.stickDy / radius;
    if (Math.abs(rollFromStick) < deadzone) rollFromStick = 0;
    if (Math.abs(pitchFromStick) < deadzone) pitchFromStick = 0;

    const keyboardRoll = this.axisFromKeys(KEY_ROLL_LEFT, KEY_ROLL_RIGHT);
    const keyboardPitch = this.axisFromKeys(KEY_PITCH_DOWN, KEY_PITCH_UP);
    const keyboardYaw = this.axisFromKeys(KEY_YAW_LEFT, KEY_YAW_RIGHT);

    return {
      pitch: clamp(keyboardPitch + pitchFromStick, -1, 1),
      roll: clamp(keyboardRoll + rollFromStick, -1, 1),
      yaw: keyboardYaw,
    };
  }

  getThrottleDirection(): ThrottleDirection {
    if (this.throttleTouchDirection !== 0) return this.throttleTouchDirection;
    const fromKeys = this.axisFromKeys(KEY_THROTTLE_DOWN, KEY_THROTTLE_UP);
    if (fromKeys > 0) return 1;
    if (fromKeys < 0) return -1;
    return 0;
  }
}

function buildTouchControls(): {
  root: HTMLDivElement;
  base: HTMLDivElement;
  stick: HTMLDivElement;
  throttleUp: HTMLButtonElement;
  throttleDown: HTMLButtonElement;
} {
  const root = document.createElement('div');
  root.className = 'touch-controls';
  root.innerHTML = `
    <div class="touch-stick" data-stick-base>
      <div class="touch-stick__knob" data-stick-knob></div>
    </div>
    <div class="touch-throttle">
      <button type="button" class="touch-throttle__button" data-throttle-up aria-label="Acelerar">+</button>
      <button type="button" class="touch-throttle__button" data-throttle-down aria-label="Desacelerar">-</button>
    </div>
  `;

  const base = root.querySelector<HTMLDivElement>('[data-stick-base]');
  const stick = root.querySelector<HTMLDivElement>('[data-stick-knob]');
  const throttleUp = root.querySelector<HTMLButtonElement>('[data-throttle-up]');
  const throttleDown = root.querySelector<HTMLButtonElement>('[data-throttle-down]');
  if (!base || !stick || !throttleUp || !throttleDown) {
    throw new Error('Markup dos controles de toque incompleto');
  }

  return { root, base, stick, throttleUp, throttleDown };
}
