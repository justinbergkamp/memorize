import type { Outcome } from './events';

/**
 * Quiz-card swipe gesture as a pure state machine (§7.2, §Y).
 *
 * Why this lives in /domain: the grading gesture decides a data-bearing outcome, and the
 * old implementation (framer-motion `drag` + an `onDragEnd` that only handled the commit
 * case) could not be tested without a browser. Every input source — pointer up, pointer
 * cancel, touch cancel, lost capture, blur, a stale pointer — funnels through `gestureReduce`,
 * which enforces one invariant:
 *
 *     offset is non-zero only while a pointer is actively held.
 *
 * The UI projects `state.offset` onto the card 1:1 and springs the card home whenever a
 * result other than `commit` comes back.
 */

/** Displacement along the dominant axis that commits a grade on release. */
export const SWIPE_COMMIT_DISTANCE_PX = 100;
/** Release speed along the dominant axis that commits a grade (a flick)... */
export const SWIPE_COMMIT_VELOCITY_PX_S = 600;
/** ...but only if the card has actually moved at least this far, so a jittery tap can't flick-commit. */
export const FLICK_MIN_DISTANCE_PX = 30;
/** Movement below this is a tap, not a drag. The card does not move at all inside it. */
export const TAP_SLOP_PX = 8;
/** The card can never be dragged further than this from origin, per axis. */
export const MAX_DRAG_PX = 240;
/** Velocity is measured over the trailing window ending at release. */
export const VELOCITY_WINDOW_MS = 100;
/** A pointer that has produced no events for this long is treated as lost (OS took the touch, etc.). */
export const STALE_POINTER_MS = 3000;
/** After a release the card has this long to finish springing home before the watchdog hard-resets it. */
export const SPRING_SETTLE_MS = 600;

export type Point = { x: number; y: number };
type Sample = Point & { t: number };

export type GestureState = {
  pointerId: number | null;
  origin: Point;
  /** Where the card should be drawn. Always {0,0} when `pointerId` is null. */
  offset: Point;
  /** True once the pointer has moved past TAP_SLOP_PX. Never reverts within one gesture. */
  dragging: boolean;
  samples: Sample[];
  lastEventAt: number;
};

export type GestureEvent =
  | { type: 'down'; pointerId: number; x: number; y: number; t: number }
  | { type: 'move'; pointerId: number; x: number; y: number; t: number }
  | { type: 'up'; pointerId: number; x: number; y: number; t: number }
  /** pointercancel, touchcancel, lostpointercapture, window blur, page hidden. Omit pointerId to cancel whatever is active. */
  | { type: 'cancel'; pointerId?: number }
  /** Watchdog tick. */
  | { type: 'idle'; t: number };

export type GestureResult =
  | { type: 'none' }
  | { type: 'tap' }
  /** Released below both thresholds — spring home. */
  | { type: 'release'; from: Point }
  /** Interrupted — spring home, never grade. */
  | { type: 'cancel'; from: Point }
  | { type: 'commit'; outcome: Outcome; from: Point };

const ORIGIN: Point = { x: 0, y: 0 };

export function createGesture(): GestureState {
  return { pointerId: null, origin: ORIGIN, offset: ORIGIN, dragging: false, samples: [], lastEventAt: 0 };
}

export function clampOffset(p: Point, max: number = MAX_DRAG_PX): Point {
  const c = (v: number) => Math.max(-max, Math.min(max, v));
  return { x: c(p.x), y: c(p.y) };
}

/**
 * Maps a release to a grade, or null (= spring back).
 * Up or down -> correct, left -> blank, right -> wrong_card (§7.2). The dominant axis wins;
 * a tie goes to the horizontal (failure) axis, matching the original handler.
 * Commit needs distance OR a flick (speed in the direction of travel, past a minimum distance).
 */
