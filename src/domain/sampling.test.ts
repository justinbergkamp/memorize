import { describe, expect, it } from 'vitest';
import { fullDeck } from './cards';
import { makeRng } from './rng';
import {
  buildRunSequence,
  groupIntoUnits,
  nextUnlimitedUnit,
  sampleDifficultSet,
  sampleFullSet,
  toTripletSlots,
  unlimitedFullDeckStream,
  unlimitedWeightedCardStream,
  type DifficultyLookup,
} from './sampling';

const neutralDifficulty: DifficultyLookup = () => 0.5;

describe('sampleFullSet (§5.1)', () => {
  it('samples n distinct cards without replacement', () => {
    const cards = sampleFullSet(makeRng('s'), 26);
    expect(cards).toHaveLength(26);
    expect(new Set(cards).size).toBe(26);
  });

  it('count 52 is a full shuffled permutation of the deck', () => {
    const cards = sampleFullSet(makeRng('s'), 52);
    expect([...cards].sort()).toEqual([...fullDeck()].sort());
  });
});

describe('unlimitedFullDeckStream (§5.1 unlimited)', () => {
  it('never repeats a card within a single 52-card pass', () => {
    const gen = unlimitedFullDeckStream(makeRng('s'));
    const firstPass = Array.from({ length: 52 }, () => gen.next().value);
    expect(new Set(firstPass).size).toBe(52);
  });

  it('the last card of one pass is never the first card of the next', () => {
    const gen = unlimitedFullDeckStream(makeRng('unlimited-seed'));
    let lastOfPrevious: string | null = null;
    for (let pass = 0; pass < 20; pass++) {
      const cards = Array.from({ length: 52 }, () => gen.next().value as string);
      if (lastOfPrevious !== null) {
        expect(cards[0]).not.toBe(lastOfPrevious);
      }
      lastOfPrevious = cards[cards.length - 1];
    }
  });
});

describe('toTripletSlots (§2.4 full-deck remainder)', () => {
  it('arranges 51 cards into 17 full triplets with no lone card', () => {
    const cards = sampleFullSet(makeRng('s'), 51);
    const slots = toTripletSlots(cards);
    expect(slots).toHaveLength(51);
    expect(slots.every((s) => s.tripletIndex !== null)).toBe(true);
  });

  it('arranges 52 cards into 17 triplets (51 cards) + 1 lone Person card', () => {
    const cards = sampleFullSet(makeRng('s'), 52);
    const slots = toTripletSlots(cards);
    expect(slots).toHaveLength(52);
    const tripletSlots = slots.filter((s) => s.tripletIndex !== null);
    const loneSlots = slots.filter((s) => s.tripletIndex === null);
    expect(tripletSlots).toHaveLength(51);
    expect(loneSlots).toHaveLength(1);
    expect(loneSlots[0].role).toBe('P');
    expect(loneSlots[0].positionInTriplet).toBeNull();
  });

  it('assigns roles P, A, O to positions 0, 1, 2 within each triplet', () => {
    const cards = sampleFullSet(makeRng('s'), 15);
    const slots = toTripletSlots(cards);
    for (let t = 0; t < 5; t++) {
      const triplet = slots.filter((s) => s.tripletIndex === t);
      expect(triplet.map((s) => s.role)).toEqual(['P', 'A', 'O']);
    }
  });
});

