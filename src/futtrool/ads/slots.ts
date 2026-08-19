// Geometria dos 11 slots (spec seção 10.1). Os "de campo" (pitch-*,
// center-watermark) ficam em unidades de mundo; os "de tela" (scoreboard,
// loading-hero, endgame-banner, replay-lower-third, menu-footer) em
// pixels, cada um dentro do layout da sua própria tela. `ball-skin` e
// `player-badge` não têm retângulo — são trocas de textura, tratadas à
// parte em adManager.ts.

import { FIELD } from '../core/constants';
import type { AdSlotId } from './types';

export const AD_SLOT_IDS: AdSlotId[] = [
  'pitch-nw',
  'pitch-sw',
  'pitch-ne',
  'pitch-se',
  'center-watermark',
  'scoreboard-sponsor',
  'loading-hero',
  'endgame-banner',
  'replay-lower-third',
  'menu-footer',
  'ball-skin',
  'player-badge',
];

export type WorldRect = { x: number; y: number; w: number; h: number };

// Placas de perímetro (spec: "placa deitada no gramado, atrás da área") —
// posicionadas FORA do campo, além de cada linha de fundo (do lado de
// cada gol), empilhadas na vertical (2 perto do gol esquerdo, 2 perto do
// direito), igual ao mockup que o Mateus mandou — de propósito na
// lateral (eixo X), não em cima/embaixo, pra não consumir espaço vertical
// do campo. Uma tentativa anterior colocou isso acima/abaixo da linha de
// fundo (eixo Y), o que encolhia o campo na tela; o Mateus pediu de volta
// pro estilo lateral. Pra isso não cortar no enquadramento padrão, a
// câmera (camera.ts) reserva FIELD.APRON_X de largura extra além de cada
// linha de fundo só pra isso — as placas ficam dentro dessa faixa, com
// folga até a borda dela, e o Y de cada par fica fora da faixa da boca do
// gol (FIELD.GOAL_OPENING) pra não sobrepor a rede.
const PITCH_BOARD_W = 320;
const PITCH_BOARD_H = 180;
const PITCH_BOARD_MARGIN_OUTER_X = 20; // afastamento da linha de fundo (fora do campo)
const PITCH_BOARD_MARGIN_Y = 40; // afastamento da lateral de cima/baixo do campo

const leftX = -PITCH_BOARD_MARGIN_OUTER_X - PITCH_BOARD_W;
const rightX = FIELD.WIDTH + PITCH_BOARD_MARGIN_OUTER_X;
const upperY = PITCH_BOARD_MARGIN_Y;
const lowerY = FIELD.HEIGHT - PITCH_BOARD_MARGIN_Y - PITCH_BOARD_H;

export const FIELD_AD_RECTS: Record<'pitch-nw' | 'pitch-ne' | 'pitch-sw' | 'pitch-se', WorldRect> = {
  'pitch-nw': { x: leftX, y: upperY, w: PITCH_BOARD_W, h: PITCH_BOARD_H },
  'pitch-sw': { x: leftX, y: lowerY, w: PITCH_BOARD_W, h: PITCH_BOARD_H },
  'pitch-ne': { x: rightX, y: upperY, w: PITCH_BOARD_W, h: PITCH_BOARD_H },
  'pitch-se': { x: rightX, y: lowerY, w: PITCH_BOARD_W, h: PITCH_BOARD_H },
};

export const CENTER_WATERMARK_RECT: WorldRect = {
  x: FIELD.WIDTH / 2 - 130,
  y: FIELD.HEIGHT / 2 - 130,
  w: 260,
  h: 260,
};

// Slots de tela — tamanho de referência (spec 10.1); cada tela posiciona
// o elemento dentro do próprio layout, isso aqui é só a proporção alvo.
export const SCREEN_AD_SIZES: Record<'scoreboard-sponsor' | 'loading-hero' | 'endgame-banner' | 'replay-lower-third' | 'menu-footer', { w: number; h: number }> = {
  'scoreboard-sponsor': { w: 160, h: 32 },
  'loading-hero': { w: 640, h: 360 },
  'endgame-banner': { w: 640, h: 100 },
  'replay-lower-third': { w: 400, h: 80 },
  'menu-footer': { w: 728, h: 90 }, // tamanho padrão IAB "leaderboard"
};
