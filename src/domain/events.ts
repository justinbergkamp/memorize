import type { CardId, Role } from './cards';
import type { RunParams } from './runParams';

export type Outcome = 'correct' | 'wrong_card' | 'blank';

export type RunStatus = 'complete' | 'aborted';

export type RunRollup = {
  n_cards: number;
  n_correct: number; // harsh — a collapsed triplet counts as 3 misses (§9.1)
  n_wrong_card: number;
  n_blank: number;
  memorize_ms: number;
  quiz_ms: number;
  total_ms: number;
};

export type RunHeader = {
  id: string;
  started_at: number;
  ended_at?: number;
  seed: string;
  params: RunParams;
  is_practice: boolean; // snapshot at run start, never re-derived
  weight: number; // difficulty-scoring multiplier (§8.2)
  status: RunStatus;
  rollup?: RunRollup; // cache only, recomputable from events
};

// One per presentation unit in the memorize phase.
// hand: 'single' -> one card per unit. hand: 'triplet' -> three (or one, for the lone 52nd).
export type MemorizeEvent = {
  run_id: string;
  unit_index: number;
  cards: CardId[];
  shown_at: number;
  advanced_at: number;
  latency_valid: boolean; // false when advance === 'timed'
};

// One per triplet in the quiz phase. Not emitted for the lone 52nd card.
export type SceneEvent = {
  run_id: string;
  triplet_index: number;
  retrieved: boolean; // false when position 0 graded 'blank'
  latency_ms: number; // time to first grading action in the triplet
};

// One per card in the quiz phase.
export type QuizEvent = {
  run_id: string;
  sequence_index: number; // position in the full run sequence
  triplet_index: number;
  position_in_triplet: 0 | 1 | 2;
  card: CardId;
  role: Role;
  outcome: Outcome;
  revealed_at: number;
  committed_at: number;
  latency_ms: number; // committed_at - revealed_at
  latency_z?: number; // vs. rolling window of this user's correct latencies
  fsrs_grade: 1 | 2 | 3 | 4; // derived, stored (§7.3)
  scored: boolean; // false when contaminated (§7.4)
  grading: 'self'; // reserved for a future 'entered' mode
};
