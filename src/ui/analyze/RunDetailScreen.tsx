import { useEffect, useState } from 'react';
import type { RunHeader, SceneEvent, QuizEvent } from '@domain/events';
import { displayCard } from '@domain/cards';
import { repository } from '@data/dexieRepository';

type Detail = { header: RunHeader; memorizeCount: number; scene: SceneEvent[]; quiz: QuizEvent[] };

export function RunDetailScreen({ runId, onBack }: { runId: string; onBack: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);

  useEffect(() => {
    (async () => {
      const header = await repository.getRun(runId);
      if (!header) return;
      const events = await repository.getRunEvents(runId);
      setDetail({
        header,
        memorizeCount: events.memorize.reduce((a, e) => a + e.cards.length, 0),
        scene: events.scene,
        quiz: events.quiz,
      });
    })();
  }, [runId]);

  if (!detail) {
    return (
      <div style={{ padding: 16 }}>
        <BackButton onBack={onBack} />
        <p style={{ color: 'var(--slate)' }}>Loading…</p>
      </div>
    );
  }

  const { header, memorizeCount, scene, quiz } = detail;
  const rollup = header.rollup;
  const triplets = Array.from(new Set(quiz.map((q) => q.triplet_index).filter((t) => t >= 0))).sort((a, b) => a - b);

  return (
    <div style={{ padding: '16px 12px 100px', maxWidth: 640, margin: '0 auto' }}>
      <BackButton onBack={onBack} />
      <h1 style={{ fontFamily: 'var(--font-rank)', fontSize: 24, margin: '8px 0 16px' }}>Run detail</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        <StatCard label="Cards" value={String(memorizeCount)} />
        <StatCard label="Memorize" value={rollup ? `${Math.round(rollup.memorize_ms / 1000)}s` : '—'} />
        <StatCard label="Quiz" value={rollup ? `${Math.round(rollup.quiz_ms / 1000)}s` : '—'} />
      </div>

      {rollup && header.params.quizzed && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 24, fontSize: 13 }}>
          <span style={{ color: 'var(--brass)' }}>{rollup.n_correct} correct</span>
          <span style={{ color: 'var(--carmine)' }}>{rollup.n_wrong_card} wrong card</span>
          <span style={{ color: 'var(--slate)' }}>{rollup.n_blank} blank</span>
        </div>
      )}

      {header.params.quizzed && triplets.length > 0 && (
        <div>
          <h2 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--slate)', marginBottom: 8 }}>
            Per-triplet
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {triplets.map((t) => {
              const sceneEv = scene.find((s) => s.triplet_index === t);
              const cards = quiz.filter((q) => q.triplet_index === t).sort((a, b) => a.position_in_triplet - b.position_in_triplet);
              return (
                <div
                  key={t}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    background: 'var(--felt-raised)',
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                >
                  <span
                    className="mono"
                    style={{ width: 40, color: sceneEv?.retrieved === false ? 'var(--slate)' : 'var(--brass)' }}
                  >
                    #{t + 1}
                  </span>
                  {cards.map((c) => (
                    <span
                      key={c.position_in_triplet}
                      className="mono"
                      style={{
                        color: !c.scored ? 'var(--slate)' : c.outcome === 'correct' ? 'var(--brass)' : c.outcome === 'wrong_card' ? 'var(--carmine)' : 'var(--slate)',
                      }}
                    >
                      {displayCard(c.card)}
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--brass)', fontSize: 14, padding: 0 }}>
      ← Runs
    </button>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--felt-raised)', borderRadius: 10, padding: '10px 12px' }}>
      <div className="mono" style={{ fontSize: 18 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--slate)' }}>{label}</div>
    </div>
  );
}
