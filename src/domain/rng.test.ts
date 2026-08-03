import { describe, expect, it } from 'vitest';
import { makeRng, shuffle } from './rng';

describe('rng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng('seed-1');
    const b = makeRng('seed-1');
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = makeRng('seed-1');
    const b = makeRng('seed-2');
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('shuffle is a reproducible permutation of the input', () => {
    const items = Array.from({ length: 52 }, (_, i) => i);
    const shuffled = shuffle(items, makeRng('deck-seed'));
    expect(shuffled).toHaveLength(52);
    expect([...shuffled].sort((x, y) => x - y)).toEqual(items);
    expect(shuffle(items, makeRng('deck-seed'))).toEqual(shuffled);
  });
});
