import { create } from 'zustand';
import { fullDeck, type CardId } from '@domain/cards';
import { repository } from '@data/dexieRepository';
import type { PaoText } from '@data/repository';

export type ConfigState = {
  entries: Record<CardId, PaoText>;
  loaded: boolean;
  filled: number;
  total: number;
  load: () => Promise<void>;
  setEntry: (card: CardId, text: PaoText) => Promise<void>;
  isGateOpen: () => boolean;
};

function emptyEntries(): Record<CardId, PaoText> {
  const entries: Record<CardId, PaoText> = {};
  for (const card of fullDeck()) entries[card] = { person: '', action: '', object: '' };
  return entries;
}

function isFilled(text: PaoText | undefined): boolean {
  return !!text && text.person.trim().length > 0 && text.action.trim().length > 0 && text.object.trim().length > 0;
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  entries: emptyEntries(),
  loaded: false,
  filled: 0,
  total: 52,
  async load() {
    const rows = await repository.getAllPaoEntries();
    const entries = emptyEntries();
    for (const row of rows) {
      entries[row.card] = { person: row.person, action: row.action, object: row.object };
    }
    const filled = fullDeck().filter((c) => isFilled(entries[c])).length;
    set({ entries, loaded: true, filled });
  },
  async setEntry(card, text) {
    await repository.upsertPaoEntry(card, text);
    set((state) => {
      const entries = { ...state.entries, [card]: text };
      const filled = fullDeck().filter((c) => isFilled(entries[c])).length;
      return { entries, filled };
    });
  },
  isGateOpen() {
    return get().filled >= 52;
  },
}));
