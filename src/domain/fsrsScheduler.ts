import { createEmptyCard, fsrs, Rating, type Card, type Grade } from 'ts-fsrs';
import type { FsrsGrade } from './fsrs';

/**
 * §8.4 — FSRS scheduling, kept separate from the difficulty score. Difficulty answers
 * "what is weak"; FSRS answers "what is due." v1 samples on difficulty only — due-ness
 * is reserved for a later "Review" set — but the schedule is still maintained per item
 * so it's there when that set ships.
 */
export type FsrsCardState = Card;

const GRADE_TO_RATING: Record<FsrsGrade, Grade> = {
  1: Rating.Again,
  2: Rating.Hard,
  3: Rating.Good,
  4: Rating.Easy,
};

const scheduler = fsrs();

export function nextFsrsCardState(prev: FsrsCardState | null, grade: FsrsGrade, now: Date): FsrsCardState {
  const card: Card = prev ?? createEmptyCard<Card>(now);
  const rating = GRADE_TO_RATING[grade];
  const { card: nextCard } = scheduler.next(card, now, rating);
  return nextCard;
}
