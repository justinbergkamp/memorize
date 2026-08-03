import { itemKey, type CardId, type Role } from './cards';
import type { Outcome } from './events';
import type { RunParams } from './runParams';

// §13 — deliberate defaults, named constants so they're easy to retune.
export const EWMA_ALPHA = 0.2;
export const DIFFICULTY_ACC_WEIGHT = 0.6;
export const DIFFICULTY_LAT_WEIGHT = 0.4;
export const DIFFICULTY_LAT_SCALE = 0.5;
export const DIFFICULTY_BASE_OFFSET = 0.2;
export const MIN_OBSERVATIONS_FOR_ELIGIBILITY = 5;
export const COVERAGE_MIN_OBSERVATIONS = 3;
export const COVERAGE_THRESHOLD = 0.6;
export const DEFAULT_DIFFICULTY = 0.5;
export const PRACTICE_RUN_WEIGHT = 1.5;
export const STANDARD_RUN_WEIGHT = 1.0;
export const TOTAL_ITEMS = 156;

export type ItemStats = {
  card: CardId;
  role: Role;
  acc_ewma: number;
  lat_ewma: number;
  observations: number; // count of accWeight>0 scored events, drives cold-start gates
};

export type ScoredEventInput = {
  card: CardId;
  role: Role;
  outcome: Outcome;
  latency_z?: number;
  committed_at: number;
  accWeight: number;
  latWeight: number;
};

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function ewmaUpdate(prev: number | undefined, value: number, weight: number): number {
  if (weight <= 0) return prev ?? value;
  if (prev === undefined) return value;
  const effectiveAlpha = Math.min(1, EWMA_ALPHA * weight);
  return prev + effectiveAlpha * (value - prev);
}

/** §8.1 difficulty formula, normalized to [0, 1]. */
export function difficultyFromStats(accEwma: number, latEwma: number): number {
  const accTerm = DIFFICULTY_ACC_WEIGHT * (1 - accEwma);
  const latTerm = DIFFICULTY_LAT_WEIGHT * clamp(latEwma / 2, -1, 1) * DIFFICULTY_LAT_SCALE;
  return clamp(accTerm + latTerm + DIFFICULTY_BASE_OFFSET, 0, 1);
}

/**
 * §8.1/§8.2 — builds per-(card,role) EWMA stats from scored quiz events. Events must
 * already be filtered to `scored === true` and enriched with this-run's accuracy/latency
 * weight (§8.2: hand:single -> 0, advance:timed -> 0 for latency only).
 */
export function computeAllItemStats(events: ScoredEventInput[]): Map<string, ItemStats> {
  const sorted = [...events].sort((a, b) => a.committed_at - b.committed_at);
  const stats = new Map<string, ItemStats>();

  for (const ev of sorted) {
    const key = itemKey(ev.card, ev.role);
    const existing = stats.get(key);
    const accValue = ev.outcome === 'correct' ? 1 : 0;

    let acc_ewma = existing?.acc_ewma;
    let lat_ewma = existing?.lat_ewma;
    let observations = existing?.observations ?? 0;

    if (ev.accWeight > 0) {
      acc_ewma = ewmaUpdate(acc_ewma, accValue, ev.accWeight);
      observations += 1;
    }
    if (ev.outcome === 'correct' && ev.latWeight > 0 && ev.latency_z !== undefined) {
      lat_ewma = ewmaUpdate(lat_ewma, ev.latency_z, ev.latWeight);
    }

    stats.set(key, {
      card: ev.card,
      role: ev.role,
      acc_ewma: acc_ewma ?? 1,
      lat_ewma: lat_ewma ?? 0,
      observations,
    });
  }

  return stats;
}

export function isEligibleForDifficultSet(stats: ItemStats | undefined): boolean {
  return (stats?.observations ?? 0) >= MIN_OBSERVATIONS_FOR_ELIGIBILITY;
}

/** The careful difficulty read (§9.1) — used on the Weakest Items screen. */
export function difficultyScore(stats: ItemStats | undefined): number {
  if (!stats || stats.observations === 0) return DEFAULT_DIFFICULTY;
  return difficultyFromStats(stats.acc_ewma, stats.lat_ewma);
}

/** §8.3 cold start — items below the eligibility threshold sample as neutral, not weak. */
export function difficultyForSampling(stats: ItemStats | undefined): number {
  if (!isEligibleForDifficultSet(stats)) return DEFAULT_DIFFICULTY;
  return difficultyScore(stats);
}

/** §8.3 — the `difficult` set unlocks once 60% of the 156 items have >=3 scored observations. */
export function isDifficultSetUnlocked(allStats: Map<string, ItemStats>, totalItems = TOTAL_ITEMS): boolean {
  let covered = 0;
  for (const stats of allStats.values()) {
    if (stats.observations >= COVERAGE_MIN_OBSERVATIONS) covered++;
  }
  return covered / totalItems >= COVERAGE_THRESHOLD;
}

export function resolveRunWeight(isPractice: boolean): number {
  return isPractice ? PRACTICE_RUN_WEIGHT : STANDARD_RUN_WEIGHT;
}

/** §8.2 — hand:single contributes nothing to scoring at all. */
export function accuracyWeight(params: RunParams, runWeight: number): number {
  return params.hand === 'single' ? 0 : runWeight;
}

/** §8.2 — timed memorize advance zeroes out this run's contribution to latency EWMA only. */
export function latencyWeight(params: RunParams, runWeight: number): number {
  if (params.hand === 'single') return 0;
  if (params.advance === 'timed') return 0;
  return runWeight;
}
