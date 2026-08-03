import { create } from 'zustand';
import type { CardId, Role } from '@domain/cards';
import { itemKey } from '@domain/cards';
import { deriveSceneScoring } from '@domain/contamination';
import type { MemorizeEvent, Outcome, QuizEvent, RunHeader, RunRollup, SceneEvent } from '@domain/events';
import { computeLatencyZ, deriveFsrsGrade, pushLatency } from '@domain/fsrs';
import { nextFsrsCardState } from '@domain/fsrsScheduler';
import { makeRng, newSeed, type Rng } from '@domain/rng';
import type { RunParams } from '@domain/runParams';
import { resolveCardCount } from '@domain/runParams';
import {
  buildRunSequence,
  groupIntoUnits,
  nextUnlimitedUnit,
  unlimitedFullDeckStream,
  unlimitedWeightedCardStream,
  type Slot,
} from '@domain/sampling';
import { difficultyForSampling, resolveRunWeight } from '@domain/scorer';
import { repository } from '@data/dexieRepository';
import { getItemDifficultyMap } from '@store/scoringStore';

export type Phase = 'idle' | 'memorize' | 'quiz' | 'summary';

type TripletScoring = { retrieved: boolean; scored: [boolean, boolean, boolean] };

type TrainState = {
  phase: Phase;
  header: RunHeader | null;
  units: Slot[][]; // empty for unlimited mode (units generated lazily instead)
  isUnlimited: boolean;
  unlimitedGen: Generator<CardId, never, void> | null;
  currentUnitIndex: number;
  currentUnit: Slot[]; // the unit currently on screen (memorize phase)
  memorizeEvents: MemorizeEvent[];
  unitShownAt: number | null;

  // quiz phase
  quizSlots: Slot[]; // flattened, sequence order
  quizStartedAt: number | null;
  quizIndex: number;
  quizRevealed: boolean;
  quizRevealedAt: number | null;
  sceneEvents: SceneEvent[];
  quizEvents: QuizEvent[];
  tripletScoringByIndex: Map<number, TripletScoring>;
  latencyWindow: number[];

  summaryRollup: RunRollup | null;

  startRun: (params: RunParams, isPractice: boolean) => Promise<void>;
  advanceMemorize: () => Promise<void>;
  abortRun: () => Promise<void>;
  stopUnlimited: () => Promise<void>;
  revealCurrentQuizCard: () => void;
  gradeCurrentQuizCard: (outcome: Outcome) => Promise<void>;
  reset: () => void;
};

const initialState = {
  phase: 'idle' as Phase,
  header: null,
  units: [],
  isUnlimited: false,
  unlimitedGen: null,
  currentUnitIndex: 0,
  currentUnit: [] as Slot[],
  memorizeEvents: [] as MemorizeEvent[],
  unitShownAt: null as number | null,
  quizSlots: [] as Slot[],
  quizStartedAt: null as number | null,
  quizIndex: 0,
  quizRevealed: false,
  quizRevealedAt: null as number | null,
  sceneEvents: [] as SceneEvent[],
  quizEvents: [] as QuizEvent[],
  tripletScoringByIndex: new Map<number, TripletScoring>(),
  latencyWindow: [] as number[],
  summaryRollup: null as RunRollup | null,
};

