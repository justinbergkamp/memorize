import { fullDeck, ROLES, type CardId, type Role } from './cards';
import type { Rng } from './rng';
import { shuffle, weightedPickIndex } from './rng';
import type { HandMode } from './runParams';

export const SOFTMAX_TEMPERATURE = 0.5;

export type Slot = {
  card: CardId;
  /** Role being tested for this card in this occurrence. Only meaningful in triplet mode. */
  role: Role;
  /** null for single-hand slots and the lone 52nd card (§2.4) — no scene is formed. */
  tripletIndex: number | null;
  positionInTriplet: 0 | 1 | 2 | null;
};

export type DifficultyLookup = (card: CardId, role: Role) => number;

/** Groups a flat slot sequence into presentation units — one per triplet, one per lone/single card. */
export function groupIntoUnits(slots: Slot[]): Slot[][] {
  const units: Slot[][] = [];
  let i = 0;
  while (i < slots.length) {
    const tripletIndex = slots[i].tripletIndex;
    if (tripletIndex === null) {
      units.push([slots[i]]);
      i += 1;
      continue;
    }
    const unit = [slots[i]];
    let j = i + 1;
    while (j < slots.length && slots[j].tripletIndex === tripletIndex) {
      unit.push(slots[j]);
      j += 1;
    }
    units.push(unit);
    i = j;
  }
  return units;
}

/** Position within a triplet always maps to a fixed role: P, then A, then O. */
const ROLE_BY_POSITION: Role[] = ['P', 'A', 'O'];

/** §5.1 — sample `n` distinct cards without replacement from the full 52-card deck. */
export function sampleFullSet(rng: Rng, n: number): CardId[] {
  if (n > 52) throw new Error('Cannot sample more than 52 distinct cards without replacement.');
  return shuffle(fullDeck(), rng).slice(0, n);
}

/**
 * §5.1 unlimited — exhausts the deck, then reshuffles, with the constraint that the
 * last card of one pass may not be the first card of the next. Infinite generator;
 * the run engine pulls one card at a time until the user stops.
 */
export function* unlimitedFullDeckStream(rng: Rng): Generator<CardId, never, void> {
  let previousLast: CardId | null = null;
  for (;;) {
    let pass = shuffle(fullDeck(), rng);
    if (previousLast !== null && pass[0] === previousLast) {
      // Swap the offending first card with any other position to satisfy the constraint.
      const swapWith = 1 + Math.floor(rng() * (pass.length - 1));
      [pass[0], pass[swapWith]] = [pass[swapWith], pass[0]];
    }
    for (const card of pass) {
      yield card;
    }
    previousLast = pass[pass.length - 1];
  }
}

/**
 * Arranges a flat card list into triplet slots (§2.4). `cards.length` must already be
 * a multiple of 3, or exactly one extra for the full-deck 52-card remainder (lone card).
 */
export function toTripletSlots(cards: CardId[]): Slot[] {
  const slots: Slot[] = [];
  const tripletCount = Math.floor(cards.length / 3);
  for (let t = 0; t < tripletCount; t++) {
    for (let p = 0; p < 3; p++) {
      const position = p as 0 | 1 | 2;
      slots.push({
        card: cards[t * 3 + p],
        role: ROLE_BY_POSITION[p],
        tripletIndex: t,
        positionInTriplet: position,
      });
    }
  }
  const remainder = cards.length - tripletCount * 3;
  if (remainder === 1) {
    slots.push({
      card: cards[cards.length - 1],
      role: 'P',
      tripletIndex: null,
      positionInTriplet: null,
    });
  } else if (remainder !== 0) {
    throw new Error('toTripletSlots expects a multiple of 3, or a multiple of 3 plus one lone card.');
  }
  return slots;
}

export function toSingleSlots(cards: CardId[]): Slot[] {
  return cards.map((card) => ({ card, role: 'P', tripletIndex: null, positionInTriplet: null }));
}

function softmaxWeights(scores: number[], tau: number): number[] {
  return scores.map((s) => Math.exp(s / tau));
}

/**
 * §5.2 — weighted sampling without replacement of `count` distinct cards for a single
 * role, favoring higher difficulty. Excludes any card already used elsewhere in the run.
 */
