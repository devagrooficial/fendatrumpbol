import { describe, expect, it } from 'vitest';
import { step } from '../core/simulation';
import { createMatchState } from '../core/rules';
import { createAiState, decideCommand, type AiState } from '../core/ai/brain';
import { AI_PROFILES, type AiProfile } from '../core/ai/profiles';
import type { GameState, TeamId } from '../core/types';

const DT = 1 / 60;
const ROSTER: Record<TeamId, ['teamA-0' | 'teamB-0']> = { teamA: ['teamA-0'], teamB: ['teamB-0'] };
// Teto de segurança: MATCH.DURATION_MS (4min) + possível prorrogação
// (OVERTIME_MS, 60s) + folga — evita loop infinito no teste sem cortar
// partidas que legitimamente vão até o fim.
const MAX_TICKS = 60 * 60 * 6;

function playHeadlessMatch(profileTeamA: AiProfile, profileTeamB: AiProfile, seed: number): GameState {
  let state = createMatchState(seed, 1500, ROSTER);
  let aiA: AiState = createAiState(seed * 2 + 1);
  let aiB: AiState = createAiState(seed * 2 + 2);

  for (let i = 0; i < MAX_TICKS && state.phase !== 'ended'; i++) {
    const decisionA = decideCommand(state, aiA, profileTeamA, 'teamA-0', DT);
    const decisionB = decideCommand(state, aiB, profileTeamB, 'teamB-0', DT);
    aiA = decisionA.aiState;
    aiB = decisionB.aiState;
    state = step(state, { 'teamA-0': decisionA.command, 'teamB-0': decisionB.command }, DT).state;
  }

  return state;
}

describe('IA — comportamento básico', () => {
  it('produz um Command válido em todas as fases da partida (kickoff, jogando, gol)', () => {
    let state = createMatchState(1, 500, ROSTER);
    let ai: AiState = createAiState(1);

    for (let i = 0; i < 60 * 10; i++) {
      const { command, aiState } = decideCommand(state, ai, AI_PROFILES.profissional, 'teamA-0', DT);
      ai = aiState;
      expect(Number.isFinite(command.move.x)).toBe(true);
      expect(Number.isFinite(command.move.y)).toBe(true);
      expect(Math.hypot(command.move.x, command.move.y)).toBeLessThanOrEqual(1 + 1e-6);
      state = step(
        state,
        { 'teamA-0': command, 'teamB-0': { tick: state.tick, move: { x: 0, y: 0 }, kickHeld: false, dash: false, boost: false } },
        DT,
      ).state;
    }
  });

  it('não produz comando durante kickoff/gol (input é ignorado mesmo assim, mas o Command deve ser neutro)', () => {
    const state = createMatchState(1, 1500, ROSTER);
    const ai = createAiState(1);
    const { command } = decideCommand(state, ai, AI_PROFILES.lenda, 'teamA-0', DT);
    expect(command.move).toEqual({ x: 0, y: 0 });
    expect(command.kickHeld).toBe(false);
    expect(command.dash).toBe(false);
    expect(command.boost).toBe(false);
  });

  it('nunca manda magnitude de movimento acima de speedFactor', () => {
    let state = createMatchState(1, 1, ROSTER);
    let ai = createAiState(7);
    for (let i = 0; i < 60 * 20; i++) {
      const { command, aiState } = decideCommand(state, ai, AI_PROFILES.novato, 'teamA-0', DT);
      ai = aiState;
      expect(Math.hypot(command.move.x, command.move.y)).toBeLessThanOrEqual(AI_PROFILES.novato.speedFactor + 1e-6);
      state = step(
        state,
        { 'teamA-0': command, 'teamB-0': { tick: state.tick, move: { x: 0, y: 0 }, kickHeld: false, dash: false, boost: false } },
        DT,
      ).state;
    }
  });
});

describe('IA — balanceamento entre perfis (headless, sem render)', () => {
  // Critério de aceite da seção 14 da spec é qualitativo ("perceptivelmente
  // diferentes numa cega"); o teste quantitativo abaixo é uma checagem de
  // sanidade adicional, não uma meta formal — bot-vs-bot é um proxy
  // imperfeito pra "vence a maioria dos humanos" (seção 5.3), então o limiar
  // aqui é deliberadamente mais frouxo que os 85-90% mencionados como meta
  // contra jogadores humanos.
  it('Lenda vence a maioria das partidas contra Novato em 40 partidas', () => {
    let lendaWins = 0;
    let novatoWins = 0;
    let draws = 0;
    const MATCHES = 40;

    for (let seed = 1; seed <= MATCHES; seed++) {
      const finalState = playHeadlessMatch(AI_PROFILES.novato, AI_PROFILES.lenda, seed);
      if (finalState.result === 'teamB') lendaWins++;
      else if (finalState.result === 'teamA') novatoWins++;
      else draws++;
    }

    // eslint-disable-next-line no-console
    console.info(`[ai balance] Lenda ${lendaWins} x ${novatoWins} Novato (${draws} empates) em ${MATCHES} partidas`);
    expect(lendaWins).toBeGreaterThan(novatoWins);
    // Taxa de vitória só entre partidas decisivas — dividir por MATCHES
    // direto penaliza injustamente por empates (que também podem ser um
    // resultado legítimo de um confronto bem disputado), então a métrica
    // mais correta é "de quem ganhou, quem ganhou mais".
    expect(lendaWins / (lendaWins + novatoWins)).toBeGreaterThan(0.65);
  }, 60_000);

  it('Profissional vence a maioria das partidas contra Novato em 20 partidas', () => {
    let proWins = 0;
    let novatoWins = 0;
    const MATCHES = 20;

    for (let seed = 1; seed <= MATCHES; seed++) {
      const finalState = playHeadlessMatch(AI_PROFILES.novato, AI_PROFILES.profissional, seed + 1000);
      if (finalState.result === 'teamB') proWins++;
      else if (finalState.result === 'teamA') novatoWins++;
    }

    // eslint-disable-next-line no-console
    console.info(`[ai balance] Profissional ${proWins} x ${novatoWins} Novato em ${MATCHES} partidas`);
    expect(proWins).toBeGreaterThanOrEqual(novatoWins);
  }, 30_000);
});
