import { useEffect, useRef, useState } from 'react';
import type { CardId } from '@domain/cards';
import type { PaoText } from '@data/repository';
import { CardBadge } from '@ui/components/CardBadge';

export function PaoRow({
  card,
  value,
  onSave,
}: {
  card: CardId;
  value: PaoText;
  onSave: (card: CardId, text: PaoText) => void;
}) {
  const [local, setLocal] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal(value);
  }, [value.person, value.action, value.object]);

  function update(field: keyof PaoText, next: string) {
    const nextText = { ...local, [field]: next };
    setLocal(nextText);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSave(card, nextText), 250);
  }

  const filled = local.person.trim() && local.action.trim() && local.object.trim();

  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        padding: '10px 4px',
        borderBottom: '1px solid rgba(239,231,214,0.08)',
        opacity: filled ? 1 : 0.85,
      }}
    >
      <CardBadge card={card} size="sm" />
      <input
        aria-label="Person"
        placeholder="Person"
        value={local.person}
        onChange={(e) => update('person', e.target.value)}
        style={inputStyle}
      />
      <input
        aria-label="Action"
        placeholder="Action"
        value={local.action}
        onChange={(e) => update('action', e.target.value)}
        style={inputStyle}
      />
      <input
        aria-label="Object"
        placeholder="Object"
        value={local.object}
        onChange={(e) => update('object', e.target.value)}
        style={inputStyle}
      />
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: filled ? 'var(--brass)' : 'var(--slate)',
          flexShrink: 0,
        }}
      />
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: 'var(--felt-raised)',
  border: '1px solid rgba(239,231,214,0.12)',
  borderRadius: 6,
  color: 'var(--stock)',
  padding: '8px 10px',
  fontSize: 14,
};
