import { useEffect, useState } from 'react';
import { PROGRESSION_FLOOR_S, PROGRESSION_START_INTERVAL_S, currentInterval, progressionHistory, type ProgressionPoint } from '@domain/progression';
import { repository } from '@data/dexieRepository';

const W = 320;
const H = 140;
const PAD = { l: 34, r: 10, t: 10, b: 20 };

/** §X — interval vs run for Progression mode. Hollow = botched (never moved the interval); brass = clean; slate = not clean. */
export function ProgressionScreen() {
  const [data, setData] = useState<{ points: ProgressionPoint[]; current: number } | null>(null);

  useEffect(() => {
    repository.listRuns().then((runs) => setData({ points: progressionHistory(runs), current: currentInterval(runs) }));
  }, []);

  if (!data) return <p style={{ color: 'var(--slate)' }}>Loading…</p>;
  const { points, current } = data;

  if (points.length === 0) {
    return (
      <p style={{ color: 'var(--slate)', fontSize: 14 }}>
        No Progression runs yet. Start one from the Train tab; it begins at {PROGRESSION_START_INTERVAL_S.toFixed(1)}s per triplet.
      </p>
    );
  }

  const lo = Math.min(PROGRESSION_FLOOR_S, ...points.map((p) => p.interval_s));
  const hi = Math.max(PROGRESSION_START_INTERVAL_S, ...points.map((p) => p.interval_s));
  const x = (i: number) => PAD.l + (points.length === 1 ? (W - PAD.l - PAD.r) / 2 : (i / (points.length - 1)) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.interval_s).toFixed(1)}`).join(' ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: 'var(--felt-raised)', borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--slate)' }}>Next interval</span>
        <span className="mono" style={{ fontSize: 22, color: 'var(--brass)', fontWeight: 700 }}>
          {current.toFixed(1)}s
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Progression interval by run">
        {[hi, lo].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="rgba(239,231,214,0.1)" />
            <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--slate)" className="mono">
              {v.toFixed(1)}
            </text>
          </g>
        ))}
        <path d={line} fill="none" stroke="rgba(239,231,214,0.25)" strokeWidth="1.5" />
        {points.map((p, i) => (
          <circle
            key={p.run_id}
            cx={x(i)}
            cy={y(p.interval_s)}
            r={4}
            fill={p.excluded ? 'var(--felt)' : p.clean ? 'var(--brass)' : 'var(--slate)'}
            stroke={p.excluded ? 'var(--slate)' : 'none'}
            strokeWidth={1.5}
          />
        ))}
        <text x={PAD.l} y={H - 4} fontSize="10" fill="var(--slate)" className="mono">
          run 1
        </text>
        <text x={W - PAD.r} y={H - 4} textAnchor="end" fontSize="10" fill="var(--slate)" className="mono">
          run {points.length}
        </text>
      </svg>

      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--slate)', flexWrap: 'wrap' }}>
        <Legend color="var(--brass)" label="clean" />
        <Legend color="var(--slate)" label="not clean" />
        <Legend color="var(--felt)" stroke="var(--slate)" label="botched (not counted)" />
      </div>
    </div>
  );
}

function Legend({ color, label, stroke }: { color: string; label: string; stroke?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <svg width="10" height="10">
        <circle cx="5" cy="5" r="4" fill={color} stroke={stroke ?? 'none'} strokeWidth="1.5" />
      </svg>
      {label}
    </span>
  );
}
