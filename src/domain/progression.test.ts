import { describe, expect, it } from 'vitest';
import type { Outcome, QuizEvent, SceneEvent } from './events';
import { deriveSceneScoring } from './contamination';
import {
  PROGRESSION_FLOOR_S,
  PROGRESSION_START_INTERVAL_S,
  PROGRESSION_STEP_S,
  countsTowardProgression,
  currentInterval,
  isCleanRun,
  nextInterval,
  progressionHistory,
  progressionParams,
  remainingMs,
  type ProgressionRunInput,
} from './progression';
import { validateParamShape } from './runParams';

// ---- fixtures -------------------------------------------------------------------------------

function quiz(seq: number, outcome: Outcome, scored = true): QuizEvent {
  return {
    run_id: 'r',
    sequence_index: seq,
    triplet_index: seq < 51 ? Math.floor(seq / 3) : -1,
    position_in_triplet: (seq < 51 ? seq % 3 : 0) as 0 | 1 | 2,
    card: 'AS',
    role: 'P',
    outcome,
    revealed_at: 0,
    committed_at: 0,
    latency_ms: 0,
    fsrs_grade: outcome === 'correct' ? 3 : 1,
    scored,
    grading: 'self',
  };
}

function scene(triplet: number, retrieved = true): SceneEvent {
  return { run_id: 'r', triplet_index: triplet, retrieved, latency_ms: 0 };
}

/** A 52-card run (17 triplets + lone card) with every card correct, optionally patched. */
function fullRun(patch: Record<number, Partial<QuizEvent>> = {}) {
  const quizEvents = Array.from({ length: 52 }, (_, i) => ({ ...quiz(i, 'correct'), ...patch[i] }));
  const sceneEvents = Array.from({ length: 17 }, (_, t) => scene(t));
  return { quizEvents, sceneEvents, expectedCards: 52 };
}

/** What the store writes when position 0 of triplet `t` is graded blank: pos 0 blank, pos 1-2 free unscored corrects. */
function collapsedTriplet(t: number) {
  const scoring = deriveSceneScoring('blank');
  return {
    quiz: {
      [t * 3]: { outcome: 'blank' as const, scored: scoring.scored[0] },
      [t * 3 + 1]: { outcome: 'correct' as const, scored: scoring.scored[1] },
      [t * 3 + 2]: { outcome: 'correct' as const, scored: scoring.scored[2] },
    },
    scene: { triplet_index: t, retrieved: scoring.retrieved },
  };
}

let nextStart = 1000;
function progressionRun(
  interval_s: number,
  clean: boolean,
  extra: Partial<ProgressionRunInput> = {},
): ProgressionRunInput {
  nextStart += 1000;
  return {
    id: `run-${nextStart}`,
    started_at: nextStart,
    status: 'complete',
    progression: { interval_s, clean },
    ...extra,
  };
}

// ---- isCleanRun -----------------------------------------------------------------------------

