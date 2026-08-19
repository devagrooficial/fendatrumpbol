// Controle por teclado — dois esquemas fixos (WASD e setas), independentes
// de qual PlayerId/time a simulação atribuir a essa pessoa (ver
// getP1Command em main.ts: cada humano sempre lê o PRÓPRIO teclado com o
// esquema "primary" (WASD), esteja em teamA ou teamB, 1v1 ou 2v2 — "P1"
// aqui só nomeia o esquema de teclas, não um jogador da partida).
// Primary: WASD / Espaço (chute) / Shift esquerdo (dash) / Ctrl esquerdo (turbo).
// Secondary: setas / Enter (chute) / Ctrl direito (dash) / Shift direito (turbo) — reservado pra um eventual modo local 2 jogadores no mesmo teclado, hoje sem uso.

import type { Command, Vec2 } from '../core/types';

export type LocalSlot = 'primary' | 'secondary';

type Binding = {
  up: string;
  down: string;
  left: string;
  right: string;
  kick: string;
  dash: string;
  boost: string;
};

const PRIMARY_BINDING: Binding = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  kick: 'Space',
  dash: 'ShiftLeft',
  boost: 'ControlLeft',
};

const SECONDARY_BINDING: Binding = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  kick: 'Enter',
  dash: 'ControlRight',
  boost: 'ShiftRight',
};

const ALL_CODES = new Set(
  [PRIMARY_BINDING, SECONDARY_BINDING].flatMap((b) => [b.up, b.down, b.left, b.right, b.kick, b.dash, b.boost]),
);

export class KeyboardInput {
  private readonly pressed = new Set<string>();
  private readonly dashPending = new Set<LocalSlot>();

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    // Mesma rede de segurança do TouchInput: se a janela perder o foco com
    // uma tecla pressionada (troca de app/aba, sem o `keyup` nunca chegar),
    // a tecla ficaria "presa" pra sempre. Zera tudo quando isso acontece.
    window.addEventListener('blur', this.resetInput);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  // Sem isso, digitar em QUALQUER campo de texto da tela (ex.: o apelido
  // no menu) travava/comia teclas como W/A/S/D, Espaço e Enter — porque
  // esse listener fica no `window` e intercepta o teclado inteiro pro
  // jogo, mesmo com o foco num `<input>`. "S" comendo é literalmente
  // KeyS, o bind de "andar pra baixo" do P1.
  private isTypingInField(): boolean {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (this.isTypingInField()) return;

    if (!this.pressed.has(e.code)) {
      if (e.code === PRIMARY_BINDING.dash) this.dashPending.add('primary');
      if (e.code === SECONDARY_BINDING.dash) this.dashPending.add('secondary');
    }
    this.pressed.add(e.code);
    if (ALL_CODES.has(e.code)) e.preventDefault();
  };

  // De propósito SEM o guard de `isTypingInField` — se uma tecla de jogo
  // já estava pressionada antes de clicar num campo de texto, ela precisa
  // poder ser solta normalmente, senão fica "presa" pra sempre em
  // `pressed` (o jogador voltaria pro jogo andando sozinho).
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.pressed.delete(e.code);
  };

  private readonly resetInput = (): void => {
    this.pressed.clear();
    this.dashPending.clear();
  };

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) this.resetInput();
  };

  getCommand(id: LocalSlot, tick: number): Command {
    const binding = id === 'primary' ? PRIMARY_BINDING : SECONDARY_BINDING;

    const move: Vec2 = { x: 0, y: 0 };
    if (this.pressed.has(binding.left)) move.x -= 1;
    if (this.pressed.has(binding.right)) move.x += 1;
    if (this.pressed.has(binding.up)) move.y -= 1;
    if (this.pressed.has(binding.down)) move.y += 1;

    const len = Math.hypot(move.x, move.y);
    const normalizedMove = len > 1 ? { x: move.x / len, y: move.y / len } : move;

    const dash = this.dashPending.has(id);
    this.dashPending.delete(id);

    return {
      tick,
      move: normalizedMove,
      kickHeld: this.pressed.has(binding.kick),
      dash,
      boost: this.pressed.has(binding.boost),
    };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.resetInput);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }
}
