import { describe, expect, it } from 'vitest';
import { Game, GameState } from '../flysim/core/Game';
import { FIXED_TIMESTEP_S } from '../flysim/config';

const NO_INPUT = { pitch: 0, roll: 0, yaw: 0 };

describe('Game — checkpoints', () => {
  it('contabiliza um checkpoint quando o avião chega perto do alvo atual', () => {
    const game = new Game(16 / 9);
    game.reset();

    const target = game.checkpoints.nextTarget;
    expect(target).toBeDefined();
    if (!target) return;

    game.aircraft.position.set(target.x, target.y, target.z);
    const scoreBefore = game.score;

    game.update(FIXED_TIMESTEP_S, NO_INPUT, 0);

    expect(game.checkpointsPassedValue).toBe(1);
    expect(game.score).toBeGreaterThan(scoreBefore);
  });

  it('avança pro próximo alvo depois de passar no atual', () => {
    const game = new Game(16 / 9);
    game.reset();

    const firstTarget = game.checkpoints.nextTarget;
    if (!firstTarget) throw new Error('curso sem checkpoints');
    game.aircraft.position.set(firstTarget.x, firstTarget.y, firstTarget.z);
    game.update(FIXED_TIMESTEP_S, NO_INPUT, 0);

    const secondTarget = game.checkpoints.nextTarget;
    expect(secondTarget).toBeDefined();
    expect(secondTarget).not.toEqual(firstTarget);
  });

  it('não contabiliza nada quando está longe do alvo', () => {
    const game = new Game(16 / 9);
    game.reset();

    const target = game.checkpoints.nextTarget;
    if (!target) throw new Error('curso sem checkpoints');
    game.aircraft.position.set(target.x + 500, target.y + 500, target.z + 500);

    game.update(FIXED_TIMESTEP_S, NO_INPUT, 0);

    expect(game.checkpointsPassedValue).toBe(0);
  });

  it('não contabiliza checkpoint enquanto o jogo não está em PLAYING', () => {
    const game = new Game(16 / 9);
    // sem chamar reset(): o estado começa em MENU
    expect(game.state).toBe(GameState.MENU);

    const target = game.checkpoints.nextTarget;
    if (!target) throw new Error('curso sem checkpoints');
    game.aircraft.position.set(target.x, target.y, target.z);

    game.update(FIXED_TIMESTEP_S, NO_INPUT, 0);

    expect(game.checkpointsPassedValue).toBe(0);
  });
});
