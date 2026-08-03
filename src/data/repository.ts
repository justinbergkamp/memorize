import type { CardId } from '@domain/cards';
import type { MemorizeEvent, QuizEvent, RunHeader, RunRollup, RunStatus, SceneEvent } from '@domain/events';
import type { FsrsCardState } from '@domain/fsrsScheduler';
import type { PaoEntry } from './db';

export type PaoText = { person: string; action: string; object: string };

export type ConfigExport = {
  schema_version: 1;
  pao: Record<CardId, PaoText>;
};

export type FullExport = {
  schema_version: 1;
  exported_at: number;
  config: ConfigExport;
  runs: RunHeader[];
  memorize_events: MemorizeEvent[];
  scene_events: SceneEvent[];
  quiz_events: QuizEvent[];
};

export type RunEvents = {
  memorize: MemorizeEvent[];
  scene: SceneEvent[];
  quiz: QuizEvent[];
};

/**
 * Persistence boundary. Everything above /data talks to this interface, never to Dexie
 * directly, so storage can be swapped (SQLite via Capacitor, etc.) without touching /domain or /ui.
 */
export interface PaoRepository {
  getAllPaoEntries(): Promise<PaoEntry[]>;
  upsertPaoEntry(card: CardId, text: PaoText): Promise<void>;
  getConfigProgress(): Promise<{ filled: number; total: number }>;
  exportConfig(): Promise<ConfigExport>;
  importConfig(data: ConfigExport): Promise<void>;

  createRun(header: RunHeader): Promise<void>;
  appendMemorizeEvent(event: MemorizeEvent): Promise<void>;
  appendSceneEvent(event: SceneEvent): Promise<void>;
  appendQuizEvent(event: QuizEvent): Promise<void>;
  closeRun(runId: string, status: RunStatus, ended_at: number, rollup?: RunRollup): Promise<void>;

  listRuns(): Promise<RunHeader[]>;
  getRun(runId: string): Promise<RunHeader | undefined>;
  getRunEvents(runId: string): Promise<RunEvents>;
  getAllQuizEvents(): Promise<QuizEvent[]>;

  getLatencyWindow(): Promise<number[]>;
  setLatencyWindow(window: number[]): Promise<void>;

  getFsrsCard(itemKey: string): Promise<FsrsCardState | undefined>;
  setFsrsCard(itemKey: string, state: FsrsCardState): Promise<void>;

  exportAll(): Promise<FullExport>;
  importAll(data: FullExport): Promise<void>;
}
