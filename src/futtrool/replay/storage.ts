// Salvar/listar replays (spec seção 8): serializa o buffer em localStorage,
// máximo de REPLAY.MAX_SAVED, com data e placar. Reaproveita o
// StorageAdapter da progressão — a interface já é genérica o bastante.

import { LocalStorageAdapter, type StorageAdapter } from '../progression/storage';
import { REPLAY } from '../core/constants';
import type { ReplaySnapshot } from './buffer';

export type SavedReplay = {
  id: string;
  savedAt: string; // ISO 8601
  score: { p1: number; p2: number };
  snapshots: ReplaySnapshot[];
};

const REPLAYS_KEY = 'futtrool.replays';

function generateId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export class ReplayStore {
  private readonly adapter: StorageAdapter;

  constructor(adapter: StorageAdapter = new LocalStorageAdapter()) {
    this.adapter = adapter;
  }

  list(): SavedReplay[] {
    return this.adapter.get<SavedReplay[]>(REPLAYS_KEY, []);
  }

  save(score: { p1: number; p2: number }, snapshots: ReplaySnapshot[]): SavedReplay {
    const saved: SavedReplay = { id: generateId(), savedAt: new Date().toISOString(), score, snapshots };
    const next = [saved, ...this.list()].slice(0, REPLAY.MAX_SAVED);
    this.adapter.set(REPLAYS_KEY, next);
    return saved;
  }

  remove(id: string): void {
    this.adapter.set(
      REPLAYS_KEY,
      this.list().filter((r) => r.id !== id),
    );
  }
}
