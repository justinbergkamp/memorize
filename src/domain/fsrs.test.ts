import { describe, expect, it } from 'vitest';
import { computeLatencyZ, deriveFsrsGrade, pushLatency, LATENCY_WINDOW_SIZE } from './fsrs';

describe('computeLatencyZ', () => {
  it('is undefined with no window history', () => {
    expect(computeLatencyZ(1000, [])).toBeUndefined();
  });

  it('computes a positive z for a slower-than-average latency', () => {
    const window = [1000, 1000, 1000, 1000, 3000];
    const z = computeLatencyZ(5000, window);
    expect(z).toBeGreaterThan(0);
  });
});

describe('pushLatency window', () => {
  it('caps at LATENCY_WINDOW_SIZE, dropping oldest first', () => {
    let window: number[] = [];
    for (let i = 0; i < LATENCY_WINDOW_SIZE + 10; i++) {
      window = pushLatency(window, i);
    }
    expect(window).toHaveLength(LATENCY_WINDOW_SIZE);
    expect(window[0]).toBe(10);
    expect(window[window.length - 1]).toBe(LATENCY_WINDOW_SIZE + 9);
  });
});

describe('deriveFsrsGrade (§7.3)', () => {
  it('blank and wrong_card are always Again (1)', () => {
    expect(deriveFsrsGrade('blank', undefined, 50)).toBe(1);
    expect(deriveFsrsGrade('wrong_card', 5, 50)).toBe(1);
  });

  it('cold start: correct is always Good (3) below 30 observations', () => {
    expect(deriveFsrsGrade('correct', 3, 10)).toBe(3);
    expect(deriveFsrsGrade('correct', -3, 29)).toBe(3);
  });

  it('correct with z > 1 is Hard (2) once warm', () => {
    expect(deriveFsrsGrade('correct', 1.5, 30)).toBe(2);
  });

  it('correct with z in [-1, 1] is Good (3) once warm', () => {
    expect(deriveFsrsGrade('correct', 0, 30)).toBe(3);
    expect(deriveFsrsGrade('correct', 1, 30)).toBe(3);
    expect(deriveFsrsGrade('correct', -1, 30)).toBe(3);
  });

  it('correct with z < -1 is Easy (4) once warm', () => {
    expect(deriveFsrsGrade('correct', -1.5, 30)).toBe(4);
  });
});