describe('sampleDifficultSet (§5.2)', () => {
  it('draws each card at most once per run, correct role per position', () => {
    const slots = sampleDifficultSet(makeRng('s'), 9, false, neutralDifficulty);
    expect(slots).toHaveLength(27);
    const cards = slots.map((s) => s.card);
    expect(new Set(cards).size).toBe(cards.length);
    for (let t = 0; t < 9; t++) {
      const triplet = slots.filter((s) => s.tripletIndex === t);
      expect(triplet.map((s) => s.role)).toEqual(['P', 'A', 'O']);
    }
  });

  it('includes a distinct lone card when requested', () => {
    const slots = sampleDifficultSet(makeRng('s'), 17, true, neutralDifficulty);
    expect(slots).toHaveLength(52);
    const cards = slots.map((s) => s.card);
    expect(new Set(cards).size).toBe(52);
    const lone = slots[slots.length - 1];
    expect(lone.tripletIndex).toBeNull();
    expect(lone.role).toBe('P');
  });

  it('favors high-difficulty cards under a skewed difficulty function', () => {
    const target = 'AS';
    const skewed: DifficultyLookup = (card) => (card === target ? 1 : 0);
    let picks = 0;
    const trials = 200;
    for (let i = 0; i < trials; i++) {
      const slots = sampleDifficultSet(makeRng(`trial-${i}`), 5, false, skewed);
      if (slots.some((s) => s.card === target)) picks++;
    }
    // 5 of 52 cards drawn per role uniformly would give ~5/52 ≈ 9.6%; heavy skew should push this far higher.
    expect(picks / trials).toBeGreaterThan(0.5);
  });
});

describe('unlimitedWeightedCardStream + nextUnlimitedUnit', () => {
  it('pulls whole triplet units (3 cards) indefinitely without immediate repeats within a pass', () => {
    const gen = unlimitedWeightedCardStream(makeRng('s'), () => 0.5);
    const seen = new Set<string>();
    for (let i = 0; i < 17; i++) {
      const unit = nextUnlimitedUnit(gen, 'triplet');
      expect(unit).toHaveLength(3);
      for (const c of unit) {
        expect(seen.has(c)).toBe(false);
        seen.add(c);
      }
    }
    expect(seen.size).toBe(51);
  });

  it('single-hand units are one card at a time', () => {
    const gen = unlimitedWeightedCardStream(makeRng('s'), () => 0.5);
    const unit = nextUnlimitedUnit(gen, 'single');
    expect(unit).toHaveLength(1);
  });
});

describe('groupIntoUnits', () => {
  it('groups a 52-card full run into 17 triplet units + 1 lone unit', () => {
    const cards = sampleFullSet(makeRng('s'), 52);
    const slots = toTripletSlots(cards);
    const units = groupIntoUnits(slots);
    expect(units).toHaveLength(18);
    expect(units.slice(0, 17).every((u) => u.length === 3)).toBe(true);
    expect(units[17]).toHaveLength(1);
  });

  it('single-hand mode produces one unit per card', () => {
    const cards = sampleFullSet(makeRng('s'), 13);
    const units = groupIntoUnits(cards.map((card) => ({ card, role: 'P' as const, tripletIndex: null, positionInTriplet: null })));
    expect(units).toHaveLength(13);
    expect(units.every((u) => u.length === 1)).toBe(true);
  });
});

describe('buildRunSequence', () => {
  it('full/triplet/52 yields the §2.4 remainder shape', () => {
    const slots = buildRunSequence(
      { set: 'full', hand: 'triplet', cardCount: 52, difficulty: neutralDifficulty },
      makeRng('s'),
    );
    expect(slots).toHaveLength(52);
    expect(slots.filter((s) => s.tripletIndex === null)).toHaveLength(1);
  });

  it('difficult/triplet/26 -> 27 cards, 9 triplets, no repeats', () => {
    const slots = buildRunSequence(
      { set: 'difficult', hand: 'triplet', cardCount: 27, difficulty: neutralDifficulty },
      makeRng('s'),
    );
    expect(slots).toHaveLength(27);
    expect(new Set(slots.map((s) => s.card)).size).toBe(27);
  });

  it('single hand mode produces one card per slot with no triplet structure', () => {
    const slots = buildRunSequence(
      { set: 'full', hand: 'single', cardCount: 13, difficulty: neutralDifficulty },
      makeRng('s'),
    );
    expect(slots).toHaveLength(13);
    expect(slots.every((s) => s.tripletIndex === null)).toBe(true);
  });
});
