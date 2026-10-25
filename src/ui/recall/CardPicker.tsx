import { displayRank, RANKS, SUITS, suitColor, suitSymbol, type Rank, type Suit } from '@domain/cards';

type Props = {
  suit: Suit | null;
  rank: Rank | null;
  disabled?: boolean;
  onSuit: (suit: Suit) => void;
  onRank: (rank: Rank) => void;
};

/** Four suit boxes in a row, then the 13 ranks stacked beneath. */
export function CardPicker({ suit, rank, disabled, onSuit, onRank }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {SUITS.map((s) => (
          <button
            key={s}
            disabled={disabled}
            onClick={() => onSuit(s)}
            aria-label={s}
            aria-pressed={suit === s}
            style={{
              ...boxStyle,
              flex: 1,
              height: 52,
              fontSize: 28,
              color: suitColor(s) === 'red' ? 'var(--carmine)' : 'var(--stock)',
              borderColor: suit === s ? 'var(--brass)' : 'rgba(239,231,214,0.16)',
              background: suit === s ? 'rgba(201,162,39,0.14)' : 'var(--felt-raised)',
            }}
          >
            {suitSymbol(s)}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minHeight: 0 }}>
        {RANKS.map((r) => (
          <button
            key={r}
            disabled={disabled}
            onClick={() => onRank(r)}
            aria-pressed={rank === r}
            className="mono"
            style={{
              ...boxStyle,
              flex: 1,
              minHeight: 28,
              fontSize: 16,
              borderColor: rank === r ? 'var(--brass)' : 'rgba(239,231,214,0.16)',
              background: rank === r ? 'rgba(201,162,39,0.14)' : 'var(--felt-raised)',
            }}
          >
            {displayRank(r)}
          </button>
        ))}
      </div>
    </div>
  );
}

const boxStyle: React.CSSProperties = {
  border: '1px solid',
  borderRadius: 8,
  color: 'var(--stock)',
  padding: 0,
};
