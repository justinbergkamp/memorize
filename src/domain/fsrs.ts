import type { Outcome } from './events';

export const LATENCY_WINDOW_SIZE = 200;
export const COLD_START_MIN_OBSERVATIONS = 30;

export type FsrsGrade = 1 | 2 | 3 | 4;

/** Rolling window of this user's last `LATENCY_WINDOW_SIZE` correct-quiz latencies (ms). */
export function pushLatency(window: number[], latencyMs: number): number[] {
  const next = [...window, latencyMs];
  if (next.length > LATENCY_WINDOW_SIZE) next.shift();
  return next;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stddev(xs: number[], m: number): number {
  if (xs.length < 2) return 0;
  const variance = xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

/**
 * §7.3 — z-score of `latencyMs` against the rolling window, computed BEFORE this
 * observation is added to the window. Undefined if the window is empty or has zero
 * variance (can't standardize).
 */
export function computeLatencyZ(latencyMs: number, window: number[]): number | undefined {
  if (window.length === 0) return undefined;
  const m = mean(window);
  const sd = stddev(window, m);
  if (sd === 0) return undefined;
  return (latencyMs - m) / sd;
}

/**
 * §7.3 FSRS grade derivation. No self-reported difficulty button — discrimination
 * among correct answers comes from latency. Cold start: everything correct is Good
 * until the window holds >= COLD_START_MIN_OBSERVATIONS.
 */
export function deriveFsrsGrade(outcome: Outcome, latencyZ: number | undefined, windowSize: number): FsrsGrade {
  if (outcome === 'blank' || outcome === 'wrong_card') return 1;
  if (windowSize < COLD_START_MIN_OBSERVATIONS || latencyZ === undefined) return 3;
  if (latencyZ > 1) return 2;
  if (latencyZ < -1) return 4;
  return 3;
}
