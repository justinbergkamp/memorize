# PAO Card Trainer — Train Mode Build Spec

**Version:** 1.0
**Status:** Ready for implementation
**Scope:** Build (config) + Train (drill engine) + minimal Analyze. Everything else is out of scope.

---

## 0. Mission

A single-user, offline-first, installable **PWA** that drills an existing **PAO (Person–Action–Object)** system for memorizing a shuffled 52-card deck, measures where recall breaks down, and routes practice toward the weak link.

All data is local to the device. There is no server, no account, and no sync.

---

## 1. Non-goals and hard constraints

- No backend, no auth, no accounts, no cloud sync, no analytics SDKs.
- All persistence is local (IndexedDB). Portability is JSON export/import only.
- Fully functional offline after first load.
- Mobile-first, phone in portrait. Must also work on desktop.
- Single user. No concept of "users" in the data model.
- **No memory palace / loci in the data model.** The palace is implicit — it lives in the user's head and is how they perform recall. The app never stores, displays, or reasons about loci.
- **No hints.** On a miss, the app reveals the card and moves on.

---

## 2. Domain model

### 2.1 Card

`id = rank + suit`, 52 unique values.

- Ranks (13): `A 2 3 4 5 6 7 8 9 T J Q K` — display `T` as "10".
- Suits (4): `C D H S` → ♣ ♦ ♥ ♠.
- Examples: `AS`, `TC`, `9H`.

### 2.2 Role

A card's role is its position within its triplet:

| Position | Role | Meaning |
|---|---|---|
| 0 | `P` | Person |
| 1 | `A` | Action |
| 2 | `O` | Object |

**All difficulty and scheduling state is keyed on `(card, role)`, never on card alone.** That is 156 distinct items. A card's Person is a different retrieval path from its Object, and averaging them destroys the signal.

### 2.3 Triplet

Three consecutive cards in the presented sequence, forming one composite image: *the Person of card 0 performing the Action of card 1 with the Object of card 2.*

Triplets are formed by position in the drill sequence, not by any stored mapping.

### 2.4 Full-deck remainder

For `count: 52` in triplet mode: **17 full triplets (51 cards) + 1 lone card presented alone as a Person.** The lone card produces a card event with `role: 'P'` and no scene event.

---

## 3. Build (configuration)

The app is useless without the user's own associations.

**Data:** for each of the 52 cards, a `person`, `action`, and `object` — each a short text string.

**Requirements:**

- Editable per-entry, persisted to IndexedDB immediately on change.
- **Gate:** Train is blocked until all 52 entries have non-empty `person`, `action`, and `object`. Show progress as a single number: `47 / 52`.
- Import/export config as JSON, separate from run data.
- Config JSON is versioned: `{ schema_version: 1, pao: {...} }`. Loci were cut in v1; versioning is what lets them come back without breaking old backups.
- **Editing config never alters past events.** Events store card identity, not PAO text.

---

## 4. The Train run

Every run is the same engine with different parameters. There is no separate "Practice mode" — a practice run is one parameter set plus a tag.

A run has two phases:

1. **Memorize** — cards are presented in sequence, one card or one triplet at a time.
2. **Quiz** (only if `quizzed: true`) — cards are re-presented in the same order, face down. The user recalls each card *before* tapping to reveal, then grades themselves.

### 4.1 Parameters

| Axis | Values |
|---|---|
| **Set** | `full` \| `difficult` |
| **Hand** | `single` \| `triplet` |
| **Advance** | `tap` \| `timed` (interval configurable on-screen) |
| **Count** | `13` \| `26` \| `52` \| `unlimited` |
| **Quizzed** | `false` \| `true` |

### 4.2 Disallowed combinations

- `quizzed: true` + `count: unlimited` — no bounded quiz set.
- `quizzed: true` + `hand: single` — the quiz tests in-order scene recall, which presupposes triplets.
- `set: difficult` before cold-start threshold is met (§8.3).

Everything else is legal. The UI disables rather than hides invalid options, with a one-line reason.

### 4.3 Presets

