import { create } from 'zustand';
import type { CardId } from '@domain/cards';
import { makeRng, newSeed } from '@domain/rng';
import { makeRecallStream, type RecallEvent, type RecallItem } from '@domain/recall';
import { repository } from '@data/dexieRepository';

export type RecallResult = { correct: boolean; answer: CardId; expected: CardId; latencyMs: number };

type RecallState = {
  sessionId: string | null;
  gen: Generator<RecallItem, never, void> | null;
  item: RecallItem | null;
  shownAt: number | null;
  firstInputAt: number | null;
  sequenceIndex: number;
  answered: number;
  correct: number;
  latencies: number[]; // correct answers only, this session
  result: RecallResult | null; // set between submit and next

  weighted: boolean; // false while there's too little timing data -> plain shuffle
  start: () => Promise<void>;
  markInput: () => void;
  submit: (answer: CardId) => Promise<void>;
  next: () => void;
  reset: () => void;
};

const initialState = {
  sessionId: null as string | null,
  gen: null as Generator<RecallItem, never, void> | null,
  item: null as RecallItem | null,
  shownAt: null as number | null,
  firstInputAt: null as number | null,
  sequenceIndex: 0,
  answered: 0,
  correct: 0,
  latencies: [] as number[],
  result: null as RecallResult | null,
  weighted: false,
};

export const useRecallStore = create<RecallState>((set, get) => ({
  ...initialState,

  async start() {
    const seed = newSeed();
    const { stream: gen, weighted } = makeRecallStream(await repository.getAllRecallEvents(), makeRng(seed));
    set({ ...initialState, sessionId: `recall-${seed}`, gen, weighted, item: gen.next().value, shownAt: Date.now() });
  },

  markInput() {
    const s = get();
    if (s.firstInputAt === null && !s.result) set({ firstInputAt: Date.now() });
  },

  async submit(answer) {
    const s = get();
    if (!s.sessionId || !s.item || s.shownAt === null || s.result) return;
    const answeredAt = Date.now();
    const correct = answer === s.item.card;
    const firstInputAt = s.firstInputAt ?? answeredAt;
    const latencyMs = answeredAt - s.shownAt;
    const event: RecallEvent = {
      session_id: s.sessionId,
      sequence_index: s.sequenceIndex,
      card: s.item.card,
      role: s.item.role,
      answer,
      correct,
      shown_at: s.shownAt,
      answered_at: answeredAt,
      first_input_at: firstInputAt,
      first_input_ms: firstInputAt - s.shownAt,
      latency_ms: latencyMs,
    };
    set({
      answered: s.answered + 1,
      correct: s.correct + (correct ? 1 : 0),
      latencies: correct ? [...s.latencies, latencyMs] : s.latencies,
      result: { correct, answer, expected: s.item.card, latencyMs },
    });
    await repository.appendRecallEvent(event);
  },

  next() {
    const s = get();
    if (!s.gen || !s.result) return;
    set({ item: s.gen.next().value, shownAt: Date.now(), firstInputAt: null, sequenceIndex: s.sequenceIndex + 1, result: null });
  },

  reset() {
    set({ ...initialState });
  },
}));
