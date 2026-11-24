import { useEffect, useMemo, useRef, useState } from 'react';
import { animate, motion, useMotionValue } from 'framer-motion';
import type { Outcome } from '@domain/events';
import { computeMemorizeTicks, computeQuizTicks, type TickState } from '@domain/ribbon';
import { useConfigStore } from '@store/configStore';
import { useTrainStore } from '@store/trainStore';
import { BigCard } from '@ui/components/BigCard';
import { RunRibbon } from '@ui/components/RunRibbon';
import { useCardGesture } from '@ui/hooks/useCardGesture';
import { useWakeLock } from '@ui/hooks/useWakeLock';
import { SummaryScreen } from './SummaryScreen';

const ROLE_LABEL = { P: 'Person', A: 'Action', O: 'Object' } as const;

export function TrainRunScreen({ onExit }: { onExit: () => void }) {
  const state = useTrainStore();
  const { phase, header, currentUnit, quizSlots, quizIndex, quizRevealed, quizEvents, quizUnitShownAt, unitShownAt } = state;
  const entries = useConfigStore((s) => s.entries);
  const [now, setNow] = useState(Date.now());

  useWakeLock(phase === 'memorize' || phase === 'quiz');

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        useTrainStore.getState().abortRun().then(onExit);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onExit]);

  useEffect(() => {
    if (phase !== 'memorize' || !header || header.params.advance !== 'timed') return;
    const ms = header.params.timed_ms ?? 3000;
    const id = setTimeout(() => useTrainStore.getState().advanceMemorize(), ms);
    return () => clearTimeout(id);
  }, [phase, header, currentUnit]);

  // §X — Progression quiz timer: position 0 of each triplet (or the lone card) must be graded within
  // the interval, or the whole triplet counts as blank. `quizUnitShownAt` is null once position 0 is graded.
  const quizTimerMs = header?.progression ? header.params.timed_ms ?? null : null;
  useEffect(() => {
    if (phase !== 'quiz' || quizTimerMs === null || quizUnitShownAt === null) return;
    const left = Math.max(0, quizUnitShownAt + quizTimerMs - Date.now());
    const id = setTimeout(() => useTrainStore.getState().expireQuizUnit(), left);
    return () => clearTimeout(id);
  }, [phase, quizTimerMs, quizUnitShownAt]);

  // Countdown bar for whichever timer is running. Keyed on the unit start so each unit restarts it.
  const countdown =
    phase === 'memorize' && header?.params.advance === 'timed' && unitShownAt !== null
      ? { key: `m${unitShownAt}`, ms: header.params.timed_ms ?? 3000 }
      : phase === 'quiz' && quizTimerMs !== null && quizUnitShownAt !== null
        ? { key: `q${quizUnitShownAt}`, ms: quizTimerMs }
        : null;

  const boundedTotal = header && header.params.count !== 'unlimited' ? quizSlots.length : null;

  const { ticks, mergeWithPrev } = useMemo(() => {
    if (boundedTotal === null) return { ticks: [] as TickState[], mergeWithPrev: [] as boolean[] };
    if (phase === 'memorize') {
      const shown = state.memorizeEvents.reduce((acc, e) => acc + e.cards.length, 0) + currentUnit.length;
      return { ticks: computeMemorizeTicks(boundedTotal, shown), mergeWithPrev: new Array(boundedTotal).fill(false) };
    }
    return computeQuizTicks(boundedTotal, quizEvents);
  }, [phase, boundedTotal, state.memorizeEvents, currentUnit, quizEvents]);

  if (!header) return null;
  if (phase === 'summary') return <SummaryScreen onExit={onExit} />;

  const elapsedSec = Math.max(0, Math.floor((now - header.started_at) / 1000));
  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const ss = String(elapsedSec % 60).padStart(2, '0');

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--felt)',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div style={{ padding: '10px 12px 6px' }}>
        {boundedTotal !== null ? (
          <RunRibbon ticks={ticks} mergeWithPrev={mergeWithPrev} />
        ) : (
          <div style={{ height: 4 }} />
        )}
        <div style={{ height: 3, marginTop: 6, background: 'rgba(239,231,214,0.08)', borderRadius: 2, overflow: 'hidden' }}>
          {countdown && (
            <div
              key={countdown.key}
              style={{
                height: '100%',
                background: 'var(--brass)',
                transformOrigin: 'left',
                // Don't derive a delay from Date.now() here: this re-renders every 250ms and each
                // change would shift the running animation forward. The key restarts it per unit.
                animation: `unit-countdown ${countdown.ms}ms linear forwards`,
              }}
            />
          )}
        </div>
        <div
          className="mono"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 13, color: 'var(--slate)' }}
        >
          <button
            onClick={() => useTrainStore.getState().abortRun().then(onExit)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--slate)',
              fontSize: 18,
              lineHeight: 1,
              cursor: 'pointer',
              padding: '0 4px',
            }}
            aria-label="Exit run"
          >
            ×
          </button>
          <span>{phase === 'memorize' ? 'Memorize' : 'Quiz'}</span>
          <span>
            {mm}:{ss}
          </span>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 16px' }}>
        {phase === 'memorize' && (
          <MemorizePane unit={currentUnit} hand={header.params.hand} advance={header.params.advance} />
        )}
        {phase === 'quiz' && (
          <QuizPane
            slot={quizSlots[quizIndex]}
            revealed={quizRevealed}
          />
        )}
      </div>
    </div>
  );
}

