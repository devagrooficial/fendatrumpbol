import { AVATAR_COLOR_PALETTE, DEFAULT_AVATAR_COLOR } from '../core/constants';
import type { AvatarColor, AvatarColorMode } from '../core/types';
import { LocalStorageAdapter, type StorageAdapter } from './storage';

const AVATAR_COLOR_KEY = 'futtrool.avatarColor';

const MODE_COLOR_COUNT: Record<AvatarColorMode, number> = { solid: 1, duo: 2, gradient: 2 };

// Só aceita paleta oficial (ver core/constants.ts AVATAR_COLOR_PALETTE) e
// quantidade de cores batendo com o modo — cai no padrão pra qualquer
// coisa fora disso (localStorage adulterado, versão antiga do formato).
function clampToPalette(color: AvatarColor): AvatarColor {
  const mode: AvatarColorMode = ['solid', 'duo', 'gradient'].includes(color?.mode) ? color.mode : DEFAULT_AVATAR_COLOR.mode;
  const needed = MODE_COLOR_COUNT[mode];
  const valid = Array.isArray(color?.colors) ? color.colors.filter((c) => AVATAR_COLOR_PALETTE.includes(c)) : [];
  const colors = Array.from({ length: needed }, (_, i) => valid[i] ?? AVATAR_COLOR_PALETTE[i % AVATAR_COLOR_PALETTE.length]!); // módulo garante índice válido
  return { mode, colors };
}

export class AvatarColorStore {
  private readonly adapter: StorageAdapter;

  constructor(adapter: StorageAdapter = new LocalStorageAdapter()) {
    this.adapter = adapter;
  }

  load(): AvatarColor {
    return clampToPalette(this.adapter.get(AVATAR_COLOR_KEY, DEFAULT_AVATAR_COLOR));
  }

  save(color: AvatarColor): void {
    this.adapter.set(AVATAR_COLOR_KEY, clampToPalette(color));
  }
}
