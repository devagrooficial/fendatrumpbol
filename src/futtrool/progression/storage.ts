// StorageAdapter (spec seção 9): get/set/clear, com LocalStorageAdapter
// agora e ApiStorageAdapter na entrega 2 — trocar a implementação não deve
// exigir mudar quem consome (ProgressionStore).

export interface StorageAdapter {
  get<T>(key: string, fallback: T): T;
  set<T>(key: string, value: T): void;
  clear(key: string): void;
}

export class LocalStorageAdapter implements StorageAdapter {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // localStorage indisponível (modo privado, quota etc.) — falha silenciosa
    }
  }

  clear(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // idem
    }
  }
}

export type ProgressionState = {
  coins: number;
  level: number;
  levelXp: number;
  winStreak: number;
};

export const DEFAULT_PROGRESSION: ProgressionState = {
  coins: 0,
  level: 1,
  levelXp: 0,
  winStreak: 0,
};

const PROGRESSION_KEY = 'futtrool.progression';

export class ProgressionStore {
  private readonly adapter: StorageAdapter;

  constructor(adapter: StorageAdapter = new LocalStorageAdapter()) {
    this.adapter = adapter;
  }

  load(): ProgressionState {
    return this.adapter.get(PROGRESSION_KEY, DEFAULT_PROGRESSION);
  }

  save(state: ProgressionState): void {
    this.adapter.set(PROGRESSION_KEY, state);
  }

  reset(): void {
    this.adapter.clear(PROGRESSION_KEY);
  }
}
