import { currentInterval, progressionHistory, type ProgressionPoint } from '@domain/progression';
import { repository } from '@data/dexieRepository';

/** §X — the interval the next progression run will use, derived from run history. */
export async function getProgressionInterval(): Promise<number> {
  return currentInterval(await repository.listRuns());
}

export async function getProgressionHistory(): Promise<ProgressionPoint[]> {
  return progressionHistory(await repository.listRuns());
}
