import type { QuizEvent } from './events';

export type TickState = 'pending' | 'filled' | 'correct' | 'wrong_card' | 'blank';

export function computeMemorizeTicks(total: number, cardsShown: number): TickState[] {
  const ticks: TickState[] = new Array(total).fill('pending');
  for (let i = 0; i < Math.min(cardsShown, total); i++) ticks[i] = 'filled';
  return ticks;
}

/**
 * §11.4 — one tick per card, colored by outcome. A contaminated (unscored) tick that
 * directly follows another unscored tick in the same triplet merges visually with it,
 * so a collapsed scene reads as one unbroken span, not three separate marks.
 */
export function computeQuizTicks(total: number, quizEvents: QuizEvent[]): { ticks: TickState[]; mergeWithPrev: boolean[] } {
  const ticks: TickState[] = new Array(total).fill('pending');
  const mergeWithPrev: boolean[] = new Array(total).fill(false);
  let prevScored: boolean | null = null;
  let prevTriplet: number | null = null;

  const sorted = [...quizEvents].sort((a, b) => a.sequence_index - b.sequence_index);
  for (const ev of sorted) {
    const i = ev.sequence_index;
    if (i < 0 || i >= total) continue;
    // Only legacy contaminated triplet events (scored: false, triplet_index >= 0) render as blank;
    // single-mode events are unscored for difficulty but still show their real outcome.
    const legacyContaminated = !ev.scored && ev.triplet_index >= 0;
    ticks[i] = legacyContaminated ? 'blank' : ev.outcome === 'correct' ? 'correct' : ev.outcome === 'wrong_card' ? 'wrong_card' : 'blank';
    if (legacyContaminated && prevScored === false && prevTriplet === ev.triplet_index) mergeWithPrev[i] = true;
    prevScored = legacyContaminated ? false : true;
    prevTriplet = ev.triplet_index;
  }
  return { ticks, mergeWithPrev };
}
