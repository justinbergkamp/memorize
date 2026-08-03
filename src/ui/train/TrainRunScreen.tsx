import { useEffect, useMemo, useState } from 'react';
import { motion, useMotionValue } from 'framer-motion';
import type { Outcome } from '@domain/events';
import { computeMemorizeTicks, computeQuizTicks, type TickState } from '@domain/ribbon';
import { useConfigStore } from '@store/configStore';
import { useTrainStore } from '@store/trainStore';
import { BigCard } from '@ui/components/BigCard';
import { RunRibbon } from '@ui/components/RunRibbon';
import { useWakeLock } from '@ui/hooks/useWakeLock';
import { SummaryScreen } from './SummaryScreen';

const ROLE_LABEL = { P: 'Person', A: 'Action', O: 'Object' } as const;
const SWIPE_THRESHOLD = 100;

export function TrainRunScreen({ onExit }: { onExit: () => void }) {
  const state = useTrainStore();
  const { phase, header, currentUnit, quizSlots, quizIndex, quizRevealed, quizEvents } = state;
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

function QuizPane({
  slot,
  revealed,
}: {
  slot: ReturnType<typeof useTrainStore.getState>['quizSlots'][number];
  revealed: boolean;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [flying, setFlying] = useState<Outcome | null>(null);

  useEffect(() => {
    x.set(0);
    y.set(0);
    setFlying(null);
  }, [slot]);

  if (!slot) return null;

  function reveal() {
    useTrainStore.getState().revealCurrentQuizCard();
  }

  function commit(outcome: Outcome) {
    setFlying(outcome);
    useTrainStore.getState().gradeCurrentQuizCard(outcome);
  }

  function handleDragEnd(_: unknown, info: { offset: { x: number; y: number } }) {
    const { x: ox, y: oy } = info.offset;
    if (Math.abs(oy) > Math.abs(ox) && Math.abs(oy) > SWIPE_THRESHOLD) {
      commit('correct');
    } else if (ox < -SWIPE_THRESHOLD) {
      commit('blank');
    } else if (ox > SWIPE_THRESHOLD) {
      commit('wrong_card');
    }
  }

  const flyOffset: Record<Outcome, { x: number; y: number }> = {
    correct: { x: 0, y: y.get() < 0 ? -600 : 600 },
    blank: { x: -600, y: 0 },
    wrong_card: { x: 600, y: 0 },
  };
  const tint = flying === 'correct' ? 'var(--brass)' : flying === 'blank' ? 'var(--slate)' : flying === 'wrong_card' ? 'var(--carmine)' : undefined;

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
            drag={!flying}
            style={{
              width: '100%',
              height: '100%',
              x,
              y,
              touchAction: 'none',
              overscrollBehavior: 'none',
              userSelect: 'none',
              filter: tint ? `drop-shadow(0 0 0 ${tint})` : undefined,
            }}
            animate={flying ? { x: flyOffset[flying].x, y: flyOffset[flying].y, opacity: 0 } : undefined}
            transition={{ duration: 0.2 }}
            onDragEnd={handleDragEnd}
          >
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
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
      {revealed && !flying && (
        <div style={{ fontSize: 12, color: 'var(--slate)', textAlign: 'center' }}>
          ↑ ↓ correct &nbsp;·&nbsp; ← blank &nbsp;·&nbsp; → wrong card
        </div>
      )}
    </div>
  );
}
