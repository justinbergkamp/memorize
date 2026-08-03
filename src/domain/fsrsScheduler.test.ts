import { describe, expect, it } from 'vitest';
import { nextFsrsCardState } from './fsrsScheduler';

describe('nextFsrsCardState (§8.4)', () => {
  it('creates a fresh schedule from null and advances reps', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const state = nextFsrsCardState(null, 3, now);
    expect(state.reps).toBe(1);
    expect(state.due.getTime()).toBeGreaterThan(now.getTime());
  });

  it('an Again (1) grade schedules sooner than an Easy (4) grade', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const seed = nextFsrsCardState(null, 3, now);
    const again = nextFsrsCardState(seed, 1, new Date(now.getTime() + 86400000));
    const easy = nextFsrsCardState(seed, 4, new Date(now.getTime() + 86400000));
    expect(again.due.getTime()).toBeLessThan(easy.due.getTime());
  });
});
