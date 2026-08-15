import { CONTROLS } from '../config';

export type PlayerAction = 'moveLeft' | 'moveRight' | 'jump' | 'slide' | 'pause';
export type ActionListener = (action: PlayerAction) => void;

/**
 * Normaliza teclado e swipe touch em ações abstratas. Não sabe nada sobre
 * pistas, física ou fila de comandos — isso é responsabilidade do Player.
 */
export class Input {
  private readonly target: HTMLElement;
  private readonly listener: ActionListener;
  private touchStartX = 0;
  private touchStartY = 0;
  private touchActive = false;

  constructor(target: HTMLElement, listener: ActionListener) {
    this.target = target;
    this.listener = listener;
    window.addEventListener('keydown', this.handleKeyDown);
    target.addEventListener('touchstart', this.handleTouchStart, { passive: true });
    target.addEventListener('touchend', this.handleTouchEnd, { passive: true });
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    this.target.removeEventListener('touchstart', this.handleTouchStart);
    this.target.removeEventListener('touchend', this.handleTouchEnd);
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.listener('moveLeft');
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.listener('moveRight');
        break;
      case 'ArrowUp':
      case 'KeyW':
      case 'Space':
        event.preventDefault();
        this.listener('jump');
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.listener('slide');
        break;
      case 'Escape':
      case 'KeyP':
        this.listener('pause');
        break;
    }
  };

  private handleTouchStart = (event: TouchEvent): void => {
    const touch = event.touches[0];
    if (!touch) return;
    this.touchActive = true;
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
  };

  private handleTouchEnd = (event: TouchEvent): void => {
    if (!this.touchActive) return;
    this.touchActive = false;
    const touch = event.changedTouches[0];
    if (!touch) return;

    const dx = touch.clientX - this.touchStartX;
    const dy = touch.clientY - this.touchStartY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (Math.max(absDx, absDy) < CONTROLS.SWIPE_MIN_PX) return;

    if (absDx > absDy) {
      this.listener(dx > 0 ? 'moveRight' : 'moveLeft');
    } else {
      this.listener(dy > 0 ? 'slide' : 'jump');
    }
  };
}
