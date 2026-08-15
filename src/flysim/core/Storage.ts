import { STORAGE_KEYS } from '../config';

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
};
