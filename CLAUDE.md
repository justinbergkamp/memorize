# PAO Card Trainer — Developer Guide

## Tooling

- Node 20+ required. `workbox-build` 6.x is pinned via `overrides` because 7.x pulls in `glob@11 → path-scurry@2 → lru-cache@11`, which requires `diagnostics_channel.tracingChannel` (Node 22+).
- `npm run build` — TypeScript compile then Vite production build. Produces an installable PWA in `dist/`.
- `npm test` — Vitest, domain tests only (`src/domain/**/*.test.ts`). All domain logic must be testable without a browser or database.
- `/domain` may import pure-JS libraries (currently only `ts-fsrs`), never React, Dexie, Zustand or other UI/storage libraries.

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

## No contamination (supersedes §7.4)

Every card in a triplet is graded on its own. A `blank` at position 0 is one miss: `SceneEvent.retrieved = false`, but positions 1 and 2 are still quizzed and keep `scored: true`. `wrong_card` at position 0 is likewise just that card. There is no auto-collapse and no free `correct`s.

`scored` now means "feeds the `(card, role)` difficulty scorer and FSRS". Legacy runs recorded under the old rule still contain `scored: false` triplet events (blank at position 0 plus auto-graded corrects); display code treats `scored: false` with `triplet_index >= 0` as legacy-collapsed. Single-mode quiz events are `scored: false` (with `triplet_index: -1`) because their `role: 'P'` is a placeholder, not a real Person retrieval.

## Single-mode quiz

Quizzing is allowed in Single hand mode: cards are quizzed one at a time in memorize order, no scenes. Events are recorded but excluded from difficulty/FSRS (see above).

## No loci, no hints

The data model has no concept of memory palace loci. The palace is implicit — it lives in the user's head. Never add loci fields to events, cards, or UI. On a quiz miss, the app reveals the card and moves on. No hint UI.

## Recall mode (post-spec addition)

Reverse drill: show a P/A/O, the user names the card. Lives under the Train tab (Run | Recall toggle) with stats under Analyze → Recall. Implemented in `@domain/recall`, `@store/recallStore`, `@ui/recall`.

**`RecallEvent` is deliberately separate from `QuizEvent`.** Text→card is a different retrieval path from card→text, so recall events never feed the `(card, role)` difficulty scorer or FSRS. It has its own Dexie table (`recallEvents`); backups made before Recall omit `recall_events`, so import must tolerate its absence. Item selection is weighted by recall timing once there is enough data, plain shuffle before that.

## Quiz gesture (§Y)

The swipe-to-grade gesture is a pure state machine in `@domain/gesture`; `@ui/hooks/useCardGesture` only feeds it pointer events and projects `state.offset` onto the card. Invariant: **offset is non-zero only while a pointer is held**. Every way a gesture ends (up, pointercancel, touchcancel, lost capture, blur, stale pointer) goes through `gestureReduce`, and only a `commit` result grades. Do not reintroduce framer-motion `drag` on the card: it left the card wherever a sub-threshold release landed and routed `pointercancel` into `onDragEnd` as a release. The three fallback buttons share the same single-flight lock, so the run can never soft-lock.

## Progression mode (§X)

A Train preset (Triplet / 52 / quizzed / timed) whose per-triplet interval is **derived** from run history in `@domain/progression`, never stored as a counter. Each progression run records `RunHeader.progression = { interval_s, clean }`; `clean` is a cache of `isCleanRun` over the events, written at close. Any `blank` or `wrong_card` makes a run not clean. The interval times the memorize display only; the quiz is untimed (there is deliberately no quiz timer and no countdown bar — an earlier version auto-graded position 0 `blank` on expiry and silently skipped triplets). `RunHeader.excluded` soft-excludes a "botched" run: kept, but it never moves the interval (aborted runs are skipped too).

## Milestones

The full spec is `docs/pao-train-spec.md` (section numbers like §7.4 refer to it).

M0 ✓ Scaffold + domain  
M1 ✓ Build screen (PAO config table, config import/export; full-backup import/export from the home screen)  
M2 ✓ Memorize phase  
M3 ✓ Quiz phase (contamination, rollup)  
M4 ✓ Analyze (run list, run detail, weakest items)  
M5 ✓ Difficulty scorer and FSRS scheduling (`@domain/scorer`, `@domain/fsrsScheduler`). v1 samples on difficulty only; due-ness is maintained per item but not yet used for a "Review" set.  
M6 — PWA is installable (vite-plugin-pwa, autoUpdate, install prompt). **Not started:** Capacitor scaffold; PWA polish is ongoing.  
Post-spec ✓ Recall mode (see above)

Known gaps: `RunHeader.rollup` is still read directly by `AnalyzeScreen` and `RunDetailScreen` for display (should be recomputed from events); `src/store` and `src/ui` have no tests.