function MemorizePane({
  unit,
  hand,
  advance,
}: {
  unit: ReturnType<typeof useTrainStore.getState>['currentUnit'];
  hand: 'single' | 'triplet';
  advance: 'tap' | 'timed';
}) {
  const isTriplet = unit.length === 3;
  const isLone = unit.length === 1 && hand === 'triplet';

  function handleTap() {
    if (advance === 'tap') useTrainStore.getState().advanceMemorize();
  }

  return (
    <div onClick={handleTap} style={{ display: 'flex', flexDirection: 'column', gap: 20, cursor: advance === 'tap' ? 'pointer' : 'default' }}>
      <div style={{ display: 'flex', gap: isTriplet ? 10 : 0, justifyContent: 'center' }}>
        {unit.map((slot, i) => (
          <div key={i} style={{ width: isTriplet ? '30%' : '60%', maxWidth: 220 }}>
            <BigCard card={slot.card} />
          </div>
        ))}
      </div>
      {advance === 'tap' && (
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--slate)' }}>Tap anywhere to continue</div>
      )}
    </div>
  );
}

function roleField(role: 'P' | 'A' | 'O'): 'person' | 'action' | 'object' {
  return role === 'P' ? 'person' : role === 'A' ? 'action' : 'object';
}

const FLY_DISTANCE = 600;
const FLY_MS = 0.2;

const GRADE_BUTTONS: { outcome: Outcome; label: string; hint: string; color: string }[] = [
  { outcome: 'blank', label: 'Blank', hint: '←', color: 'var(--slate)' },
  { outcome: 'correct', label: 'Correct', hint: '↑ ↓', color: 'var(--brass)' },
  { outcome: 'wrong_card', label: 'Wrong card', hint: '→', color: 'var(--carmine)' },
];

