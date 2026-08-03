import { displayRank, rankOf, suitColor, suitOf, suitSymbol, type CardId } from '@domain/cards';

/** Playing-card face rendered as SVG (sharp at every size, animates cleanly on flip — §11.3). */
export function BigCard({ card, faceDown = false }: { card: CardId; faceDown?: boolean }) {
  if (faceDown) {
    return (
      <svg viewBox="0 0 200 280" width="100%" height="100%" role="img" aria-label="Face-down card">
        <rect x="2" y="2" width="196" height="276" rx="16" fill="var(--felt-raised)" stroke="var(--brass)" strokeWidth="2" />
        <rect x="20" y="20" width="160" height="240" rx="10" fill="none" stroke="var(--brass)" strokeOpacity="0.35" strokeWidth="1.5" />
      </svg>
    );
  }

  const rank = displayRank(rankOf(card));
  const suit = suitOf(card);
  const color = suitColor(suit) === 'red' ? 'var(--carmine)' : 'var(--ink)';
  const symbol = suitSymbol(suit);

  return (
    <svg viewBox="0 0 200 280" width="100%" height="100%" role="img" aria-label={`${rank} of ${suit}`}>
      <rect x="2" y="2" width="196" height="276" rx="16" fill="var(--stock)" />
      <text x="18" y="42" fontFamily="var(--font-rank)" fontWeight="700" fontSize="30" fill={color}>
        {rank}
      </text>
      <text x="18" y="68" fontFamily="var(--font-rank)" fontSize="26" fill={color}>
        {symbol}
      </text>
      <text
        x="182"
        y="252"
        textAnchor="end"
        fontFamily="var(--font-rank)"
        fontWeight="700"
        fontSize="30"
        fill={color}
        transform="rotate(180 182 252)"
        style={{ transformOrigin: '182px 252px' }}
      >
        {rank}
      </text>
      <text
        x="182"
        y="226"
        textAnchor="end"
        fontFamily="var(--font-rank)"
        fontSize="26"
        fill={color}
        transform="rotate(180 182 226)"
      >
        {symbol}
      </text>
      <text x="100" y="165" textAnchor="middle" fontFamily="var(--font-rank)" fontSize="90" fill={color}>
        {symbol}
      </text>
    </svg>
  );
}