The config screen leads with four preset buttons; the full axis grid is collapsible beneath them.

| Preset | Parameters |
|---|---|
| **Practice run** | `full` / `triplet` / `tap` / `52` / `quizzed` → sets `is_practice: true` |
| **Quick drill** | `full` / `triplet` / `tap` / `13` / `quizzed` |
| **Speed drill** | `full` / `triplet` / `timed` / `26` / unquizzed |
| **Weak cards** | `difficult` / `triplet` / `tap` / `26` / `quizzed` |

### 4.4 Count rounding

Triplet mode rounds up to a whole number of triplets:

- `13` → 15 (5 triplets)
- `26` → 27 (9 triplets)
- `52` → 51 + 1 lone card (§2.4)

Single mode uses the exact count.

---

## 5. Sampling

### 5.1 `set: full`

Sample without replacement from the 52-card deck. For `count: 52`, this is a full shuffled permutation. For `unlimited`, exhaust the deck, then reshuffle, with the constraint that the last card of one pass may not be the first of the next.

### 5.2 `set: difficult`

Sample `(card, role)` **pairs**, not cards, then arrange them so each lands in its intended position. To drill "7♦ as Object," 7♦ must sit at position 2 of its triplet.

- Weighted sampling without replacement within a run, using softmax over the difficulty score with temperature `τ = 0.5` (tunable).
- A card may appear at most once per run regardless of how many of its roles are weak.
- If the arrangement constraint can't be satisfied for a drawn set, redraw the conflicting item rather than reassigning its role.

### 5.3 Determinism

Every run stores its RNG seed. A run is fully reproducible from `{seed, params}`.

---

## 6. Event model

**Events are the truth. Runs are a header plus a cache.** Every statistic — current or not yet imagined — is a query over events.

```ts
type CardId = string;              // 'AS' | 'TC' | ...
type Role = 'P' | 'A' | 'O';
type Outcome = 'correct' | 'wrong_card' | 'blank';

type RunParams = {
  set: 'full' | 'difficult';
  hand: 'single' | 'triplet';
  advance: 'tap' | 'timed';
  timed_ms?: number;               // required when advance === 'timed'
  count: 13 | 26 | 52 | 'unlimited';
  quizzed: boolean;
};

type RunHeader = {
  id: string;
  started_at: number;
  ended_at?: number;
  seed: string;
  params: RunParams;
  is_practice: boolean;            // snapshot at run start, never re-derived
  weight: number;                  // difficulty-scoring multiplier (§8.2)
  status: 'complete' | 'aborted';
  rollup?: RunRollup;              // written at close; cache only, recomputable
};

type RunRollup = {
  n_cards: number;
  n_correct: number;               // harsh definition — see §9.1
  n_wrong_card: number;
  n_blank: number;
  memorize_ms: number;
  quiz_ms: number;
  total_ms: number;
};

// One per presentation unit in the memorize phase.
// hand: 'single' → one card per unit. hand: 'triplet' → three (or one, for the lone 52nd).
type MemorizeEvent = {
  run_id: string;
  unit_index: number;
  cards: CardId[];
  shown_at: number;
  advanced_at: number;
  latency_valid: boolean;          // false when advance === 'timed'
};

// One per triplet in the quiz phase. Not emitted for the lone 52nd card.
type SceneEvent = {
  run_id: string;
  triplet_index: number;
  retrieved: boolean;              // false when position 0 graded 'blank'
  latency_ms: number;              // time to first grading action in the triplet
};

// One per card in the quiz phase.
type QuizEvent = {
  run_id: string;
  sequence_index: number;          // position in the full run sequence
  triplet_index: number;
  position_in_triplet: 0 | 1 | 2;
  card: CardId;
  role: Role;
  outcome: Outcome;
  revealed_at: number;
  committed_at: number;
  latency_ms: number;              // committed_at - revealed_at
  latency_z?: number;              // vs. rolling window of this user's correct latencies
  fsrs_grade: 1 | 2 | 3 | 4;       // derived, stored (§7.3)
  scored: boolean;                 // false when contaminated (§7.4)
  grading: 'self';                 // reserved for a future 'entered' mode
};
```

