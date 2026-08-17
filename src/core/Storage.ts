import { STORAGE_KEYS } from '../config';
import { CHARACTER_ORDER, DEFAULT_CHARACTER, type CharacterId } from '../entities/characters';

function readNumber(key: string): number {
  try {
    const raw = localStorage.getItem(key);
    const value = raw === null ? 0 : Number(raw);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function writeNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // localStorage indisponível (modo privado, quota cheia, etc.) — falha silenciosa
  }
}

export const Storage = {
  getHighscore(): number {
    return readNumber(STORAGE_KEYS.HIGHSCORE);
  },

  /** Persiste o novo recorde só se ele bater o atual; retorna se bateu. */
  setHighscoreIfBetter(score: number): boolean {
    if (score <= readNumber(STORAGE_KEYS.HIGHSCORE)) return false;
    writeNumber(STORAGE_KEYS.HIGHSCORE, score);
    return true;
  },

  getTotalCoins(): number {
    return readNumber(STORAGE_KEYS.TOTAL_COINS);
  },

  /** Soma ao total acumulado de moedas e retorna o novo total. */
  addCoins(amount: number): number {
    const total = readNumber(STORAGE_KEYS.TOTAL_COINS) + amount;
    writeNumber(STORAGE_KEYS.TOTAL_COINS, total);
    return total;
  },

  getTotalGems(): number {
    return readNumber(STORAGE_KEYS.TOTAL_GEMS);
  },

  /** Soma ao total acumulado de gemas e retorna o novo total. */
  addGems(amount: number): number {
    const total = readNumber(STORAGE_KEYS.TOTAL_GEMS) + amount;
    writeNumber(STORAGE_KEYS.TOTAL_GEMS, total);
    return total;
  },

  getSelectedCharacter(): CharacterId {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CHARACTER);
      if (raw && (CHARACTER_ORDER as readonly string[]).includes(raw)) return raw as CharacterId;
    } catch {
      // localStorage indisponível — usa o padrão
    }
    return DEFAULT_CHARACTER;
  },

  setSelectedCharacter(id: CharacterId): void {
    try {
      localStorage.setItem(STORAGE_KEYS.CHARACTER, id);
    } catch {
      // localStorage indisponível — falha silenciosa
    }
  },
};
