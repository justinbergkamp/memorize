import { describe, expect, it } from 'vitest';
import { allItems, itemKey } from './cards';
import { makeRng } from './rng';
import {
  itemTimings,
  makeCardId,
  makeRecallStream,
  median,
  RECALL_RECENT_WINDOW,
  recallItemStream,
  roleTimings,
  sessionTimings,
} from './recall';

describe('recallItemStream', () => {
  it('covers all 156 (card, role) items exactly once per pass', () => {
    const gen = recallItemStream(makeRng('s'));
    const pass = Array.from({ length: 156 }, () => gen.next().value);
    expect(new Set(pass.map((i) => itemKey(i.card, i.role))).size).toBe(156);
  });

  it('never repeats an item back-to-back, including across pass boundaries', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const gen = recallItemStream(makeRng(seed));
      let prev = gen.next().value;
      for (let i = 0; i < 156 * 4; i++) {
        const next = gen.next().value;
        expect(itemKey(next.card, next.role)).not.toBe(itemKey(prev.card, prev.role));
        prev = next;
      }
    }
  });

  it('is deterministic for a seed', () => {
    const a = recallItemStream(makeRng('x'));
    const b = recallItemStream(makeRng('x'));
    for (let i = 0; i < 50; i++) expect(a.next().value).toEqual(b.next().value);
  });
});

describe('makeCardId', () => {
  it('builds rank+suit ids', () => {
    expect(makeCardId('K', 'S')).toBe('KS');
    expect(makeCardId('T', 'H')).toBe('TH');
  });
});

describe('median', () => {
  it('handles empty, odd and even lengths', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

function ev(card: string, role: 'P' | 'A' | 'O', latency: number, i: number, correct = true, session = 's1'): import('./recall').RecallEvent {
  return {
    session_id: session, sequence_index: i, card, role, answer: card, correct,
    shown_at: i * 10000, first_input_at: i * 10000 + latency / 2, first_input_ms: latency / 2,
    answered_at: i * 10000 + latency, latency_ms: latency,
  };
}

describe('timing analysis', () => {
  it('itemTimings uses correct answers only, newest window', () => {
    const events = [ev('AS', 'P', 9000, 0, false), ...Array.from({ length: 12 }, (_, i) => ev('AS', 'P', i < 2 ? 5000 : 1000, i + 1))];
    const [t] = itemTimings(events);
    expect(t.n).toBe(RECALL_RECENT_WINDOW);
    expect(t.medianMs).toBe(1000);
  });

  it('sessionTimings is oldest-first and skips all-miss sessions', () => {
    const events = [ev('AS', 'P', 2000, 5, true, 'b'), ev('AS', 'P', 1000, 1, true, 'a'), ev('2S', 'P', 1000, 9, false, 'c')];
    expect(sessionTimings(events).map((s) => s.session_id)).toEqual(['a', 'b']);
  });

  it('roleTimings returns null for roles with no data', () => {
    const r = roleTimings([ev('AS', 'A', 1500, 0)]);
    expect(r.P).toBeNull();
    expect(r.A?.medianMs).toBe(1500);
  });
});

describe('makeRecallStream', () => {
  const coverAll = () =>
    allItems().flatMap((it, k) => [0, 1, 2].map((j) => ev(it.card, it.role, it.card === 'AS' && it.role === 'P' ? 6000 : 1000, k * 3 + j)));

  it('stays an unweighted shuffle without enough data', () => {
    expect(makeRecallStream([], makeRng('s')).weighted).toBe(false);
    expect(makeRecallStream(coverAll().slice(0, 30), makeRng('s')).weighted).toBe(false);
  });

  it('weights slow items more once unlocked, and never repeats back-to-back', () => {
    const { stream, weighted } = makeRecallStream(coverAll(), makeRng('w'));
    expect(weighted).toBe(true);
    let slow = 0;
    let prev = stream.next().value;
    const N = 6000;
    for (let i = 0; i < N; i++) {
      const next = stream.next().value;
      expect(itemKey(next.card, next.role)).not.toBe(itemKey(prev.card, prev.role));
      if (next.card === 'AS' && next.role === 'P') slow++;
      prev = next;
    }
    // uniform would be ~N/156 ≈ 38; weight 3 vs 1 should roughly triple it
    expect(slow).toBeGreaterThan((N / 156) * 2);
  });
});
