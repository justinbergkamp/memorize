import { allItems, type CardId, type Rank, type Role, type Suit } from './cards';
import { shuffle, weightedPickIndex, type Rng } from './rng';

export type RecallItem = { card: CardId; role: Role };

/**
 * Reverse-direction drill: show a P/A/O, the user names the card. Kept apart from QuizEvent on
 * purpose — text→card is a different retrieval path from card→text, so these never feed the
 * (card, role) difficulty scorer or FSRS.
 */
export type RecallEvent = {
  session_id: string;
  sequence_index: number;
  card: CardId; // the correct answer
  role: Role; // which of the card's P/A/O was shown
  answer: CardId;
  correct: boolean;
  shown_at: number;
  answered_at: number;
  first_input_at: number; // first tap of the suit/rank pair — closest to pure retrieval time
  first_input_ms: number;
  latency_ms: number; // shown_at -> answer complete (both taps)
};

export function makeCardId(rank: Rank, suit: Suit): CardId {
  return `${rank}${suit}`;
}

/**
 * Endless stream of all 156 (card, role) items: each pass is a full shuffle, and the first
 * item of a pass never equals the last item of the previous one.
 */
export function* recallItemStream(rng: Rng): Generator<RecallItem, never, void> {
  let last: RecallItem | null = null;
  for (;;) {
    let pass = shuffle(allItems(), rng);
    if (last && pass[0].card === last.card && pass[0].role === last.role) {
      [pass[0], pass[pass.length - 1]] = [pass[pass.length - 1], pass[0]];
    }
    for (const item of pass) {
      yield item;
      last = item;
    }
  }
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ---- Timing analysis & sampling ------------------------------------------------------------

/** Per-item timing uses the most recent correct answers only, so it tracks current speed. */
export const RECALL_RECENT_WINDOW = 10;
/** Weighted sampling stays off (plain shuffle) until enough of the 156 items have data. */
export const RECALL_MIN_OBSERVATIONS = 3;
export const RECALL_COVERAGE_THRESHOLD = 0.6;
const UNSEEN_WEIGHT = 1.5;
const MIN_WEIGHT = 0.5;
const MAX_WEIGHT = 3;

export type ItemTiming = {
  card: CardId;
  role: Role;
  n: number; // correct answers in the window
  medianMs: number;
  medianFirstInputMs: number;
};

export function itemTimings(events: RecallEvent[]): ItemTiming[] {
  const byItem = new Map<string, RecallEvent[]>();
  for (const e of events) {
    if (!e.correct) continue;
    const key = `${e.card}:${e.role}`;
    const list = byItem.get(key);
    if (list) list.push(e);
    else byItem.set(key, [e]);
  }
  const out: ItemTiming[] = [];
  for (const list of byItem.values()) {
    const recent = list.sort((a, b) => a.answered_at - b.answered_at).slice(-RECALL_RECENT_WINDOW);
    out.push({
      card: recent[0].card,
      role: recent[0].role,
      n: recent.length,
      medianMs: median(recent.map((e) => e.latency_ms))!,
      medianFirstInputMs: median(recent.map((e) => e.first_input_ms))!,
    });
  }
  return out;
}

export function roleTimings(events: RecallEvent[]): Record<Role, { n: number; medianMs: number; medianFirstInputMs: number } | null> {
  const result = { P: null, A: null, O: null } as ReturnType<typeof roleTimings>;
  for (const role of ['P', 'A', 'O'] as const) {
    const correct = events.filter((e) => e.role === role && e.correct);
    if (correct.length > 0) {
      result[role] = {
        n: correct.length,
        medianMs: median(correct.map((e) => e.latency_ms))!,
        medianFirstInputMs: median(correct.map((e) => e.first_input_ms))!,
      };
    }
  }
  return result;
}

export type SessionTiming = { session_id: string; startedAt: number; n: number; medianMs: number };

/** Oldest first. Sessions with no correct answers are omitted. */
export function sessionTimings(events: RecallEvent[]): SessionTiming[] {
  const bySession = new Map<string, RecallEvent[]>();
  for (const e of events) {
    const list = bySession.get(e.session_id);
    if (list) list.push(e);
    else bySession.set(e.session_id, [e]);
  }
  const out: SessionTiming[] = [];
  for (const [session_id, list] of bySession) {
    const correct = list.filter((e) => e.correct);
    if (correct.length === 0) continue;
    out.push({
      session_id,
      startedAt: Math.min(...list.map((e) => e.shown_at)),
      n: correct.length,
      medianMs: median(correct.map((e) => e.latency_ms))!,
    });
  }
  return out.sort((a, b) => a.startedAt - b.startedAt);
}

export function recallWeightsUnlocked(timings: ItemTiming[], totalItems = 156): boolean {
  const covered = timings.filter((t) => t.n >= RECALL_MIN_OBSERVATIONS).length;
  return covered / totalItems >= RECALL_COVERAGE_THRESHOLD;
}

/** Slower than the overall median -> shown more often; clamped so every item stays reachable. */
export function recallWeight(timing: ItemTiming | undefined, overallMedianMs: number): number {
  if (!timing || timing.n < RECALL_MIN_OBSERVATIONS) return UNSEEN_WEIGHT;
  return Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, timing.medianMs / overallMedianMs));
}

/** Weighted endless stream. Never repeats the previous item back-to-back. */
export function* weightedRecallStream(
  rng: Rng,
  weightOf: (item: RecallItem) => number,
): Generator<RecallItem, never, void> {
  const items = allItems();
  const weights = items.map(weightOf);
  let lastIdx = -1;
  for (;;) {
    const masked = weights.map((w, i) => (i === lastIdx ? 0 : w));
    lastIdx = weightedPickIndex(masked, rng);
    yield items[lastIdx];
  }
}

/** Plain shuffled passes until there's enough timing data, then latency-weighted. */
export function makeRecallStream(
  events: RecallEvent[],
  rng: Rng,
): { stream: Generator<RecallItem, never, void>; weighted: boolean } {
  const timings = itemTimings(events);
  if (!recallWeightsUnlocked(timings)) return { stream: recallItemStream(rng), weighted: false };
  const overall = median(timings.map((t) => t.medianMs))!;
  const byKey = new Map(timings.map((t) => [`${t.card}:${t.role}`, t]));
  return {
    stream: weightedRecallStream(rng, (item) => recallWeight(byKey.get(`${item.card}:${item.role}`), overall)),
    weighted: true,
  };
}
