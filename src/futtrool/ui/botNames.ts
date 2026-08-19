// Apelidos fictícios pros bots que preenchem time incompleto (ver plano de
// multiplayer: "Começar mesmo assim (com bots)") — sem isso os slots sem
// humano ficam sem identificação nenhuma acima do jogador, o que fica
// estranho numa partida com nome de verdade em cima de quem é gente.

import type { PlayerId } from '../core/types';

const BOT_NAMES = [
  'Foguete',
  'Trovão',
  'Sardinha',
  'Bigode',
  'Pipoca',
  'Formiga',
  'Relâmpago',
  'Girino',
  'Macarrão',
  'Tufão',
  'Sorriso',
  'Rabisco',
  'Canhão',
  'Fominha',
  'Pipa',
  'Bolinha',
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// PRNG determinístico só pra embaralhar o pool de nomes (não precisa ser
// bom o bastante pra jogo de verdade, só espalhar os índices) — mesma
// semente sempre dá a mesma ordem, então todo mundo vendo a MESMA partida
// (cada cliente calcula isso por conta própria, o servidor não manda nome
// de bot nenhum) enxerga os mesmos apelidos pros mesmos bots.
function shuffledPool(seed: number): string[] {
  const pool = [...BOT_NAMES];
  let state = seed || 1;
  const nextRandom = (): number => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom() * (i + 1));
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }
  return pool;
}

// Dá um apelido fictício pra cada bot da lista, sem repetir nenhum entre
// eles (contanto que caibam no pool — 16 nomes, bem mais que o máximo de
// bots possível hoje, 3v3 com zero humanos = 6). A ORDEM de entrada não
// importa (ordena antes de embaralhar), só o CONJUNTO de ids — assim dá
// pra chamar de novo com os mesmos ids em qualquer ordem e cair na mesma
// atribuição.
export function assignFictionalNames(botIds: PlayerId[]): Record<PlayerId, string> {
  const sorted = [...botIds].sort();
  const pool = shuffledPool(hashString(sorted.join(',')));
  const assignment = {} as Record<PlayerId, string>;
  sorted.forEach((id, i) => {
    assignment[id] = pool[i % pool.length]!;
  });
  return assignment;
}
