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
// posicionadas fora das linhas de fundo superior/inferior, como as
// placas de estádio de verdade, nunca perto da boca do gol (que fica nas
// laterais esquerda/direita, não em cima/embaixo) nem sobre jogadores.
const PITCH_BOARD_W = 320;
const PITCH_BOARD_H = 180;
const PITCH_BOARD_MARGIN = 10; // afastamento da linha de fundo

export const FIELD_AD_RECTS: Record<'pitch-nw' | 'pitch-ne' | 'pitch-sw' | 'pitch-se', WorldRect> = {
  'pitch-nw': { x: 100, y: -PITCH_BOARD_MARGIN - PITCH_BOARD_H, w: PITCH_BOARD_W, h: PITCH_BOARD_H },
  'pitch-ne': { x: FIELD.WIDTH - 100 - PITCH_BOARD_W, y: -PITCH_BOARD_MARGIN - PITCH_BOARD_H, w: PITCH_BOARD_W, h: PITCH_BOARD_H },
  'pitch-sw': { x: 100, y: FIELD.HEIGHT + PITCH_BOARD_MARGIN, w: PITCH_BOARD_W, h: PITCH_BOARD_H },
  'pitch-se': { x: FIELD.WIDTH - 100 - PITCH_BOARD_W, y: FIELD.HEIGHT + PITCH_BOARD_MARGIN, w: PITCH_BOARD_W, h: PITCH_BOARD_H },
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
