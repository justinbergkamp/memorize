import type { Outcome } from './events';

export type SceneScoring = {
  retrieved: boolean;
  /** scored flag for [position0, position1, position2] */
  scored: [boolean, boolean, boolean];
};

/**
 * Position 0's outcome records whether the scene was retrieved, but it never changes how the
 * other cards are scored. A blank P is one miss; positions 1-2 are quizzed and graded on their
 * own merits, so every card in a triplet stays attributable.
 *
 * (Earlier versions treated a position-0 blank as a collapsed scene and auto-graded the other two
 * cards as unscored corrects. Runs recorded under that rule still carry `scored: false` events.)
 */
export function deriveSceneScoring(position0Outcome: Outcome): SceneScoring {
  return { retrieved: position0Outcome !== 'blank', scored: [true, true, true] };
}
