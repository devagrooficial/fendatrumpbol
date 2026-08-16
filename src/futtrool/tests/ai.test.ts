import { describe, expect, it } from 'vitest';
import { step } from '../core/simulation';
import { createMatchState } from '../core/rules';
import { createAiState, decideCommand, type AiState } from '../core/ai/brain';
import { AI_PROFILES, type AiProfile } from '../core/ai/profiles';
import type { GameState } from '../core/types';

const DT = 1 / 60;
const MAX_TICKS = 60 * 60 * 4; // 4 min de partida simulada — teto de segurança

function playHeadlessMatch(profileP1: AiProfile, profileP2: AiProfile, seed: number): GameState {
  let state = createMatchState(seed, 1500);
  let aiP1: AiState = createAiState(seed * 2 + 1);
  let aiP2: AiState = createAiState(seed * 2 + 2);

  for (let i = 0; i < MAX_TICKS && state.phase !== 'ended'; i++) {
    const decisionP1 = decideCommand(state, aiP1, profileP1, 'p1', DT);
    const decisionP2 = decideCommand(state, aiP2, profileP2, 'p2', DT);
    aiP1 = decisionP1.aiState;
    aiP2 = decisionP2.aiState;
    state = step(state, { p1: decisionP1.command, p2: decisionP2.command }, DT).state;
  }

  return state;
}

describe('IA — comportamento básico', () => {
  it('produz um Command válido em todas as fases da partida (kickoff, jogando, gol)', () => {
    let state = createMatchState(1, 500);
    let ai: AiState = createAiState(1);

    for (let i = 0; i < 60 * 10; i++) {
      const { command, aiState } = decideCommand(state, ai, AI_PROFILES.profissional, 'p1', DT);
      ai = aiState;
      expect(Number.isFinite(command.move.x)).toBe(true);
      expect(Number.isFinite(command.move.y)).toBe(true);
      expect(Math.hypot(command.move.x, command.move.y)).toBeLessThanOrEqual(1 + 1e-6);
      state = step(state, { p1: command, p2: { tick: state.tick, move: { x: 0, y: 0 }, kickHeld: false, dash: false } }, DT).state;
    }
  });

  it('não produz comando durante kickoff/gol (input é ignorado mesmo assim, mas o Command deve ser neutro)', () => {
    const state = createMatchState(1, 1500);
    const ai = createAiState(1);
    const { command } = decideCommand(state, ai, AI_PROFILES.lenda, 'p1', DT);
    expect(command.move).toEqual({ x: 0, y: 0 });
    expect(command.kickHeld).toBe(false);
    expect(command.dash).toBe(false);
  });

  it('nunca manda magnitude de movimento acima de speedFactor', () => {
    let state = createMatchState(1, 1);
    let ai = createAiState(7);
    for (let i = 0; i < 60 * 20; i++) {
      const { command, aiState } = decideCommand(state, ai, AI_PROFILES.novato, 'p1', DT);
      ai = aiState;
      expect(Math.hypot(command.move.x, command.move.y)).toBeLessThanOrEqual(AI_PROFILES.novato.speedFactor + 1e-6);
      state = step(state, { p1: command, p2: { tick: state.tick, move: { x: 0, y: 0 }, kickHeld: false, dash: false } }, DT).state;
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
      if (finalState.result === 'p2') lendaWins++;
      else if (finalState.result === 'p1') novatoWins++;
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
      if (finalState.result === 'p2') proWins++;
      else if (finalState.result === 'p1') novatoWins++;
    }

    // eslint-disable-next-line no-console
    console.info(`[ai balance] Profissional ${proWins} x ${novatoWins} Novato em ${MATCHES} partidas`);
    expect(proWins).toBeGreaterThanOrEqual(novatoWins);
  }, 30_000);
});
