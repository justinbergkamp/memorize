import { displayRank, rankOf, suitColor, suitOf, suitSymbol, type CardId } from '@domain/cards';

export function CardBadge({ card, size = 'md' }: { card: CardId; size?: 'sm' | 'md' | 'lg' }) {
  const rank = rankOf(card);
  const suit = suitOf(card);
  const color = suitColor(suit);
  const dims = size === 'sm' ? { w: 30, h: 40, font: 13 } : size === 'lg' ? { w: 56, h: 76, font: 22 } : { w: 40, h: 54, font: 16 };

  return (
    <span
      className="mono"
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: dims.w,
        height: dims.h,
        borderRadius: 6,
        background: 'var(--stock)',
        color: color === 'red' ? 'var(--carmine)' : 'var(--ink)',
        fontFamily: 'var(--font-rank)',
        fontWeight: 700,
        fontSize: dims.font,
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      <span>{displayRank(rank)}</span>
      <span style={{ fontSize: dims.font * 0.8 }}>{suitSymbol(suit)}</span>
    </span>
  );
}
