import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Game, GameState } from '../flysim/core/Game';
import { FIXED_TIMESTEP_S } from '../flysim/config';

const NO_INPUT = { pitch: 0, roll: 0, yaw: 0 };

describe('Game — checkpoints', () => {
  it('contabiliza um checkpoint quando o avião chega perto de um alvo ainda não coletado', () => {
    const game = new Game(16 / 9);
    game.reset();

    const target = game.checkpoints.nearestTarget(game.aircraft.position);
    expect(target).toBeDefined();
    if (!target) return;

    game.aircraft.position.set(target.x, target.y, target.z);
    const scoreBefore = game.score;

    game.update(FIXED_TIMESTEP_S, NO_INPUT, 0);

    expect(game.checkpointsPassedValue).toBe(1);
    expect(game.score).toBeGreaterThan(scoreBefore);
  });

  it('coleta em qualquer ordem — não exige passar primeiro pelo mais próximo do spawn', () => {
    const game = new Game(16 / 9);
    game.reset();

    // Sonda de dois pontos bem distantes/opostos no mapa pra achar dois
    // checkpoints diferentes, sem depender de qual é "o próximo" do spawn.
    const targetNearSpawn = game.checkpoints.nearestTarget(game.aircraft.position);
    const targetFromOppositeSide = game.checkpoints.nearestTarget(new THREE.Vector3(-3000, 0, -3000));
    expect(targetNearSpawn).toBeDefined();
    expect(targetFromOppositeSide).toBeDefined();
    if (!targetNearSpawn || !targetFromOppositeSide) return;
    expect(targetFromOppositeSide).not.toEqual(targetNearSpawn);

    // Voa direto pro checkpoint "do outro lado", pulando o mais próximo —
    // ainda assim precisa contar, já que a coleta não é sequencial.
    game.aircraft.position.set(targetFromOppositeSide.x, targetFromOppositeSide.y, targetFromOppositeSide.z);
    game.update(FIXED_TIMESTEP_S, NO_INPUT, 0);

    expect(game.checkpointsPassedValue).toBe(1);
  });

  it('não deixa coletar o mesmo checkpoint duas vezes', () => {
    const game = new Game(16 / 9);
    game.reset();

    const target = game.checkpoints.nearestTarget(game.aircraft.position);
    if (!target) throw new Error('curso sem checkpoints');
    game.aircraft.position.set(target.x, target.y, target.z);

    game.update(FIXED_TIMESTEP_S, NO_INPUT, 0);
    expect(game.checkpointsPassedValue).toBe(1);

    // Continua exatamente no mesmo ponto — já foi coletado, não deve contar de novo.
    game.update(FIXED_TIMESTEP_S, NO_INPUT, 0);
    expect(game.checkpointsPassedValue).toBe(1);
  });

  it('não contabiliza nada quando está longe de todos os alvos', () => {
    const game = new Game(16 / 9);
    game.reset();

    const target = game.checkpoints.nearestTarget(game.aircraft.position);
    if (!target) throw new Error('curso sem checkpoints');
    game.aircraft.position.set(target.x + 500, target.y + 500, target.z + 500);

    game.update(FIXED_TIMESTEP_S, NO_INPUT, 0);

    expect(game.checkpointsPassedValue).toBe(0);
  });

  it('reaparece o percurso inteiro depois que todos os checkpoints somem (voo sem fim)', () => {
    const game = new Game(16 / 9);
    game.reset();

    // Coleta todos os checkpoints do curso, um de cada vez.
    for (let i = 0; i < 8; i++) {
      const target = game.checkpoints.nearestTarget(game.aircraft.position);
      if (!target) throw new Error(`sem alvo restante na iteração ${i}`);
      game.aircraft.position.set(target.x, target.y, target.z);
      game.update(FIXED_TIMESTEP_S, NO_INPUT, 0);
    }
    expect(game.checkpointsPassedValue).toBe(8);

    // Depois do último, o curso reaparece inteiro — deve haver um próximo alvo de novo.
    const nextAfterFullLap = game.checkpoints.nearestTarget(game.aircraft.position);
    expect(nextAfterFullLap).toBeDefined();
  });

  it('não contabiliza checkpoint enquanto o jogo não está em PLAYING', () => {
    const game = new Game(16 / 9);
    // sem chamar reset(): o estado começa em MENU
    expect(game.state).toBe(GameState.MENU);

    const target = game.checkpoints.nearestTarget(game.aircraft.position);
    if (!target) throw new Error('curso sem checkpoints');
    game.aircraft.position.set(target.x, target.y, target.z);

    game.update(FIXED_TIMESTEP_S, NO_INPUT, 0);

    expect(game.checkpointsPassedValue).toBe(0);
  });
});
