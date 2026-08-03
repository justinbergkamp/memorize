# PAO Card Trainer — Developer Guide

## Tooling

- Node 20+ required. `workbox-build` 6.x is pinned via `overrides` because 7.x pulls in `glob@11 → path-scurry@2 → lru-cache@11`, which requires `diagnostics_channel.tracingChannel` (Node 22+).
- `npm run build` — TypeScript compile then Vite production build. Produces an installable PWA in `dist/`.
- `npm test` — Vitest, domain tests only (`src/domain/**/*.test.ts`). All domain logic must be testable without a browser or database.

## Architecture — do not violate the layer boundary

```
/domain    Pure TypeScript. Zero imports from React, Dexie, Zustand, or any UI/storage
           library. This is non-negotiable: the eventual React Native path costs only
           /ui. Violating it for convenience makes that path expensive to retrofit.

/data      Repository interface + Dexie implementation. The interface is the boundary;
           /domain never imports from /data.

/ui        React components and stores (Zustand). May import from /domain and /data.
```

Path aliases: `@domain`, `@data`, `@store`, `@ui` — configured in `vite.config.ts` and `tsconfig.json`.

## Domain invariants

**Events are the source of truth.** `RunHeader.rollup` is a recomputable cache written at run close. Never read it as authoritative for analysis or scoring — always recompute from events.

**156 items, not 52.** All difficulty and scheduling state is keyed on `(card, role)`. A card's Person is a different retrieval path from its Object. Averaging across roles destroys the signal. The key helper is `itemKey(card, role)` in `@domain/cards`.

**Count rounding (§4.4):**
- Triplet mode: `13 → 15`, `26 → 27`, `52 → 52` (51 cards in 17 triplets + 1 lone card).
- Single mode: exact count.
- `resolveCardCount` in `@domain/runParams` is the canonical implementation.

**Full-deck remainder (§2.4):** For 52 cards in triplet mode there are 17 full triplets (51 cards) plus one lone card presented as a Person (`role: 'P'`, `tripletIndex: null`). This card produces a `QuizEvent` but no `SceneEvent`.

## Contamination rule (§7.4) — load-bearing, do not simplify

| Position-0 outcome | Effect |
|---|---|
| `blank` | Scene failure. `SceneEvent.retrieved = false`. All three cards in the triplet get `scored: false`. |
| `wrong_card` | Decode failure. Real attributable miss. All three cards stay `scored: true`. |
| `correct` | Normal. All three `scored: true`. |

A `blank` at position 0 collapses the triplet: positions 1 and 2 are auto-graded as `correct` with `scored: false`. This is intentional — the reveal handed the user those cards; the data was never real. The difficulty scorer consumes only `scored: true` events.

`wrong_card` at position 0 does NOT contaminate. The scene was retrieved; only the P card decoded wrong.

## No loci, no hints

The data model has no concept of memory palace loci. The palace is implicit — it lives in the user's head. Never add loci fields to events, cards, or UI. On a quiz miss, the app reveals the card and moves on. No hint UI.

## Milestones

M0 ✓ Scaffold + domain (current)  
M1 — Build screen (PAO config table, import/export)  
M2 — Memorize phase  
M3 — Quiz phase (contamination, rollup)  
M4 — Analyze (run list, run detail)  
M5 — Difficulty and FSRS scheduling  
M6 — PWA polish, Capacitor scaffold
