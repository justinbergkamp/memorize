export type SetMode = 'full' | 'difficult';
export type HandMode = 'single' | 'triplet';
export type AdvanceMode = 'tap' | 'timed';
export type CountMode = 13 | 26 | 52 | 'unlimited';

export type RunParams = {
  set: SetMode;
  hand: HandMode;
  advance: AdvanceMode;
  timed_ms?: number; // required when advance === 'timed'
  count: CountMode;
  quizzed: boolean;
};

export type Preset = {
  name: string;
  params: RunParams;
  isPractice: boolean;
};

export const DEFAULT_TIMED_MS = 3000;

export const PRESETS: Preset[] = [
  {
    name: 'Practice run',
    params: { set: 'full', hand: 'triplet', advance: 'tap', count: 52, quizzed: true },
    isPractice: true,
  },
  {
    name: 'Quick drill',
    params: { set: 'full', hand: 'triplet', advance: 'tap', count: 13, quizzed: true },
    isPractice: false,
  },
  {
    name: 'Speed drill',
    params: { set: 'full', hand: 'triplet', advance: 'timed', timed_ms: DEFAULT_TIMED_MS, count: 26, quizzed: false },
    isPractice: false,
  },
  {
    name: 'Weak cards',
    params: { set: 'difficult', hand: 'triplet', advance: 'tap', count: 26, quizzed: true },
    isPractice: false,
  },
];

export type ValidationResult = { valid: true } | { valid: false; reason: string };

/** Checks the axis combination in isolation, independent of run-time state like cold-start (§4.2). */
export function validateParamShape(params: RunParams): ValidationResult {
  if (params.quizzed && params.count === 'unlimited') {
    return { valid: false, reason: 'Quizzed runs need a bounded count — there is no unbounded quiz set.' };
  }
  if (params.quizzed && params.hand === 'single') {
    return { valid: false, reason: 'Quiz tests in-order scene recall, which requires triplets.' };
  }
  if (params.advance === 'timed' && !params.timed_ms) {
    return { valid: false, reason: 'Timed advance needs an interval.' };
  }
  return { valid: true };
}

/**
 * Full validation, including run-time gates like difficult-set cold start (§8.3).
 * `difficultUnlocked` should come from the difficulty scorer's coverage check.
 */
export function validateParams(params: RunParams, difficultUnlocked: boolean): ValidationResult {
  const shape = validateParamShape(params);
  if (!shape.valid) return shape;
  if (params.set === 'difficult' && !difficultUnlocked) {
    return { valid: false, reason: 'Difficult set unlocks once 60% of items have 3+ scored observations.' };
  }
  return { valid: true };
}

/**
 * Card totals for the run (§4.4 rounding, §2.4 full-deck remainder).
 * Triplet mode rounds up to a whole number of triplets, except count 52,
 * which is the special 17 triplets (51 cards) + 1 lone card. Single mode
 * uses the exact count. `unlimited` has no fixed length.
 */
export function resolveCardCount(count: CountMode, hand: HandMode): number | 'unlimited' {
  if (count === 'unlimited') return 'unlimited';
  if (hand === 'single') return count;
  if (count === 52) return 52; // 17 triplets (51) + 1 lone card, not ceil(52/3)*3
  return Math.ceil(count / 3) * 3;
}

/**
 * Number of presentation units for the run: one per single card, one per
 * triplet, plus one more for a lone trailing card (§2.4).
 */
export function resolveUnitCount(count: CountMode, hand: HandMode): number | 'unlimited' {
  const cards = resolveCardCount(count, hand);
  if (cards === 'unlimited') return 'unlimited';
  if (hand === 'single') return cards;
  const triplets = Math.floor(cards / 3);
  const loneUnit = cards % 3 === 1 ? 1 : 0;
  return triplets + loneUnit;
}
