// Duração e limite de gol escolhidos pela pessoa (pedido: "quero dar a
// opção de escolher a quantidade de tempo" / "escolher o limite de gol,
// com no mínimo 3 gols") — persiste local (mesmo padrão do
// ProgressionStore), então uma vez escolhido continua valendo pras
// próximas partidas sem precisar escolher de novo toda hora. Em modo
// online, quem cria a sala/entra na fila é quem decide (mesmo padrão já
// usado pro tamanho do time) — ver goToCreateOnlineRoom/goToOnlineMatchmaking
// em main.ts.

import { MATCH, MATCH_SETTINGS_OPTIONS } from '../core/constants';
import type { MatchSettings } from '../core/types';
import { LocalStorageAdapter, type StorageAdapter } from './storage';

export const DEFAULT_MATCH_SETTINGS: MatchSettings = {
  durationMs: MATCH.DURATION_MS,
  goalsToWin: MATCH.GOALS_TO_WIN,
};

const MATCH_SETTINGS_KEY = 'futtrool.matchSettings';

function clampToOptions(settings: MatchSettings): MatchSettings {
  const durationMs = MATCH_SETTINGS_OPTIONS.durationsMs.includes(settings.durationMs)
    ? settings.durationMs
    : DEFAULT_MATCH_SETTINGS.durationMs;
  const goalsToWin = MATCH_SETTINGS_OPTIONS.goalLimits.includes(settings.goalsToWin)
    ? settings.goalsToWin
    : DEFAULT_MATCH_SETTINGS.goalsToWin;
  return { durationMs, goalsToWin };
}

export class MatchSettingsStore {
  private readonly adapter: StorageAdapter;

  constructor(adapter: StorageAdapter = new LocalStorageAdapter()) {
    this.adapter = adapter;
  }

  load(): MatchSettings {
    // clampToOptions protege contra um valor salvo de uma versão anterior
    // que não bate mais com as opções atuais (ex.: mudamos os presets).
    return clampToOptions(this.adapter.get(MATCH_SETTINGS_KEY, DEFAULT_MATCH_SETTINGS));
  }

  save(settings: MatchSettings): void {
    this.adapter.set(MATCH_SETTINGS_KEY, clampToOptions(settings));
  }
}