export const useTrainStore = create<TrainState>((set, get) => ({
  ...initialState,

  async startRun(params, isPractice) {
    const seed = newSeed();
    const rng: Rng = makeRng(seed);
    const weight = resolveRunWeight(isPractice);
    const header: RunHeader = {
      id: `run-${seed}`,
      started_at: Date.now(),
      seed,
      params,
      is_practice: isPractice,
      weight,
      status: 'aborted', // flipped to 'complete' on natural finish
    };
    await repository.createRun(header);

    const difficultyMap = params.set === 'difficult' ? await getItemDifficultyMap() : null;
    const difficulty = (card: CardId, role: Role) =>
      difficultyMap ? difficultyForSampling(difficultyMap.get(itemKey(card, role))) : 0.5;

    const latencyWindow = await repository.getLatencyWindow();

    if (params.count === 'unlimited') {
      const gen =
        params.set === 'full'
          ? unlimitedFullDeckStream(rng)
          : unlimitedWeightedCardStream(rng, (card) =>
              Math.max(difficulty(card, 'P'), difficulty(card, 'A'), difficulty(card, 'O')),
            );
      const firstUnit = nextUnlimitedUnit(gen, params.hand).map(
        (card): Slot => ({ card, role: 'P', tripletIndex: null, positionInTriplet: null }),
      );
      set({
        ...initialState,
        phase: 'memorize',
        header,
        isUnlimited: true,
        unlimitedGen: gen,
        currentUnitIndex: 0,
        currentUnit: firstUnit,
        unitShownAt: Date.now(),
        latencyWindow,
      });
      return;
    }

    const cardCount = resolveCardCount(params.count, params.hand) as number;
    const slots = buildRunSequence({ set: params.set, hand: params.hand, cardCount, difficulty }, rng);
    const units = groupIntoUnits(slots);

    set({
      ...initialState,
      phase: 'memorize',
      header,
      units,
      isUnlimited: false,
      currentUnitIndex: 0,
      currentUnit: units[0] ?? [],
      unitShownAt: Date.now(),
      quizSlots: slots,
      latencyWindow,
    });
  },

  async advanceMemorize() {
    const s = get();
    if (s.phase !== 'memorize' || !s.header || s.unitShownAt === null) return;
    const now = Date.now();
    const event: MemorizeEvent = {
      run_id: s.header.id,
      unit_index: s.currentUnitIndex,
      cards: s.currentUnit.map((slot) => slot.card),
      shown_at: s.unitShownAt,
      advanced_at: now,
      latency_valid: s.header.params.advance !== 'timed',
    };
    await repository.appendMemorizeEvent(event);
    const memorizeEvents = [...s.memorizeEvents, event];

    if (s.isUnlimited) {
      const nextCards = nextUnlimitedUnit(s.unlimitedGen!, s.header.params.hand);
      const nextUnit: Slot[] = nextCards.map((card) => ({
        card,
        role: 'P',
        tripletIndex: null,
        positionInTriplet: null,
      }));
      set({ memorizeEvents, currentUnitIndex: s.currentUnitIndex + 1, currentUnit: nextUnit, unitShownAt: Date.now() });
      return;
    }

    const nextIndex = s.currentUnitIndex + 1;
    if (nextIndex >= s.units.length) {
      // memorize phase complete
      if (s.header.params.quizzed) {
        set({ memorizeEvents, phase: 'quiz', quizIndex: 0, quizRevealed: false, quizStartedAt: Date.now() });
      } else {
        set({ memorizeEvents });
        await finishRun(set, get);
      }
      return;
    }

    set({
      memorizeEvents,
      currentUnitIndex: nextIndex,
      currentUnit: s.units[nextIndex],
      unitShownAt: Date.now(),
    });
  },

  async abortRun() {
    const s = get();
    if (!s.header) return;
    await repository.closeRun(s.header.id, 'aborted', Date.now());
    set({ ...initialState });
  },

  async stopUnlimited() {
    await finishRun(set, get);
  },

  revealCurrentQuizCard() {
    const s = get();
    if (s.phase !== 'quiz' || s.quizRevealed) return;
    set({ quizRevealed: true, quizRevealedAt: Date.now() });
  },

  async gradeCurrentQuizCard(outcome) {
    const s = get();
    if (s.phase !== 'quiz' || !s.header || s.quizRevealedAt === null) return;
    const slot = s.quizSlots[s.quizIndex];
    const committedAt = Date.now();
    const latencyMs = committedAt - s.quizRevealedAt;

    const { event, sceneEvent, tripletScoringByIndex } = buildQuizEvent({
      header: s.header,
      slot,
      sequenceIndex: s.quizIndex,
      outcome,
      revealedAt: s.quizRevealedAt,
      committedAt,
      latencyMs,
      latencyWindow: s.latencyWindow,
      tripletScoringByIndex: s.tripletScoringByIndex,
    });

    await repository.appendQuizEvent(event);
    if (sceneEvent) await repository.appendSceneEvent(sceneEvent);

    let latencyWindow = s.latencyWindow;
    if (event.scored && event.outcome === 'correct') {
      latencyWindow = pushLatency(latencyWindow, latencyMs);
      await repository.setLatencyWindow(latencyWindow);
    }

    // §8.4 — FSRS scheduling is fed the derived grade for scored events only.
    if (event.scored) {
      const key = itemKey(event.card, event.role);
      const prev = await repository.getFsrsCard(key);
      const nextState = nextFsrsCardState(prev ?? null, event.fsrs_grade, new Date(committedAt));
      await repository.setFsrsCard(key, nextState);
    }

    const quizEvents = [...s.quizEvents, event];
    const sceneEvents = sceneEvent ? [...s.sceneEvents, sceneEvent] : s.sceneEvents;

    // Auto-collapse: a blank at position 0 grades positions 1-2 as free 'correct', unscored.
    const autoEvents: QuizEvent[] = [];
    if (slot.positionInTriplet === 0 && outcome === 'blank') {
      const triplet = s.quizSlots.filter((sl) => sl.tripletIndex === slot.tripletIndex);
      for (let p = 1; p <= 2; p++) {
        const collapsedSlot = triplet[p];
        if (!collapsedSlot) continue;
        autoEvents.push({
          run_id: s.header.id,
          sequence_index: s.quizIndex + p,
          triplet_index: slot.tripletIndex!,
          position_in_triplet: p as 1 | 2,
          card: collapsedSlot.card,
          role: collapsedSlot.role,
          outcome: 'correct',
          revealed_at: committedAt,
          committed_at: committedAt,
          latency_ms: 0,
          fsrs_grade: 3,
          scored: false,
          grading: 'self',
        });
      }
    }
    for (const ae of autoEvents) await repository.appendQuizEvent(ae);

    const allQuizEvents = [...quizEvents, ...autoEvents];
    const nextIndex = s.quizIndex + 1 + autoEvents.length;

    set({
      quizEvents: allQuizEvents,
      sceneEvents,
      quizIndex: nextIndex,
      quizRevealed: false,
      quizRevealedAt: null,
      latencyWindow,
      tripletScoringByIndex,
    });

    if (nextIndex >= s.quizSlots.length) {
      await finishRun(set, get);
    }
  },

  reset() {
    set({ ...initialState });
  },
}));

