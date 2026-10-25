import { useEffect, useState } from 'react';
import { displayCard } from '@domain/cards';
import {
  itemTimings,
  median,
  RECALL_MIN_OBSERVATIONS,
  roleTimings,
  sessionTimings,
  type RecallEvent,
} from '@domain/recall';
import { repository } from '@data/dexieRepository';

const ROLE_LABEL = { P: 'Person', A: 'Action', O: 'Object' } as const;
const SESSIONS_SHOWN = 12;
const SLOWEST_SHOWN = 20;

const fmt = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

export function RecallStatsScreen() {
  const [events, setEvents] = useState<RecallEvent[] | null>(null);

  useEffect(() => {
    repository.getAllRecallEvents().then(setEvents);
  }, []);

  if (!events) return <p style={{ color: 'var(--slate)' }}>Loading…</p>;
  if (events.length === 0) {
    return <p style={{ color: 'var(--slate)', fontSize: 14 }}>No Recall data yet. Run a Recall session and your timings show up here.</p>;
  }

  const correct = events.filter((e) => e.correct);
  const overall = median(correct.map((e) => e.latency_ms));
  const overallFirst = median(correct.map((e) => e.first_input_ms));
  const roles = roleTimings(events);
  const sessions = sessionTimings(events).slice(-SESSIONS_SHOWN);
  const slowest = itemTimings(events)
    .filter((t) => t.n >= RECALL_MIN_OBSERVATIONS)
    .sort((a, b) => b.medianMs - a.medianMs)
    .slice(0, SLOWEST_SHOWN);
  const maxSession = Math.max(...sessions.map((s) => s.medianMs), 1);
  const maxSlow = Math.max(...slowest.map((t) => t.medianMs), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Stat label="Median response" value={overall !== null ? fmt(overall) : '—'} />
        <Stat label="Median to first tap" value={overallFirst !== null ? fmt(overallFirst) : '—'} />
      </div>

      <Section title="By role (median)">
        {(['P', 'A', 'O'] as const).map((r) => (
          <Row
            key={r}
            left={ROLE_LABEL[r]}
            right={roles[r] ? `${fmt(roles[r]!.medianMs)} · ${roles[r]!.n}` : '—'}
          />
        ))}
      </Section>

      <Section title={`Sessions (median, last ${sessions.length})`}>
        {sessions.map((s) => (
          <Row
            key={s.session_id}
            left={new Date(s.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            right={`${fmt(s.medianMs)} · ${s.n}`}
            bar={s.medianMs / maxSession}
          />
        ))}
      </Section>

      <Section title="Slowest items">
        {slowest.length === 0 ? (
          <p style={{ color: 'var(--slate)', fontSize: 13, margin: 0 }}>
            An item needs {RECALL_MIN_OBSERVATIONS}+ correct answers before it ranks here.
          </p>
        ) : (
          slowest.map((t) => (
            <Row
              key={`${t.card}:${t.role}`}
              left={
                <>
                  <span className="mono">{displayCard(t.card)}</span>{' '}
                  <span style={{ color: 'var(--slate)' }}>{ROLE_LABEL[t.role]}</span>
                </>
              }
              right={`${fmt(t.medianMs)} · ${t.n}`}
              bar={t.medianMs / maxSlow}
            />
          ))
        )}
      </Section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--felt-raised)', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 12, color: 'var(--slate)' }}>{label}</div>
      <div className="mono" style={{ fontSize: 24, color: 'var(--brass)', fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  );
}

function Row({ left, right, bar }: { left: React.ReactNode; right: string; bar?: number }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', background: 'var(--felt-raised)', borderRadius: 8, padding: '10px 12px', fontSize: 14, display: 'flex', justifyContent: 'space-between' }}>
      {bar !== undefined && (
        <div style={{ position: 'absolute', inset: 0, width: `${Math.round(bar * 100)}%`, background: 'rgba(201,162,39,0.14)' }} />
      )}
      <span style={{ position: 'relative' }}>{left}</span>
      <span className="mono" style={{ position: 'relative' }}>{right}</span>
    </div>
  );
}
