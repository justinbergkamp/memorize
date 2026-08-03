import { useEffect, useState } from 'react';
import { displayCard } from '@domain/cards';
import { difficultyScore, isEligibleForDifficultSet, MIN_OBSERVATIONS_FOR_ELIGIBILITY, type ItemStats } from '@domain/scorer';
import { getItemDifficultyMap } from '@store/scoringStore';

const ROLE_LABEL = { P: 'Person', A: 'Action', O: 'Object' } as const;

export function WeakestItemsScreen() {
  const [stats, setStats] = useState<ItemStats[] | null>(null);

  useEffect(() => {
    getItemDifficultyMap().then((map) => setStats([...map.values()]));
  }, []);

  if (!stats) return <p style={{ color: 'var(--slate)' }}>Loading…</p>;

  const eligible = stats.filter(isEligibleForDifficultSet);

  if (eligible.length === 0) {
    return (
      <p style={{ color: 'var(--slate)', fontSize: 14, lineHeight: 1.6 }}>
        No weak items yet. An item needs {MIN_OBSERVATIONS_FOR_ELIGIBILITY}+ scored quiz observations before it shows
        up here — keep running quizzed drills and this list will fill in.
      </p>
    );
  }

  const top20 = eligible
    .map((s) => ({ ...s, difficulty: difficultyScore(s) }))
    .sort((a, b) => b.difficulty - a.difficulty)
    .slice(0, 20);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {top20.map((item) => (
        <div
          key={`${item.card}:${item.role}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px',
            background: 'var(--felt-raised)',
            borderRadius: 8,
            fontSize: 14,
          }}
        >
          <span>
            <span className="mono">{displayCard(item.card)}</span>{' '}
            <span style={{ color: 'var(--slate)' }}>{ROLE_LABEL[item.role]}</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--slate)' }}>{item.observations} obs</span>
            <DifficultyBar value={item.difficulty} />
          </span>
        </div>
      ))}
    </div>
  );
}

function DifficultyBar({ value }: { value: number }) {
  return (
    <span style={{ width: 60, height: 6, background: 'rgba(239,231,214,0.1)', borderRadius: 3, display: 'inline-block', overflow: 'hidden' }}>
      <span style={{ display: 'block', width: `${value * 100}%`, height: '100%', background: 'var(--carmine)' }} />
    </span>
  );
}