function QuizPane({
  slot,
  revealed,
}: {
  slot: ReturnType<typeof useTrainStore.getState>['quizSlots'][number];
  revealed: boolean;
}) {
  const opacity = useMotionValue(1);
  const [flying, setFlying] = useState<Outcome | null>(null);
  // Single-flight lock: a swipe and a button tap (or two taps) must never grade the same card twice.
  const gradingRef = useRef(false);

  const gesture = useCardGesture({
    enabled: revealed && !flying,
    grading: flying !== null,
    onCommit: (outcome, from) => commit(outcome, from.y >= 0 ? 1 : -1),
  });
  const { x, y } = gesture;

  // New card: everything back to a clean slate.
  useEffect(() => {
    gesture.reset();
    opacity.set(1);
    gradingRef.current = false;
    setFlying(null);
  }, [slot]);

  if (!slot) return null;

  function reveal() {
    useTrainStore.getState().revealCurrentQuizCard();
  }

  async function commit(outcome: Outcome, verticalDir: 1 | -1 = -1) {
    if (gradingRef.current) return;
    gradingRef.current = true;
    gesture.cancel(); // drop any pointer still held (e.g. a button tapped mid-drag)
    setFlying(outcome);

    const target = {
      x: outcome === 'blank' ? -FLY_DISTANCE : outcome === 'wrong_card' ? FLY_DISTANCE : 0,
      y: outcome === 'correct' ? verticalDir * FLY_DISTANCE : 0,
    };
    animate(x, target.x, { duration: FLY_MS });
    animate(y, target.y, { duration: FLY_MS });
    animate(opacity, 0, { duration: FLY_MS });

    const indexAtCommit = useTrainStore.getState().quizIndex;
    try {
      await useTrainStore.getState().gradeCurrentQuizCard(outcome);
    } catch {
      // fall through to the recovery check below
    }

    // If the store did not move on (refused the grade, or a write failed), the card is still the
    // current one. Bring it back instead of leaving an invisible card and a soft-locked run.
    const s = useTrainStore.getState();
    if (s.phase === 'quiz' && s.quizIndex === indexAtCommit && s.quizRevealed) {
      gradingRef.current = false;
      setFlying(null);
      opacity.set(1);
      gesture.springHome();
    }
  }

  const tint =
    flying === 'correct' ? 'var(--brass)' : flying === 'blank' ? 'var(--slate)' : flying === 'wrong_card' ? 'var(--carmine)' : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{ width: '65%', maxWidth: 240, aspectRatio: '200/280', position: 'relative' }}>
        {!revealed ? (
          <div
            onClick={reveal}
            style={{ width: '100%', height: '100%', touchAction: 'none', userSelect: 'none' }}
          >
            <BigCard card={slot.card} faceDown />
          </div>
        ) : (
          <motion.div
            {...gesture.handlers}
            style={{
              width: '100%',
              height: '100%',
              x,
              y,
              opacity,
              touchAction: 'none',
              overscrollBehavior: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              cursor: flying ? 'default' : 'grab',
            }}
          >
            <div style={{ position: 'relative', width: '100%', height: '100%', pointerEvents: 'none' }}>
              <BigCard card={slot.card} />
              {tint && (
                <div style={{ position: 'absolute', inset: 0, background: tint, opacity: 0.35, borderRadius: 16 }} />
              )}
            </div>
          </motion.div>
        )}
      </div>

      {!revealed && (
        <div style={{ fontSize: 12, color: 'var(--slate)' }}>Recall it, then tap to reveal</div>
      )}
      {revealed && (
        <>
          <div style={{ fontSize: 12, color: 'var(--slate)', textAlign: 'center' }}>
            Swipe ↑ ↓ correct &nbsp;·&nbsp; ← blank &nbsp;·&nbsp; → wrong card
          </div>
          {/* Fallback grading: the run can never soft-lock on a gesture that won't register. */}
          <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 360 }}>
            {GRADE_BUTTONS.map((b) => (
              <button
                key={b.outcome}
                disabled={flying !== null}
                onClick={() => commit(b.outcome)}
                style={{
                  flex: 1,
                  background: 'var(--felt-raised)',
                  border: `1px solid ${b.color}`,
                  borderRadius: 10,
                  color: 'var(--stock)',
                  padding: '12px 4px',
                  fontSize: 14,
                  fontWeight: 600,
                  opacity: flying !== null ? 0.4 : 1,
                  touchAction: 'manipulation',
                }}
              >
                {b.label}
                <div className="mono" style={{ fontSize: 11, color: b.color, fontWeight: 400 }}>
                  {b.hint}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
