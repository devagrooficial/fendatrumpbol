// Matemática de vetor 2D compartilhada entre physics.ts e rules.ts. Extraído
// pra fora de physics.ts pra não duplicar quando rules.ts precisou dos
// mesmos helpers (nudge do anti-degenerescência).

import type { Vec2 } from './types';

export function length(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

export function normalize(v: Vec2): Vec2 {
  const len = length(v);
  return len > 1e-6 ? { x: v.x / len, y: v.y / len } : { x: 0, y: 0 };
}

export function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function clampLength(v: Vec2, max: number): Vec2 {
  const len = length(v);
  return len > max ? scale(v, max / len) : v;
}
