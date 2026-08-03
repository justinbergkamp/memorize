import { describe, expect, it } from 'vitest';
import {
  accuracyWeight,
  computeAllItemStats,
  difficultyForSampling,
  difficultyFromStats,
  isDifficultSetUnlocked,
  isEligibleForDifficultSet,
  latencyWeight,
  MIN_OBSERVATIONS_FOR_ELIGIBILITY,
  type ScoredEventInput,
} from './scorer';
import type { RunParams } from './runParams';

describe('difficultyFromStats (§8.1)', () => {
  it('is 0 for a perfect, fast item', () => {
    expect(difficultyFromStats(1, -2)).toBeCloseTo(0, 5);
  });

  it('is 1 for a consistently missed, slow item', () => {
    expect(difficultyFromStats(0, 2)).toBeCloseTo(1, 5);
  });

  it('stays within [0, 1] for out-of-range latency ewma', () => {
    expect(difficultyFromStats(0.5, 10)).toBeLessThanOrEqual(1);
    expect(difficultyFromStats(0.5, -10)).toBeGreaterThanOrEqual(0);
  });
});

describe('computeAllItemStats and eligibility (§8.3)', () => {
  function ev(overrides: Partial<ScoredEventInput>): ScoredEventInput {
    return {
      card: 'AS',
      role: 'P',
      outcome: 'correct',
      committed_at: 0,
      accWeight: 1,
      latWeight: 1,
      ...overrides,
    };
  }

  it('an item needs >=5 scored observations to be eligible for the difficult set', () => {
    const events = Array.from({ length: 4 }, (_, i) => ev({ committed_at: i }));
    const stats = computeAllItemStats(events);
    expect(isEligibleForDifficultSet(stats.get('AS:P'))).toBe(false);

    const fiveEvents = Array.from({ length: 5 }, (_, i) => ev({ committed_at: i }));
    const stats5 = computeAllItemStats(fiveEvents);
    expect(isEligibleForDifficultSet(stats5.get('AS:P'))).toBe(true);
    expect(MIN_OBSERVATIONS_FOR_ELIGIBILITY).toBe(5);
  });

  it('ineligible items sample as neutral (0.5), not as weak', () => {
    const events = [ev({ outcome: 'blank', committed_at: 0 })];
    const stats = computeAllItemStats(events);
    expect(difficultyForSampling(stats.get('AS:P'))).toBe(0.5);
  });

  it('weight-0 events (hand:single) do not contribute observations', () => {
    const events = Array.from({ length: 10 }, (_, i) => ev({ committed_at: i, accWeight: 0, latWeight: 0 }));
    const stats = computeAllItemStats(events);
    expect(stats.get('AS:P')?.observations ?? 0).toBe(0);
  });

  it('difficult set unlocks at 60% coverage with >=3 observations each', () => {
    const events: ScoredEventInput[] = [];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T'];
    for (const rank of ranks) {
      for (let i = 0; i < 3; i++) {
        events.push(ev({ card: `${rank}S`, committed_at: i }));
      }
    }
    const stats = computeAllItemStats(events);
    // 10 of 156 items covered — nowhere near 60%.
    expect(isDifficultSetUnlocked(stats)).toBe(false);
  });
});

describe('run weight resolution (§8.2)', () => {
  const triplet: RunParams = { set: 'full', hand: 'triplet', advance: 'tap', count: 52, quizzed: true };

  it('hand:single contributes 0 to both accuracy and latency', () => {
    const single: RunParams = { ...triplet, hand: 'single', quizzed: false };
    expect(accuracyWeight(single, 1.5)).toBe(0);
    expect(latencyWeight(single, 1.5)).toBe(0);
  });

  it('advance:timed zeroes latency only, accuracy still counts at run weight', () => {
    const timed: RunParams = { ...triplet, advance: 'timed', timed_ms: 3000 };
    expect(accuracyWeight(timed, 1.0)).toBe(1.0);
    expect(latencyWeight(timed, 1.0)).toBe(0);
  });

  it('a standard tap/triplet run counts fully toward both', () => {
    expect(accuracyWeight(triplet, 1.0)).toBe(1.0);
    expect(latencyWeight(triplet, 1.0)).toBe(1.0);
  });
});