export function classifyRelease(offset: Point, velocity: Point): Outcome | null {
  const vertical = Math.abs(offset.y) > Math.abs(offset.x);
  const d = vertical ? offset.y : offset.x;
  const v = vertical ? velocity.y : velocity.x;
  const far = Math.abs(d) > SWIPE_COMMIT_DISTANCE_PX;
  // v * d > 0: the flick must point the way the card has been dragged, so "drag out, snap back" never commits.
  const flicked = Math.abs(d) >= FLICK_MIN_DISTANCE_PX && Math.abs(v) > SWIPE_COMMIT_VELOCITY_PX_S && v * d > 0;
  if (!far && !flicked) return null;
  if (vertical) return 'correct';
  return d < 0 ? 'blank' : 'wrong_card';
}

function velocityOf(samples: Sample[]): Point {
  if (samples.length < 2) return ORIGIN;
  const last = samples[samples.length - 1];
  const recent = samples.filter((s) => last.t - s.t <= VELOCITY_WINDOW_MS);
  if (recent.length < 2) return ORIGIN;
  const first = recent[0];
  const dt = last.t - first.t;
  if (dt <= 0) return ORIGIN;
  return { x: ((last.x - first.x) / dt) * 1000, y: ((last.y - first.y) / dt) * 1000 };
}

function endGesture(prev: GestureState): GestureState {
  return { ...createGesture(), lastEventAt: prev.lastEventAt };
}

export function gestureReduce(state: GestureState, event: GestureEvent): { state: GestureState; result: GestureResult } {
  const none = { state, result: { type: 'none' } as GestureResult };

  switch (event.type) {
    case 'down': {
      // Second finger (or a pointer we're already tracking): ignore, keep the first.
      if (state.pointerId !== null && state.pointerId !== event.pointerId) return none;
      const origin = { x: event.x, y: event.y };
      return {
        state: {
          pointerId: event.pointerId,
          origin,
          offset: ORIGIN,
          dragging: false,
          samples: [{ ...origin, t: event.t }],
          lastEventAt: event.t,
        },
        result: { type: 'none' },
      };
    }

    case 'move': {
      if (state.pointerId !== event.pointerId) return none;
      const delta = { x: event.x - state.origin.x, y: event.y - state.origin.y };
      const dragging = state.dragging || Math.hypot(delta.x, delta.y) >= TAP_SLOP_PX;
      const samples = [...state.samples, { x: event.x, y: event.y, t: event.t }].filter(
        (s) => event.t - s.t <= VELOCITY_WINDOW_MS * 2,
      );
      return {
        state: { ...state, dragging, offset: dragging ? clampOffset(delta) : ORIGIN, samples, lastEventAt: event.t },
        result: { type: 'none' },
      };
    }

    case 'up': {
      if (state.pointerId !== event.pointerId) return none;
      const next = endGesture({ ...state, lastEventAt: event.t });
      // Taps (never past the slop) are filtered out, not treated as drags.
      if (!state.dragging) return { state: next, result: { type: 'tap' } };

      // Unclamped displacement decides the grade; the clamp is for drawing only.
      const delta = { x: event.x - state.origin.x, y: event.y - state.origin.y };
      const from = clampOffset(delta);
      const velocity = velocityOf([...state.samples, { x: event.x, y: event.y, t: event.t }]);
      const outcome = classifyRelease(delta, velocity);
      return { state: next, result: outcome ? { type: 'commit', outcome, from } : { type: 'release', from } };
    }

    case 'cancel': {
      if (state.pointerId === null) return none;
      if (event.pointerId !== undefined && event.pointerId !== state.pointerId) return none;
      return { state: endGesture(state), result: { type: 'cancel', from: state.offset } };
    }

    case 'idle': {
      if (state.pointerId === null) return none;
      if (event.t - state.lastEventAt < STALE_POINTER_MS) return none;
      return { state: endGesture(state), result: { type: 'cancel', from: state.offset } };
    }
  }
}

/**
 * Watchdog predicate: the card is drawn off-origin, nobody is holding it, no grade is in flight,
 * and the spring-home has had time to finish. That state must never persist, so force-reset it.
 */
export function isOffsetStuck(args: {
  pointerActive: boolean;
  grading: boolean;
  drawn: Point;
  msSinceRelease: number;
}): boolean {
  const off = Math.abs(args.drawn.x) > 0.5 || Math.abs(args.drawn.y) > 0.5;
  return off && !args.pointerActive && !args.grading && args.msSinceRelease > SPRING_SETTLE_MS;
}