`triplet_index` and `position_in_triplet` cost nothing and give locus-level analysis for free without the app knowing what a locus is.

---

## 7. Quiz phase

### 7.1 Flow

Cards are presented in the same order as the memorize phase, **face down**. The user recalls the card from their scene, taps to reveal, sees the answer, then grades with a swipe.

### 7.2 Grading — three outcomes

| Gesture | Outcome | Meaning |
|---|---|---|
| Swipe **up or down** | `correct` | Recalled it |
| Swipe **left** | `blank` | Couldn't recall at all |
| Swipe **right** | `wrong_card` | Recalled a card, wrong one |

Correct occupies both vertical directions — the most frequent outcome gets the most forgiving target, and the horizontal axis reads unambiguously as the failure axis. Blank goes left because blanks dominate early and left is the easier right-thumb reach.

Implementation: the card tracks the finger 1:1 and commits on release past a threshold. Never gesture-recognize-then-animate; the lag corrupts the latency the whole scorer depends on.

Required on the quiz surface: `touch-action: none`, `overscroll-behavior: none`, `user-select: none`.

### 7.3 FSRS grade derivation

There is no self-reported difficulty button. Discrimination among correct answers comes from latency.

Compute `latency_z` against a **rolling window of this user's last 200 correct-quiz latencies** — not all-time, since the user gets faster and an all-time baseline would drift into permanent "easy."

| Condition | FSRS grade |
|---|---|
| `outcome === 'blank'` | 1 (Again) |
| `outcome === 'wrong_card'` | 1 (Again) |
| `correct`, `z > +1` | 2 (Hard) |
| `correct`, `-1 ≤ z ≤ +1` | 3 (Good) |
| `correct`, `z < -1` | 4 (Easy) |

Cold start: everything correct is Good until the window holds ≥30 observations.

Store the raw latency, the z, **and** the derived grade. Retuning thresholds must not require recovering data from a lossy field.

Caveat to bake into the docs, not the code: quiz latency includes the reveal tap and swipe, so it is retrieval time plus a fixed motor cost. Valid for relative comparison; do not present it as pure retrieval time.

### 7.4 Contamination — the reveal leak

**The problem:** when the user blanks at position 0, the reveal hands them the scene. Positions 1 and 2 then grade as correct for free. Position 0 absorbs the whole triplet's failure and positions 1–2 record inflated accuracy. Both numbers are wrong, in opposite directions.

**The fix** — the two failure outcomes already distinguish the cases:

| Position 0 outcome | Interpretation | Action |
|---|---|---|
| `blank` | **Scene failure.** Not attributable to any card. | `SceneEvent.retrieved = false`. Set `scored: false` on all three cards in the triplet. |
| `wrong_card` | **Decode failure.** The scene came; the P decoded wrong. | Real, attributable card miss. Positions 1–2 are uncontaminated — nothing leaked. All three stay `scored: true`. |
| `correct` | Scene retrieved. | Normal. All three `scored: true`. |

No fractional outcomes, no fabricated data. Failure gets attributed to the thing that actually failed. The card-level data lost on collapsed triplets was never real — you cannot measure whether the user knows 7♦ as an Object when the reveal just told them.

---

## 8. Difficulty scorer

### 8.1 Key and inputs

Keyed on `(card, role)`. Consumes **only** `QuizEvent`s where `scored === true`.

Per item, maintain two EWMAs (`α = 0.2`):

- `acc_ewma` — 1 for correct, 0 otherwise
- `lat_ewma` — `latency_z`, correct answers only

```
difficulty = 0.6 * (1 - acc_ewma) + 0.4 * clamp(lat_ewma / 2, -1, 1) * 0.5 + 0.2
```

Normalized to `[0, 1]`. The weights are the first thing to tune once real data exists; expose them as constants, not literals.

Scene failures feed a **separate** per-triplet-position statistic and never touch `(card, role)` difficulty.

### 8.2 Run weight

Each event's contribution is multiplied by its run's `weight`:

