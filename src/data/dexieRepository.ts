import { fullDeck, type CardId } from '@domain/cards';
import type { MemorizeEvent, QuizEvent, RunHeader, RunRollup, RunStatus, SceneEvent } from '@domain/events';
import type { FsrsCardState } from '@domain/fsrsScheduler';
import { CONFIG_SCHEMA_VERSION, db, type PaoEntry } from './db';
import type { ConfigExport, FullExport, PaoRepository, PaoText, RunEvents } from './repository';

export class DexieRepository implements PaoRepository {
  async getAllPaoEntries(): Promise<PaoEntry[]> {
    return db.pao.toArray();
  }

  async upsertPaoEntry(card: CardId, text: PaoText): Promise<void> {
    await db.pao.put({ card, ...text, updated_at: Date.now() });
  }

  async getConfigProgress(): Promise<{ filled: number; total: number }> {
    const entries = await db.pao.toArray();
    const byCard = new Map(entries.map((e) => [e.card, e]));
    let filled = 0;
    for (const card of fullDeck()) {
      const e = byCard.get(card);
      if (e && e.person.trim() && e.action.trim() && e.object.trim()) filled++;
    }
    return { filled, total: 52 };
  }

  async exportConfig(): Promise<ConfigExport> {
    const entries = await db.pao.toArray();
    const pao: Record<CardId, PaoText> = {};
    for (const e of entries) {
      pao[e.card] = { person: e.person, action: e.action, object: e.object };
    }
    return { schema_version: CONFIG_SCHEMA_VERSION, pao };
  }

  async importConfig(data: ConfigExport): Promise<void> {
    if (data.schema_version !== CONFIG_SCHEMA_VERSION) {
      throw new Error(`Unsupported config schema version: ${data.schema_version}`);
    }
    const now = Date.now();
    const rows: PaoEntry[] = Object.entries(data.pao).map(([card, text]) => ({
      card,
      person: text.person,
      action: text.action,
      object: text.object,
      updated_at: now,
    }));
    await db.pao.bulkPut(rows);
  }

  async createRun(header: RunHeader): Promise<void> {
    await db.runs.put(header);
  }

  async appendMemorizeEvent(event: MemorizeEvent): Promise<void> {
    await db.memorizeEvents.add(event);
  }

  async appendSceneEvent(event: SceneEvent): Promise<void> {
    await db.sceneEvents.add(event);
  }

  async appendQuizEvent(event: QuizEvent): Promise<void> {
    await db.quizEvents.add(event);
  }

  async closeRun(runId: string, status: RunStatus, ended_at: number, rollup?: RunRollup): Promise<void> {
    await db.runs.update(runId, { status, ended_at, rollup });
  }

  async listRuns(): Promise<RunHeader[]> {
    const runs = await db.runs.orderBy('started_at').reverse().toArray();
    return runs;
  }

  async getRun(runId: string): Promise<RunHeader | undefined> {
    return db.runs.get(runId);
  }

  async getRunEvents(runId: string): Promise<RunEvents> {
    const [memorize, scene, quiz] = await Promise.all([
      db.memorizeEvents.where('run_id').equals(runId).sortBy('unit_index'),
      db.sceneEvents.where('run_id').equals(runId).sortBy('triplet_index'),
      db.quizEvents.where('run_id').equals(runId).sortBy('sequence_index'),
    ]);
    return { memorize, scene, quiz };
  }

  async getAllQuizEvents(): Promise<QuizEvent[]> {
    return db.quizEvents.toArray();
  }

  async getLatencyWindow(): Promise<number[]> {
    const row = await db.settings.get('settings');
    return row?.latency_window ?? [];
  }

  async setLatencyWindow(window: number[]): Promise<void> {
    await db.settings.put({ id: 'settings', latency_window: window });
  }

  async getFsrsCard(itemKey: string): Promise<FsrsCardState | undefined> {
    const row = await db.fsrsCards.get(itemKey);
    return row?.state;
  }

  async setFsrsCard(itemKey: string, state: FsrsCardState): Promise<void> {
    await db.fsrsCards.put({ key: itemKey, state });
  }

  async exportAll(): Promise<FullExport> {
    const [config, runs, memorize_events, scene_events, quiz_events] = await Promise.all([
      this.exportConfig(),
      db.runs.toArray(),
      db.memorizeEvents.toArray(),
      db.sceneEvents.toArray(),
      db.quizEvents.toArray(),
    ]);
    return {
      schema_version: CONFIG_SCHEMA_VERSION,
      exported_at: Date.now(),
      config,
      runs,
      memorize_events,
      scene_events,
      quiz_events,
    };
  }

  async importAll(data: FullExport): Promise<void> {
    if (data.schema_version !== CONFIG_SCHEMA_VERSION) {
      throw new Error(`Unsupported export schema version: ${data.schema_version}`);
    }
    await db.transaction(
      'rw',
      [db.pao, db.runs, db.memorizeEvents, db.sceneEvents, db.quizEvents],
      async () => {
        await this.importConfig(data.config);
        await db.runs.bulkPut(data.runs);
        await db.memorizeEvents.bulkPut(data.memorize_events);
        await db.sceneEvents.bulkPut(data.scene_events);
        await db.quizEvents.bulkPut(data.quiz_events);
      },
    );
  }
}

export const repository = new DexieRepository();