function buildQuizEvent(args: {
  header: RunHeader;
  slot: Slot;
  sequenceIndex: number;
  outcome: Outcome;
  revealedAt: number;
  committedAt: number;
  latencyMs: number;
  latencyWindow: number[];
  tripletScoringByIndex: Map<number, TripletScoring>;
}): { event: QuizEvent; sceneEvent: SceneEvent | null; tripletScoringByIndex: Map<number, TripletScoring> } {
  const { header, slot, sequenceIndex, outcome, revealedAt, committedAt, latencyMs, latencyWindow } = args;

  let scored: boolean;
  let sceneEvent: SceneEvent | null = null;
  let tripletScoringByIndex = args.tripletScoringByIndex;

  if (slot.tripletIndex === null) {
    scored = true; // lone 52nd card — no scene to contaminate
  } else if (slot.positionInTriplet === 0) {
    const scoring = deriveSceneScoring(outcome);
    tripletScoringByIndex = new Map(tripletScoringByIndex);
    tripletScoringByIndex.set(slot.tripletIndex, scoring);
    scored = scoring.scored[0];
    sceneEvent = {
      run_id: header.id,
      triplet_index: slot.tripletIndex,
      retrieved: scoring.retrieved,
      latency_ms: latencyMs,
    };
  } else {
    const scoring = tripletScoringByIndex.get(slot.tripletIndex);
    scored = scoring ? scoring.scored[slot.positionInTriplet!] : true;
  }

  const latencyZ = outcome === 'correct' ? computeLatencyZ(latencyMs, latencyWindow) : undefined;
  const fsrsGrade = deriveFsrsGrade(outcome, latencyZ, latencyWindow.length);

  const event: QuizEvent = {
    run_id: header.id,
    sequence_index: sequenceIndex,
    triplet_index: slot.tripletIndex ?? -1,
    position_in_triplet: (slot.positionInTriplet ?? 0) as 0 | 1 | 2,
    card: slot.card,
    role: slot.role,
    outcome,
    revealed_at: revealedAt,
    committed_at: committedAt,
    latency_ms: latencyMs,
    latency_z: latencyZ,
    fsrs_grade: fsrsGrade,
    scored,
    grading: 'self',
  };

  return { event, sceneEvent, tripletScoringByIndex };
}

function computeRollup(s: TrainState, endedAt: number): RunRollup {
  // §9.1 harsh definition: a collapsed (unscored) triplet counts as 3 misses, not
  // the free 'correct' the reveal handed positions 1-2. Uncontaminated events
  // (wrong_card at position 0, or anything scored:true) count at face value.
  const n_correct = s.quizEvents.filter((e) => e.scored && e.outcome === 'correct').length;
  const n_wrong_card = s.quizEvents.filter((e) => e.outcome === 'wrong_card').length;
  const n_blank = s.quizEvents.filter((e) => e.outcome === 'blank' || !e.scored).length;
  const memorize_ms =
    s.memorizeEvents.length > 0
      ? s.memorizeEvents[s.memorizeEvents.length - 1].advanced_at - s.memorizeEvents[0].shown_at
      : 0;
  const quiz_ms = s.quizStartedAt !== null ? endedAt - s.quizStartedAt : 0;
  return {
    n_cards: s.memorizeEvents.reduce((acc, e) => acc + e.cards.length, 0),
    n_correct,
    n_wrong_card,
    n_blank,
    memorize_ms,
    quiz_ms,
    total_ms: endedAt - (s.header?.started_at ?? endedAt),
  };
}

async function finishRun(set: (partial: Partial<TrainState>) => void, get: () => TrainState) {
  const s = get();
  if (!s.header) return;
  const endedAt = Date.now();
  const rollup = computeRollup(s, endedAt);
  await repository.closeRun(s.header.id, 'complete', endedAt, rollup);
  set({ phase: 'summary', summaryRollup: rollup });
}
