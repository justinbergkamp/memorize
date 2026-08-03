import type { RunHeader } from '@domain/events';
import { accuracyWeight, computeAllItemStats, isDifficultSetUnlocked, latencyWeight, type ItemStats, type ScoredEventInput } from '@domain/scorer';
import { repository } from '@data/dexieRepository';

/**
 * Builds per-(card,role) EWMA stats from every complete run's scored quiz events,
 * each weighted per §8.2. Aborted runs are excluded (§9.3 default).
 */
export async function getItemDifficultyMap(): Promise<Map<string, ItemStats>> {
  const [runs, quizEvents] = await Promise.all([repository.listRuns(), repository.getAllQuizEvents()]);
  const headersById = new Map<string, RunHeader>(runs.filter((r) => r.status === 'complete').map((r) => [r.id, r]));

  const inputs: ScoredEventInput[] = [];
  for (const ev of quizEvents) {
    if (!ev.scored) continue;
    const header = headersById.get(ev.run_id);
    if (!header) continue;
    inputs.push({
      card: ev.card,
      role: ev.role,
      outcome: ev.outcome,
      latency_z: ev.latency_z,
      committed_at: ev.committed_at,
      accWeight: accuracyWeight(header.params, header.weight),
      latWeight: latencyWeight(header.params, header.weight),
    });
  }

  return computeAllItemStats(inputs);
}

export async function getDifficultSetUnlocked(): Promise<boolean> {
  const stats = await getItemDifficultyMap();
  return isDifficultSetUnlocked(stats);
}