| Run type | Default weight |
|---|---|
| Practice-tagged | 1.5 |
| Standard quizzed run | 1.0 |
| `hand: single` | 0.0 |
| `advance: timed` (memorize timing) | 0.0 for latency; quiz correctness still counts at run weight |

Single-hand runs log full events and contribute nothing to scoring. If raw association latency later proves useful, this becomes a config change rather than a backfill.

### 8.3 Cold start

- An item is eligible for the `difficult` set at **≥5 scored observations**.
- The `difficult` set unlocks when **≥60% of the 156 items** have ≥3 scored observations. Until then the option is disabled with the reason shown.

### 8.4 FSRS

Item = `(card, role)`, 156 items, via `ts-fsrs`. Fed the derived grade from §7.3. Kept **separate** from the difficulty score: FSRS answers "what is due," difficulty answers "what is weak." v1 samples on difficulty; due-ness is reserved for a later "Review" set.

---

## 9. Analyze (minimal v1)

### 9.1 Two consumers, two definitions

The same event log, read two ways — this is deliberate, not a conflict.

- **Run rollup / headline %** — harsh. A collapsed triplet counts as 3 misses. This is the honest answer to "how did that run go" and is what trends on the run list.
- **Difficulty scorer** — careful. Only `scored: true` events, per §8.

### 9.2 v1 screens

1. **Run list** — reverse chronological. Per row: date, preset name or param summary, duration, correct %, the run ribbon (§11.4). Practice runs visually distinguished.
2. **Run detail** — phase times, outcome breakdown, per-triplet grid showing scene retrieval and the three card outcomes.
3. **Weakest items** — top 20 `(card, role)` pairs by difficulty, with observation counts. Empty state explains the cold-start threshold.

### 9.3 Aborted runs

Persist events incrementally. A mid-run kill leaves `status: 'aborted'`, which is excluded from aggregates by default with a toggle to include.

---

## 10. Architecture

### 10.1 Stack

| Concern | Choice |
|---|---|
| Framework | React + Vite + TypeScript |
| State | Zustand |
| Storage | Dexie (IndexedDB) |
| Scheduling | ts-fsrs |
| Charts | Recharts |
| Gestures/motion | Motion (ex-Framer Motion) or @use-gesture/react |
| iOS path | Capacitor |

### 10.2 Layering — the thing that must not be skipped

```
/domain    pure TypeScript, zero imports from React or Dexie
           sampling · event model · contamination rules · scorer · FSRS glue
/data      repository interface + Dexie implementation
/ui        React components
```

The iOS plan is Capacitor, which wraps this SPA with no rewrite. But if the WebView feel disappoints and React Native becomes necessary, clean layering means the cost is `/ui` only, and swapping Dexie for SQLite is one adapter. Cheap now, expensive to retrofit.

### 10.3 PWA specifics

- Web app manifest, `display: standalone`, `viewport-fit=cover`, safe-area insets.
- **Safari evicts IndexedDB for sites not installed to the home screen.** Make "Add to Home Screen" part of first run, and treat JSON export as real backup.
- Screen Wake Lock during timed runs.
- Export shape: `{ schema_version: 1, exported_at, config, runs, memorize_events, scene_events, quiz_events }`.

---

## 11. Design

Dark-first, card-as-interface. The card is the only bright object on screen.

### 11.1 Palette

| Token | Hex | Use |
|---|---|---|
| `--felt` | `#0E1512` | Ground — near-black with a green cast, low-lit card table |
| `--felt-raised` | `#17201C` | Panels, config surfaces |
| `--stock` | `#EFE7D6` | Card face — warm ivory card stock, never pure white |
| `--ink` | `#14100E` | Black suits, card typography |
| `--carmine` | `#A81E32` | Red suits; also the `wrong_card` outcome |
| `--brass` | `#C9A227` | `correct` outcome, progress, active state |
| `--slate` | `#6B7C85` | `blank` outcome, secondary UI |

Carmine doing double duty as both a suit color and the wrong-card outcome is intentional and safe, because they never appear simultaneously: outcome color renders as a full-bleed tint on the snap-away, after the card face has left the screen.

