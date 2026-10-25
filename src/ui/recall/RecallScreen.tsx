import { useEffect, useRef, useState } from 'react';
import { displayCard, rankOf, suitColor, suitOf, type Rank, type Suit } from '@domain/cards';
import { makeCardId, median } from '@domain/recall';
import { useConfigStore } from '@store/configStore';
import { useRecallStore } from '@store/recallStore';
import { useWakeLock } from '@ui/hooks/useWakeLock';
import { CardPicker } from './CardPicker';

const ROLE_LABEL = { P: 'Person', A: 'Action', O: 'Object' } as const;
const ROLE_FIELD = { P: 'person', A: 'action', O: 'object' } as const;
const CORRECT_FLASH_MS = 700;
const MISS_SHOW_MS = 1800; // long enough to read the right card; tap the prompt to skip

export function RecallScreen() {
  const entries = useConfigStore((s) => s.entries);
  const { item, result, answered, correct, latencies, weighted, start, submit, next, reset, markInput } = useRecallStore();
  const [suit, setSuit] = useState<Suit | null>(null);
  const [rank, setRank] = useState<Rank | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout>>();

  useWakeLock(true);

  useEffect(() => {
    start();
    return () => {
      clearTimeout(advanceTimer.current);
      reset();
    };
  }, [start, reset]);

  // Both halves chosen -> commit. Submitted from the tap handlers (not an effect) so a stale
  // suit/rank can never be paired with the next term while advance() is clearing them.
  function pickSuit(v: Suit) {
    if (result) return;
    markInput();
    setSuit(v);
    if (rank) submit(makeCardId(rank, v));
  }

  function pickRank(v: Rank) {
    if (result) return;
    markInput();
    setRank(v);
    if (suit) submit(makeCardId(v, suit));
  }

  function advance() {
    clearTimeout(advanceTimer.current);
    setSuit(null);
    setRank(null);
    next();
  }

  useEffect(() => {
    if (result) advanceTimer.current = setTimeout(advance, result.correct ? CORRECT_FLASH_MS : MISS_SHOW_MS);
    return () => clearTimeout(advanceTimer.current);
  }, [result]);

  if (!item) return null;

  const text = entries[item.card]?.[ROLE_FIELD[item.role]] ?? '';
  const med = median(latencies);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '12px 12px 8px', maxWidth: 480, margin: '0 auto', gap: 10 }}>
      <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--slate)' }}>
        <span>Recall{weighted ? ' · weighted' : ''}</span>
        <span>
          {med !== null && `median ${fmt(med)} · `}
          {answered > 0 && `${correct}/${answered}`}
        </span>
      </div>

      <div
        onClick={result ? advance : undefined}
        style={{
          textAlign: 'center',
          padding: '12px 8px',
          borderRadius: 12,
          background: 'var(--felt-raised)',
          border: `1px solid ${result ? (result.correct ? 'var(--brass)' : 'var(--carmine)') : 'rgba(239,231,214,0.12)'}`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--slate)' }}>
          <span style={{ textTransform: 'uppercase', letterSpacing: 1 }}>{ROLE_LABEL[item.role]}</span>
          {result && !result.correct && (
            <span style={{ fontSize: 13 }}>
              <CardText card={result.answer} /> → <CardText card={result.expected} />
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}>
          {/* time sits right of the term; reserved width keeps the term from reflowing when it appears */}
          <div style={{ width: 72 }} />
          <div style={{ flex: 1, fontFamily: 'var(--font-rank)', fontSize: 30, wordBreak: 'break-word' }}>{text}</div>
          <div
            className="mono"
            style={{ width: 72, textAlign: 'right', fontSize: 18, color: result?.correct ? 'var(--brass)' : 'var(--carmine)', visibility: result ? 'visible' : 'hidden' }}
          >
            {result ? fmt(result.latencyMs) : '0.00s'}
          </div>
        </div>
      </div>

      <CardPicker suit={suit} rank={rank} disabled={!!result} onSuit={pickSuit} onRank={pickRank} />
    </div>
  );
}

function fmt(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

function CardText({ card }: { card: string }) {
  return (
    <strong style={{ color: suitColor(suitOf(card)) === 'red' ? 'var(--carmine)' : 'var(--stock)' }} aria-label={`${rankOf(card)}${suitOf(card)}`}>
      {displayCard(card)}
    </strong>
  );
}
