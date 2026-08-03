import type { Outcome } from './events';

export type SceneScoring = {
  retrieved: boolean;
  /** scored flag for [position0, position1, position2] */
  scored: [boolean, boolean, boolean];
};

/**
 * §7.4 — the reveal leak. Position 0's outcome determines whether the whole triplet's
 * card events are attributable:
 *   blank      -> scene failure, not attributable to any card. All three unscored.
 *   wrong_card -> decode failure. Scene was retrieved; positions 1-2 are uncontaminated.
 *   correct    -> normal, all three scored.
 */
export function deriveSceneScoring(position0Outcome: Outcome): SceneScoring {
  if (position0Outcome === 'blank') {
    return { retrieved: false, scored: [false, false, false] };
  }
  return { retrieved: true, scored: [true, true, true] };
}