### 11.2 Type

- **Card ranks:** a high-contrast didone — Bodoni Moda. Traditional deck faces are didone-adjacent, so this is drawn from the subject rather than applied to it.
- **UI/body:** Inter Tight.
- **Timer and stats:** IBM Plex Mono, tabular figures, so the clock does not jitter on every tick.

### 11.3 Layout

- No chrome during a run. No nav, no settings, no back button. Full-bleed card, a hairline progress ribbon at top, elapsed time in the top corner.
- Card sits high; everything interactive lives in the bottom 60%.
- Cards render as **SVG type**, not sprites — sharper at every size and the flip animates properly.

### 11.4 Signature: the run ribbon

A thin ribbon of ticks across the top, one per card in the run. During memorize it fills as a solid brass line. During the quiz each tick takes its outcome color, and a scene failure renders as a single unbroken slate span across all three of its ticks rather than three separate marks — so a collapsed scene reads visually as one event, which is what it was.

The finished ribbon is the run's fingerprint. It becomes the thumbnail on the run list, where a month of runs shows the shape of improvement at a glance.

### 11.5 Motion

Feedback only, never decoration. Card flip on reveal (`rotateY`, ~200ms). Swipe tracks the finger 1:1. Snap-away tinted by outcome. No page transitions, no spinners — everything is local and nothing should take long enough to need one. Respect `prefers-reduced-motion`: flips become cross-fades, snap-aways become instant.

---

## 12. Milestones

Each milestone ships something usable on the phone.

### M0 — Scaffold and domain
Vite + React + TS + Dexie + Zustand. `/domain` types and pure functions: card set, sampling, triplet arrangement, count rounding. Unit tests for sampling and the §2.4 remainder.
**Done when:** `npm run build` produces an installable PWA shell and domain tests pass.

### M1 — Build
52-card PAO table, edit + persist, progress indicator, Train gate, config JSON import/export.
**Done when:** a full table can be entered on a phone, survives reload, and round-trips through export/import.

### M2 — Memorize phase
Run config screen with presets and the axis grid, invalid combos disabled with reasons. Card and triplet presentation, tap and timed advance with on-screen interval control, `MemorizeEvent` logging, abort handling.
**Done when:** an unquizzed 52-card triplet run completes and its events persist correctly, including after a mid-run kill.

### M3 — Quiz phase
Face-down presentation, tap-to-reveal, three-outcome swipe grading, `QuizEvent` and `SceneEvent` logging, contamination rules per §7.4, run rollup at close.
**Done when:** a full practice run produces a correct rollup and every collapsed triplet has `scored: false` on all three cards.

### M4 — Analyze
Run list with ribbons, run detail, aborted-run exclusion.
**Done when:** "5m12s, 95%" is visible for the last practice run without scanning the event log.

### M5 — Difficulty and scheduling
Latency z-scoring, FSRS grade derivation, difficulty EWMAs, `difficult` set with cold-start gating, weakest-items screen.
**Done when:** the Weak cards preset draws a demonstrably non-uniform sample.

### M6 — Ship
PWA polish, wake lock, add-to-home-screen prompt, full data export/import, Capacitor project scaffolded but unreleased.

---

## 13. Deliberate defaults, open for tuning

These are set so implementation is unblocked, not because they are settled. All should be named constants.

| Decision | Default | Revisit when |
|---|---|---|
| EWMA α | 0.2 | ~20 runs of data exist |
| Difficulty weights | 0.6 accuracy / 0.4 latency | Weakest-items list disagrees with intuition |
| Softmax temperature | 0.5 | Difficult sets feel too repetitive or too diffuse |
| Practice run weight | 1.5 | Practice signal proves better or worse calibrated |
| Latency window | Last 200 correct | Speed improves enough to distort z-scores |
| Cold-start thresholds | 5 obs / 60% coverage | First time the `difficult` set unlocks |
| `quizzed` + `single` | Disallowed | If sequence recall without scenes turns out to be a drill worth having |
