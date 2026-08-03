import { describe, expect, it } from 'vitest';
import { computeMemorizeTicks, computeQuizTicks } from './ribbon';
import type { QuizEvent } from './events';

function ev(overrides: Partial<QuizEvent>): QuizEvent {
  return {
    run_id: 'r',
    sequence_index: 0,
    triplet_index: 0,
    position_in_triplet: 0,
    card: 'AS',
    role: 'P',
    outcome: 'correct',
    revealed_at: 0,
    committed_at: 0,
    latency_ms: 0,
    fsrs_grade: 3,
    scored: true,
    grading: 'self',
    ...overrides,
  };
}

describe('computeMemorizeTicks', () => {
  it('fills up to cardsShown, leaves the rest pending', () => {
    const ticks = computeMemorizeTicks(6, 3);
    expect(ticks).toEqual(['filled', 'filled', 'filled', 'pending', 'pending', 'pending']);
  });
});

describe('computeQuizTicks (§11.4 ribbon)', () => {
  it('colors ticks by outcome', () => {
    const events = [
      ev({ sequence_index: 0, outcome: 'correct', scored: true, triplet_index: 0, position_in_triplet: 0 }),
      ev({ sequence_index: 1, outcome: 'wrong_card', scored: true, triplet_index: 0, position_in_triplet: 1 }),
      ev({ sequence_index: 2, outcome: 'blank', scored: true, triplet_index: 0, position_in_triplet: 2 }),
    ];
    const { ticks } = computeQuizTicks(3, events);
    expect(ticks).toEqual(['correct', 'wrong_card', 'blank']);
  });

  it('merges a collapsed scene into one unbroken slate span', () => {
    const events = [
      ev({ sequence_index: 0, outcome: 'blank', scored: false, triplet_index: 0, position_in_triplet: 0 }),
      ev({ sequence_index: 1, outcome: 'correct', scored: false, triplet_index: 0, position_in_triplet: 1 }),
      ev({ sequence_index: 2, outcome: 'correct', scored: false, triplet_index: 0, position_in_triplet: 2 }),
    ];
    const { ticks, mergeWithPrev } = computeQuizTicks(3, events);
    expect(ticks).toEqual(['blank', 'blank', 'blank']);
    expect(mergeWithPrev).toEqual([false, true, true]);
  });
});