function sampleRolePool(
  rng: Rng,
  role: Role,
  count: number,
  excluded: Set<CardId>,
  difficulty: DifficultyLookup,
): CardId[] {
  const pool = fullDeck().filter((c) => !excluded.has(c));
  if (count > pool.length) {
    throw new Error(`Not enough distinct cards remaining to draw ${count} for role ${role}.`);
  }
  const picked: CardId[] = [];
  const remaining = pool.slice();
  const scores = remaining.map((c) => difficulty(c, role));
  let weights = softmaxWeights(scores, SOFTMAX_TEMPERATURE);
  for (let i = 0; i < count; i++) {
    const idx = weightedPickIndex(weights, rng);
    picked.push(remaining[idx]);
    remaining.splice(idx, 1);
    weights.splice(idx, 1);
  }
  return picked;
}

/**
 * §5.2 — samples (card, role) pairs (not cards) so each intended role lands at the
 * correct triplet position. A card appears at most once per run across all roles.
 * `includeLoneCard` draws one extra card for role P (the §2.4 remainder), distinct
 * from every triplet card.
 */
export function sampleDifficultSet(
  rng: Rng,
  tripletCount: number,
  includeLoneCard: boolean,
  difficulty: DifficultyLookup,
): Slot[] {
  const used = new Set<CardId>();
  const byRole: Record<Role, CardId[]> = { P: [], A: [], O: [] };
  for (const role of ROLES) {
    const picked = sampleRolePool(rng, role, tripletCount, used, difficulty);
    for (const c of picked) used.add(c);
    byRole[role] = picked;
  }

  const slots: Slot[] = [];
  for (let t = 0; t < tripletCount; t++) {
    slots.push({ card: byRole.P[t], role: 'P', tripletIndex: t, positionInTriplet: 0 });
    slots.push({ card: byRole.A[t], role: 'A', tripletIndex: t, positionInTriplet: 1 });
    slots.push({ card: byRole.O[t], role: 'O', tripletIndex: t, positionInTriplet: 2 });
  }

  if (includeLoneCard) {
    const [loneCard] = sampleRolePool(rng, 'P', 1, used, difficulty);
    slots.push({ card: loneCard, role: 'P', tripletIndex: null, positionInTriplet: null });
  }

  return slots;
}

/**
 * Unlimited + difficult (memorize-only; quizzed+unlimited is disallowed, so role
 * bookkeeping isn't needed here — only which cards to show, in what order).
 * Same exhaust-then-reshuffle shape as §5.1 unlimited, weighted by per-card difficulty.
 */
export function* unlimitedWeightedCardStream(
  rng: Rng,
  cardDifficulty: (card: CardId) => number,
): Generator<CardId, never, void> {
  let previousLast: CardId | null = null;
  for (;;) {
    const remaining = fullDeck();
    const weights = softmaxWeights(remaining.map(cardDifficulty), SOFTMAX_TEMPERATURE);
    const pass: CardId[] = [];
    while (remaining.length > 0) {
      const idx = weightedPickIndex(weights, rng);
      pass.push(remaining[idx]);
      remaining.splice(idx, 1);
      weights.splice(idx, 1);
    }
    if (previousLast !== null && pass[0] === previousLast) {
      const swapWith = 1 + Math.floor(rng() * (pass.length - 1));
      [pass[0], pass[swapWith]] = [pass[swapWith], pass[0]];
    }
    for (const card of pass) yield card;
    previousLast = pass[pass.length - 1];
  }
}

/** Pulls one presentation unit (1 card for `single`, 3 for `triplet`) off a CardId stream. */
export function nextUnlimitedUnit(gen: Generator<CardId, never, void>, hand: HandMode): CardId[] {
  const n = hand === 'triplet' ? 3 : 1;
  return Array.from({ length: n }, () => gen.next().value);
}

export type BuildSequenceInput = {
  set: 'full' | 'difficult';
  hand: HandMode;
  cardCount: number; // resolved via resolveCardCount; must not be 'unlimited' here
  difficulty: DifficultyLookup;
};

/** Builds the full bounded run sequence for both memorize and quiz phases (same order, §4.1). */
export function buildRunSequence(input: BuildSequenceInput, rng: Rng): Slot[] {
  const { set, hand, cardCount, difficulty } = input;

  if (hand === 'single') {
    if (set === 'full') return toSingleSlots(sampleFullSet(rng, cardCount));
    // difficult + single: draw role-agnostic weighted cards, role fixed to 'P' per slot.
    const picked = sampleRolePool(rng, 'P', cardCount, new Set(), difficulty);
    return toSingleSlots(picked);
  }

  // triplet mode
  const hasLoneCard = cardCount % 3 === 1;
  const tripletCount = Math.floor(cardCount / 3);

  if (set === 'full') {
    const cards = sampleFullSet(rng, cardCount);
    return toTripletSlots(cards);
  }

  return sampleDifficultSet(rng, tripletCount, hasLoneCard, difficulty);
}
