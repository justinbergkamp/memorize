export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'] as const;
export const SUITS = ['C', 'D', 'H', 'S'] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];
export type CardId = string; // `${Rank}${Suit}`, e.g. 'AS', 'TC', '9H'
export type Role = 'P' | 'A' | 'O';

export const ROLES: Role[] = ['P', 'A', 'O'];

const SUIT_SYMBOL: Record<Suit, string> = { C: '♣', D: '♦', H: '♥', S: '♠' };
const SUIT_COLOR: Record<Suit, 'red' | 'black'> = { C: 'black', D: 'red', H: 'red', S: 'black' };

export function rankOf(card: CardId): Rank {
  return card.slice(0, -1) as Rank;
}

export function suitOf(card: CardId): Suit {
  return card.slice(-1) as Suit;
}

export function displayRank(rank: Rank): string {
  return rank === 'T' ? '10' : rank;
}

export function suitSymbol(suit: Suit): string {
  return SUIT_SYMBOL[suit];
}

export function suitColor(suit: Suit): 'red' | 'black' {
  return SUIT_COLOR[suit];
}

export function displayCard(card: CardId): string {
  return `${displayRank(rankOf(card))}${suitSymbol(suitOf(card))}`;
}

/** The 52-card deck, in canonical order (suit-major). Stable, deterministic order — not a shuffle. */
export function fullDeck(): CardId[] {
  const deck: CardId[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(`${rank}${suit}`);
    }
  }
  return deck;
}

export function isValidCardId(id: string): id is CardId {
  if (id.length !== 2) return false;
  return (RANKS as readonly string[]).includes(id[0]) && (SUITS as readonly string[]).includes(id[1]);
}

/** All 156 (card, role) items. */
export function allItems(): { card: CardId; role: Role }[] {
  const items: { card: CardId; role: Role }[] = [];
  for (const card of fullDeck()) {
    for (const role of ROLES) {
      items.push({ card, role });
    }
  }
  return items;
}

export function itemKey(card: CardId, role: Role): string {
  return `${card}:${role}`;
}
