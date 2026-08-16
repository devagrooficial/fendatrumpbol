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
// posicionadas FORA do campo, acima/abaixo da linha de fundo, coladas no
// canto de cada gol (2 perto do gol esquerdo, 2 perto do direito), igual
// às capturas de tela de referência (ver docs/NOTES.md, seção 3) — como
// as placas de perímetro de um estádio de verdade, que ficam do lado de
// fora da linha branca. Uma primeira tentativa colocou isso pra dentro do
// campo; o Mateus corrigiu de novo depois de comparar com o print: tem
// que ser fora. Pra isso não cortar no enquadramento padrão, a câmera
// (camera.ts) agora reserva FIELD.APRON_Y de altura extra acima/abaixo do
// campo só pra isso — as placas ficam dentro dessa faixa, com folga até a
// borda dela.
const PITCH_BOARD_W = 320;
const PITCH_BOARD_H = 180;
const PITCH_BOARD_MARGIN_X = 40; // afastamento da lateral esquerda/direita do campo
const PITCH_BOARD_MARGIN_INNER_Y = 20; // afastamento da linha de fundo (dentro da faixa fora do campo)

const topY = -PITCH_BOARD_MARGIN_INNER_Y - PITCH_BOARD_H;
const bottomY = FIELD.HEIGHT + PITCH_BOARD_MARGIN_INNER_Y;
const leftX = PITCH_BOARD_MARGIN_X;
const rightX = FIELD.WIDTH - PITCH_BOARD_MARGIN_X - PITCH_BOARD_W;

export const FIELD_AD_RECTS: Record<'pitch-nw' | 'pitch-ne' | 'pitch-sw' | 'pitch-se', WorldRect> = {
  'pitch-nw': { x: leftX, y: topY, w: PITCH_BOARD_W, h: PITCH_BOARD_H },
  'pitch-sw': { x: leftX, y: bottomY, w: PITCH_BOARD_W, h: PITCH_BOARD_H },
  'pitch-ne': { x: rightX, y: topY, w: PITCH_BOARD_W, h: PITCH_BOARD_H },
  'pitch-se': { x: rightX, y: bottomY, w: PITCH_BOARD_W, h: PITCH_BOARD_H },
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
  'menu-footer': { w: 400, h: 90 },
};
