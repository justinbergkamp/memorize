import Dexie, { type Table } from 'dexie';
import type { CardId } from '@domain/cards';
import type { MemorizeEvent, QuizEvent, RunHeader, SceneEvent } from '@domain/events';
import type { FsrsCardState } from '@domain/fsrsScheduler';

export type PaoEntry = {
  card: CardId; // primary key
  person: string;
  action: string;
  object: string;
  updated_at: number;
};

export const CONFIG_SCHEMA_VERSION = 1 as const;

/** One row, singleton settings (rolling latency window etc.), keyed by `id: 'settings'`. */
export type AppSettings = {
  id: 'settings';
  latency_window: number[]; // last N correct-quiz latencies, most recent last (§7.3)
};

/** Per-(card,role) FSRS schedule (§8.4), keyed as `${card}:${role}`. */
export type FsrsCardRow = {
  key: string;
  state: FsrsCardState;
};

class PaoDatabase extends Dexie {
  pao!: Table<PaoEntry, string>;
  runs!: Table<RunHeader, string>;
  memorizeEvents!: Table<MemorizeEvent, number>;
  sceneEvents!: Table<SceneEvent, number>;
  quizEvents!: Table<QuizEvent, number>;
  settings!: Table<AppSettings, string>;
  fsrsCards!: Table<FsrsCardRow, string>;

  constructor() {
    super('pao-card-trainer');
    this.version(1).stores({
      pao: 'card',
      runs: 'id, started_at, status',
      memorizeEvents: '++id, run_id, unit_index',
      sceneEvents: '++id, run_id, triplet_index',
      quizEvents: '++id, run_id, sequence_index, card, role, scored, committed_at',
      settings: 'id',
      fsrsCards: 'key',
    });
  }
}

export const db = new PaoDatabase();
