// PRNG com seed (mulberry32). Único gerador de números aleatórios permitido
// dentro de `core/` — nunca `Math.random()`, porque a simulação precisa ser
// determinística (mesmo seed + mesmos comandos = mesmo resultado sempre),
// pré-requisito pro multiplayer da entrega 2 (seção 13).

export type RngState = number;

export function createRngState(seed: number): RngState {
  return seed >>> 0;
}

// Retorna o próximo float em [0, 1) e o novo estado do gerador. Estado é só
// um número (serializável dentro de GameState.rngState), não um objeto com
// closure — mantém GameState livre de referências não-serializáveis.
export function nextRandom(state: RngState): { value: number; nextState: RngState } {
  let s = (state + 0x6d2b79f5) >>> 0;
  s = Math.imul(s ^ (s >>> 15), s | 1);
  s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
  const value = ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  return { value, nextState: s >>> 0 };
}

// Conveniência para gerar um float dentro de [min, max).
export function nextRange(
  state: RngState,
  min: number,
  max: number,
): { value: number; nextState: RngState } {
  const { value, nextState } = nextRandom(state);
  return { value: min + value * (max - min), nextState };
}