describe('isCleanRun', () => {
  it('a run of 52 corrects is clean', () => {
    expect(isCleanRun(fullRun())).toBe(true);
  });

  it('one blank anywhere breaks it', () => {
    expect(isCleanRun(fullRun({ 20: { outcome: 'blank' } }))).toBe(false);
  });

  it('one wrong_card anywhere breaks it, even the lone last card', () => {
    expect(isCleanRun(fullRun({ 7: { outcome: 'wrong_card' } }))).toBe(false);
    expect(isCleanRun(fullRun({ 51: { outcome: 'wrong_card' } }))).toBe(false);
  });

  it('a wrong_card at position 0 (scene retrieved, all scored) still breaks it', () => {
    expect(isCleanRun(fullRun({ 30: { outcome: 'wrong_card', scored: true } }))).toBe(false);
  });

  it('a contaminated triplet breaks it: positions 1-2 are free corrects but unscored', () => {
    const c = collapsedTriplet(4);
    const run = fullRun(c.quiz);
    run.sceneEvents[4] = scene(4, c.scene.retrieved);
    // Only position 0 is a blank here; 1 and 2 read as 'correct'. The run must still be not clean.
    expect(run.quizEvents[13].outcome).toBe('correct');
    expect(isCleanRun(run)).toBe(false);
  });

  it('is not clean if only the unscored-correct side of a contaminated triplet is visible', () => {
    // Defensive: even without the position-0 blank in the list, unscored events and a failed scene are enough.
    const run = fullRun({ 13: { scored: false }, 14: { scored: false } });
    expect(isCleanRun(run)).toBe(false);
    const sceneOnly = fullRun();
    sceneOnly.sceneEvents[4] = scene(4, false);
    expect(isCleanRun(sceneOnly)).toBe(false);
  });

  it('a timer expiry (recorded as a blank at position 0 plus the collapse) is not clean', () => {
    const c = collapsedTriplet(0);
    const run = fullRun({ ...c.quiz, 0: { ...c.quiz[0], revealed_at: 5, committed_at: 5 } });
    expect(isCleanRun(run)).toBe(false);
  });

  it('a run with missing events is not clean by omission', () => {
    const run = fullRun();
    run.quizEvents.pop();
    expect(isCleanRun(run)).toBe(false);
    expect(isCleanRun({ quizEvents: [], sceneEvents: [], expectedCards: 52 })).toBe(false);
  });

  it('duplicate events for one card do not count as coverage for another', () => {
    const run = fullRun();
    run.quizEvents[51] = { ...run.quizEvents[50] };
    expect(isCleanRun(run)).toBe(false);
  });
});

// ---- nextInterval / floor -------------------------------------------------------------------

describe('nextInterval', () => {
  it('clean shrinks by 0.5s, not clean leaves it unchanged', () => {
    expect(nextInterval(15, true)).toBe(14.5);
    expect(nextInterval(15, false)).toBe(15);
    expect(nextInterval(8.5, true)).toBe(8);
  });

  it('never goes below the floor', () => {
    expect(nextInterval(3.2, true)).toBe(PROGRESSION_FLOOR_S);
    expect(nextInterval(PROGRESSION_FLOOR_S, true)).toBe(PROGRESSION_FLOOR_S);
  });

  it('an interval already below a (since-raised) floor is lifted to it', () => {
    expect(nextInterval(2, false)).toBe(PROGRESSION_FLOOR_S);
  });
});

// ---- currentInterval ------------------------------------------------------------------------

