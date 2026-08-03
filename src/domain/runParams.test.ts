import { describe, expect, it } from 'vitest';
import { resolveCardCount, resolveUnitCount, validateParamShape, type RunParams } from './runParams';

describe('count rounding (§4.4)', () => {
  it('rounds triplet card counts up to whole triplets', () => {
    expect(resolveCardCount(13, 'triplet')).toBe(15);
    expect(resolveCardCount(26, 'triplet')).toBe(27);
  });

  it('the full-deck remainder is 51 + 1 lone card, not 54', () => {
    expect(resolveCardCount(52, 'triplet')).toBe(52);
  });

  it('unit counts are triplets (+1 lone unit for the 52-card remainder)', () => {
    expect(resolveUnitCount(13, 'triplet')).toBe(5);
    expect(resolveUnitCount(26, 'triplet')).toBe(9);
    expect(resolveUnitCount(52, 'triplet')).toBe(18); // 17 triplets + 1 lone card
  });

  it('single mode uses the exact count', () => {
    expect(resolveUnitCount(13, 'single')).toBe(13);
    expect(resolveUnitCount(26, 'single')).toBe(26);
    expect(resolveUnitCount(52, 'single')).toBe(52);
  });

  it('unlimited has no fixed length', () => {
    expect(resolveUnitCount('unlimited', 'triplet')).toBe('unlimited');
    expect(resolveCardCount('unlimited', 'single')).toBe('unlimited');
  });
});

describe('disallowed combinations (§4.2)', () => {
  const base: RunParams = { set: 'full', hand: 'triplet', advance: 'tap', count: 52, quizzed: true };

  it('rejects quizzed + unlimited', () => {
    const result = validateParamShape({ ...base, count: 'unlimited' });
    expect(result.valid).toBe(false);
  });

  it('rejects quizzed + single', () => {
    const result = validateParamShape({ ...base, hand: 'single' });
    expect(result.valid).toBe(false);
  });

  it('accepts unquizzed + unlimited + single', () => {
    const result = validateParamShape({ ...base, hand: 'single', count: 'unlimited', quizzed: false });
    expect(result.valid).toBe(true);
  });

  it('requires an interval for timed advance', () => {
    const result = validateParamShape({ ...base, advance: 'timed', quizzed: false });
    expect(result.valid).toBe(false);
  });

  it('accepts timed advance with an interval', () => {
    const result = validateParamShape({ ...base, advance: 'timed', timed_ms: 3000, quizzed: false });
    expect(result.valid).toBe(true);
  });
});
