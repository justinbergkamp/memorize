import type { QuizEvent, RunHeader, SceneEvent } from './events';
import type { RunParams } from './runParams';

/**
 * §X Progression mode — a Train preset whose per-triplet interval shrinks as runs come back clean.
 *
 * The interval is *derived*, never stored as a counter: it is a pure function of run history, so
 * soft-excluding a run (or deleting one) just re-derives it. Each progression run records
 * `progression: { interval_s, clean }` on its RunHeader; `clean` is a cache of `isCleanRun` over
 * that run's events, written once at close.
 */

export const PROGRESSION_START_INTERVAL_S = 15.0;
export const PROGRESSION_STEP_S = 0.5;
/** Configurable floor — the interval never drops below this. */
export const PROGRESSION_FLOOR_S = 3.0;

export type ProgressionRecord = { interval_s: number; clean: boolean };

/** Preset parameters: Hand=Triplet, Count=52, Quizzed, auto-advance at the given per-triplet interval. */
export function progressionParams(interval_s: number): RunParams {
  return {
    set: 'full',
    hand: 'triplet',
    advance: 'timed',
    timed_ms: Math.round(interval_s * 1000),
    count: 52,
    quizzed: true,
  };
}

/**
 * A run is clean only if every card was recalled: zero `blank` or `wrong_card` anywhere. That
 * includes a contaminated (`scored: false`) triplet — its position 0 is a `blank`, and positions
 * 1-2 are free `correct`s the reveal handed over, so they must not rescue the run. A timer
 * expiry is recorded as a `blank` and so also breaks cleanliness.
 *
 * `expectedCards` guards against a run with missing events looking clean by omission.
 */
export function isCleanRun(input: {
  quizEvents: QuizEvent[];
  sceneEvents: SceneEvent[];
  expectedCards: number;
}): boolean {
  const { quizEvents, sceneEvents, expectedCards } = input;
  const covered = new Set(quizEvents.map((e) => e.sequence_index));
  if (covered.size < expectedCards) return false;
  if (quizEvents.some((e) => e.outcome !== 'correct' || !e.scored)) return false;
  if (sceneEvents.some((s) => !s.retrieved)) return false;
  return true;
}

/** The interval after a run at `interval_s`: shrink by one step if clean (never below the floor), else unchanged. */
export function nextInterval(interval_s: number, clean: boolean): number {
  const next = clean ? interval_s - PROGRESSION_STEP_S : interval_s;
  return roundS(Math.max(PROGRESSION_FLOOR_S, next));
}

/** The slice of a RunHeader progression logic needs. */
export type ProgressionRunInput = Pick<RunHeader, 'id' | 'started_at' | 'status'> & {
  progression?: ProgressionRecord;
  excluded?: boolean;
};

/** A progression run counts toward the interval only if it finished and wasn't soft-excluded as botched. */
export function countsTowardProgression(run: ProgressionRunInput): boolean {
  return run.progression !== undefined && run.status === 'complete' && !run.excluded;
}

/**
 * Current interval = last counted progression run's interval_s, minus one step if it was clean
 * (floored), else the same. With no counted run, the starting interval.
 */
export function currentInterval(runs: ProgressionRunInput[]): number {
  let last: ProgressionRunInput | undefined;
  for (const run of runs) {
    if (!countsTowardProgression(run)) continue;
    if (!last || run.started_at > last.started_at) last = run;
  }
  if (!last || !last.progression) return PROGRESSION_START_INTERVAL_S;
  return nextInterval(last.progression.interval_s, last.progression.clean);
}

export type ProgressionPoint = {
  run_id: string;
  started_at: number;
  interval_s: number;
  clean: boolean;
  /** Soft-excluded (botched): shown, but never moved the interval. */
  excluded: boolean;
};

/** Finished progression runs, oldest first, for the interval-vs-run history. Aborted runs are omitted. */
export function progressionHistory(runs: ProgressionRunInput[]): ProgressionPoint[] {
  return runs
    .filter((r) => r.progression !== undefined && r.status === 'complete')
    .sort((a, b) => a.started_at - b.started_at)
    .map((r) => ({
      run_id: r.id,
      started_at: r.started_at,
      interval_s: r.progression!.interval_s,
      clean: r.progression!.clean,
      excluded: !!r.excluded,
    }));
}

/** Time left on a unit's timer, floored at 0. Used for both memorize display and the quiz position-0 deadline. */
export function remainingMs(shownAt: number, intervalMs: number, now: number): number {
  return Math.max(0, shownAt + intervalMs - now);
}

function roundS(s: number): number {
  return Math.round(s * 1000) / 1000;
}