describe('currentInterval', () => {
  it('starts at 15.0 with no progression runs', () => {
    expect(PROGRESSION_START_INTERVAL_S).toBe(15);
    expect(currentInterval([])).toBe(15);
  });

  it('ignores runs that are not progression runs', () => {
    expect(currentInterval([{ id: 'x', started_at: 1, status: 'complete' }])).toBe(15);
  });

  it('after one clean run: 14.5', () => {
    expect(currentInterval([progressionRun(15, true)])).toBe(14.5);
  });

  it('after one unclean run: unchanged', () => {
    expect(currentInterval([progressionRun(15, false)])).toBe(15);
  });

  it('is derived from the LAST run, not a running count: an unclean run holds the interval it was run at', () => {
    const runs = [progressionRun(15, true), progressionRun(14.5, true), progressionRun(14, false)];
    expect(currentInterval(runs)).toBe(14);
  });

  it('walks down 0.5s per clean run when each run records the interval it ran at', () => {
    const runs: ProgressionRunInput[] = [];
    let interval = currentInterval(runs);
    for (let i = 0; i < 6; i++) {
      runs.push(progressionRun(interval, true));
      interval = currentInterval(runs);
    }
    expect(interval).toBe(12);
  });

  it('settles at the floor and stays there', () => {
    const runs: ProgressionRunInput[] = [];
    let interval = currentInterval(runs);
    const steps = Math.round((PROGRESSION_START_INTERVAL_S - PROGRESSION_FLOOR_S) / PROGRESSION_STEP_S);
    for (let i = 0; i < steps + 5; i++) {
      runs.push(progressionRun(interval, true));
      interval = currentInterval(runs);
    }
    expect(interval).toBe(PROGRESSION_FLOOR_S);
  });

  it('uses the latest run by started_at regardless of array order', () => {
    const older = progressionRun(15, true);
    const newer = progressionRun(14.5, false);
    expect(currentInterval([newer, older])).toBe(14.5);
    expect(currentInterval([older, newer])).toBe(14.5);
  });

  it('a soft-excluded (botched) run never changes the interval, clean or not', () => {
    const base = progressionRun(15, true); // -> 14.5
    expect(currentInterval([base])).toBe(14.5);
    const botchedClean = progressionRun(14.5, true, { excluded: true });
    expect(currentInterval([base, botchedClean])).toBe(14.5);
    const botchedUnclean = progressionRun(14.5, false, { excluded: true });
    expect(currentInterval([base, botchedUnclean])).toBe(14.5);
  });

  it('excluding the latest run re-derives from the one before it', () => {
    const a = progressionRun(15, true);
    const b = progressionRun(14.5, true);
    expect(currentInterval([a, b])).toBe(14);
    expect(currentInterval([a, { ...b, excluded: true }])).toBe(14.5);
  });

  it('if every run is excluded, back to the start', () => {
    expect(currentInterval([progressionRun(15, true, { excluded: true })])).toBe(15);
  });

  it('aborted runs never change the interval', () => {
    const base = progressionRun(15, true);
    const aborted = progressionRun(14.5, true, { status: 'aborted' });
    expect(currentInterval([base, aborted])).toBe(14.5);
  });

  it('an excluded run in the middle does not break the chain', () => {
    const a = progressionRun(15, true); // -> 14.5
    const bad = progressionRun(14.5, true, { excluded: true });
    const c = progressionRun(14.5, true); // -> 14
    expect(currentInterval([a, bad, c])).toBe(14);
  });
});

describe('countsTowardProgression', () => {
  it('requires a progression record, a complete status, and no exclusion', () => {
    expect(countsTowardProgression(progressionRun(15, true))).toBe(true);
    expect(countsTowardProgression(progressionRun(15, true, { excluded: true }))).toBe(false);
    expect(countsTowardProgression(progressionRun(15, true, { status: 'aborted' }))).toBe(false);
    expect(countsTowardProgression({ id: 'x', started_at: 1, status: 'complete' })).toBe(false);
  });
});

// ---- history --------------------------------------------------------------------------------

describe('progressionHistory', () => {
  it('lists finished progression runs oldest first, flagging excluded ones, omitting aborted', () => {
    const a = progressionRun(15, true);
    const b = progressionRun(14.5, false, { excluded: true });
    const c = progressionRun(14.5, true, { status: 'aborted' });
    const d = progressionRun(14.5, true);
    const other: ProgressionRunInput = { id: 'plain', started_at: 5, status: 'complete' };
    const h = progressionHistory([d, c, other, b, a]);
    expect(h.map((p) => [p.interval_s, p.clean, p.excluded])).toEqual([
      [15, true, false],
      [14.5, false, true],
      [14.5, true, false],
    ]);
  });
});

// ---- params / timer -------------------------------------------------------------------------

describe('progressionParams', () => {
  it('is Triplet / 52 / quizzed / timed, with the interval in ms, and passes shape validation', () => {
    const p = progressionParams(14.5);
    expect(p).toEqual({ set: 'full', hand: 'triplet', advance: 'timed', timed_ms: 14500, count: 52, quizzed: true });
    expect(validateParamShape(p)).toEqual({ valid: true });
  });
});

describe('remainingMs', () => {
  it('counts down and floors at zero', () => {
    expect(remainingMs(1000, 15000, 1000)).toBe(15000);
    expect(remainingMs(1000, 15000, 6000)).toBe(10000);
    expect(remainingMs(1000, 15000, 99999)).toBe(0);
  });
});
