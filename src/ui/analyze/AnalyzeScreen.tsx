import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import type { RunHeader } from '@domain/events';
import { computeMemorizeTicks, computeQuizTicks } from '@domain/ribbon';
import { repository } from '@data/dexieRepository';
import { RunRibbon } from '@ui/components/RunRibbon';
import { RecallStatsScreen } from './RecallStatsScreen';
import { WeakestItemsScreen } from './WeakestItemsScreen';

type Tab = 'runs' | 'weakest' | 'recall';

export function AnalyzeScreen({ onOpenRun }: { onOpenRun: (runId: string) => void }) {
  const [tab, setTab] = useState<Tab>('runs');
  const [bestMemorizeMs, setBestMemorizeMs] = useState<number | null>(null);

  useEffect(() => {
    repository.listRuns().then((runs) => {
      const best = runs
        .filter((r) => r.is_practice && r.status === 'complete' && r.rollup?.memorize_ms)
        .map((r) => r.rollup!.memorize_ms)
        .reduce((min, ms) => (ms < min ? ms : min), Infinity);
      setBestMemorizeMs(isFinite(best) ? best : null);
    });
  }, []);

  function fmtMs(ms: number) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  return (
    <div style={{ padding: '16px 12px 100px', maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-rank)', fontSize: 28, margin: '8px 0 16px' }}>Analyze</h1>

      {bestMemorizeMs !== null && (
        <div
          style={{
            background: 'var(--felt-raised)',
            border: '1px solid var(--brass)',
            borderRadius: 12,
            padding: '12px 16px',
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 13, color: 'var(--slate)' }}>Best practice memorize time</span>
          <span className="mono" style={{ fontSize: 22, color: 'var(--brass)', fontWeight: 700 }}>
            {fmtMs(bestMemorizeMs)}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <TabButton label="Runs" active={tab === 'runs'} onClick={() => setTab('runs')} />
        <TabButton label="Weakest items" active={tab === 'weakest'} onClick={() => setTab('weakest')} />
        <TabButton label="Recall" active={tab === 'recall'} onClick={() => setTab('recall')} />
      </div>
      {tab === 'runs' && <RunList onOpenRun={onOpenRun} />}
      {tab === 'weakest' && <WeakestItemsScreen />}
      {tab === 'recall' && <RecallStatsScreen />}
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'var(--brass)' : 'var(--felt-raised)',
        color: active ? 'var(--ink)' : 'var(--stock)',
        border: 'none',
        borderRadius: 20,
        padding: '8px 16px',
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  );
}

function RunList({ onOpenRun }: { onOpenRun: (runId: string) => void }) {
  const [runs, setRuns] = useState<RunHeader[] | null>(null);
  const [includeAborted, setIncludeAborted] = useState(false);
  const [ribbons, setRibbons] = useState<Record<string, { ticks: ReturnType<typeof computeMemorizeTicks>; merge: boolean[] }>>({});

  function load() {
    repository.listRuns().then(async (all) => {
      setRuns(all);
      const entries = await Promise.all(
        all.map(async (run) => {
          const events = await repository.getRunEvents(run.id);
          const total = run.rollup?.n_cards ?? events.memorize.reduce((a, e) => a + e.cards.length, 0);
          if (run.params.quizzed && events.quiz.length > 0) {
            const { ticks, mergeWithPrev } = computeQuizTicks(total, events.quiz);
            return [run.id, { ticks, merge: mergeWithPrev }] as const;
          }
          const shown = events.memorize.reduce((a, e) => a + e.cards.length, 0);
          return [run.id, { ticks: computeMemorizeTicks(total, shown), merge: new Array(total).fill(false) }] as const;
        }),
      );
      setRibbons(Object.fromEntries(entries));
    });
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(runId: string) {
    await repository.deleteRun(runId);
    load();
  }

  if (!runs) return <p style={{ color: 'var(--slate)' }}>Loading…</p>;

  const visible = includeAborted ? runs : runs.filter((r) => r.status === 'complete');

  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--slate)', marginBottom: 12 }}>
        <input type="checkbox" checked={includeAborted} onChange={(e) => setIncludeAborted(e.target.checked)} />
        Include aborted runs
      </label>

      {visible.length === 0 && <p style={{ color: 'var(--slate)' }}>No runs yet.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visible.map((run) => (
          <RunRow
            key={run.id}
            run={run}
            ribbon={ribbons[run.id]}
            onOpen={() => onOpenRun(run.id)}
            onDelete={() => handleDelete(run.id)}
          />
        ))}
      </div>
    </div>
  );
}

const DELETE_REVEAL = 72; // px to reveal the delete button
const DELETE_COMMIT = 140; // px to auto-commit delete on release

function RunRow({
  run,
  ribbon,
  onOpen,
  onDelete,
}: {
  run: RunHeader;
  ribbon?: { ticks: ReturnType<typeof computeMemorizeTicks>; merge: boolean[] };
  onOpen: () => void;
  onDelete: () => void;
}) {
  const x = useMotionValue(0);
  const deleteOpacity = useTransform(x, [-DELETE_REVEAL, -20], [1, 0]);
  const [revealed, setRevealed] = useState(false);
  const dragging = useRef(false);

  const date = new Date(run.started_at);
  const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const summary = `${run.params.set} / ${run.params.hand} / ${run.params.advance} / ${run.params.count}${run.params.quizzed ? ' / quizzed' : ''}`;
  const durationSec = run.rollup ? Math.round(run.rollup.total_ms / 1000) : null;
  const pct =
    run.rollup && run.rollup.n_cards > 0 ? Math.round((run.rollup.n_correct / run.rollup.n_cards) * 100) : null;

  function handleDragEnd(_: unknown, info: { offset: { x: number } }) {
    dragging.current = false;
    if (info.offset.x < -DELETE_COMMIT) {
      onDelete();
      return;
    }
    if (info.offset.x < -DELETE_REVEAL / 2) {
      x.set(-DELETE_REVEAL);
      setRevealed(true);
    } else {
      x.set(0);
      setRevealed(false);
    }
  }

  function handleCardClick() {
    if (revealed) {
      x.set(0);
      setRevealed(false);
      return;
    }
    onOpen();
  }

  return (
    <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden' }}>
      {/* Delete zone behind the card */}
      <motion.div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: DELETE_REVEAL,
          background: 'var(--carmine)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: deleteOpacity,
        }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{ background: 'none', border: 'none', color: 'var(--stock)', fontSize: 22, cursor: 'pointer', padding: 8 }}
          aria-label="Delete run"
        >
          🗑
        </button>
      </motion.div>

      {/* Swipeable card */}
      <motion.button
        drag="x"
        dragConstraints={{ left: -DELETE_REVEAL, right: 0 }}
        dragElastic={0.1}
        style={{ x, touchAction: 'pan-y', width: '100%' }}
        onDragStart={() => { dragging.current = true; }}
        onDragEnd={handleDragEnd}
        onClick={handleCardClick}
        whileTap={{ scale: revealed ? 1 : 0.99 }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: 12,
            background: 'var(--felt-raised)',
            border: run.is_practice ? '1px solid var(--brass)' : '1px solid rgba(239,231,214,0.1)',
            borderRadius: 10,
            textAlign: 'left',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          {ribbon && ribbon.ticks.length > 0 && <RunRibbon ticks={ribbon.ticks} mergeWithPrev={ribbon.merge} />}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 14 }}>
              {dateStr} {run.is_practice && <span style={{ color: 'var(--brass)', fontSize: 11 }}>PRACTICE</span>}
              {run.status === 'aborted' && <span style={{ color: 'var(--slate)', fontSize: 11 }}> · ABORTED</span>}
            </span>
            <span className="mono" style={{ fontSize: 14, color: pct !== null ? 'var(--brass)' : 'var(--slate)' }}>
              {pct !== null ? `${pct}%` : '—'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--slate)', display: 'flex', justifyContent: 'space-between' }}>
            <span>{summary}</span>
            <span className="mono">{durationSec !== null ? `${Math.floor(durationSec / 60)}m${durationSec % 60}s` : ''}</span>
          </div>
        </div>
      </motion.button>
    </div>
  );
}
