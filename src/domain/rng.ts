/**
 * Deterministic seeded RNG. A run stores its seed; replaying {seed, params}
 * must reproduce the exact same sequence (§5.3).
 */
export type Rng = () => number; // uniform [0, 1)

/** xmur3 string hash -> 32-bit seed, used to turn arbitrary seed strings into mulberry32 state. */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(a: number): Rng {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed: string): Rng {
  const seedFn = xmur3(seed);
  return mulberry32(seedFn());
}

export function newSeed(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Fisher-Yates, driven by the supplied RNG. Does not mutate the input. */
export function shuffle<T>(items: T[], rng: Rng): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Pick one index weighted by `weights` (must be non-negative, sum > 0). */
export function weightedPickIndex(weights: number[], rng: Rng): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}
