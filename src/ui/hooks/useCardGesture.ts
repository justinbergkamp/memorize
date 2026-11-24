import { useCallback, useEffect, useMemo, useRef } from 'react';
import type React from 'react';
import { animate, useMotionValue } from 'framer-motion';
import type { Outcome } from '@domain/events';
import {
  createGesture,
  gestureReduce,
  isOffsetStuck,
  type GestureEvent,
  type GestureResult,
  type Point,
} from '@domain/gesture';

const WATCHDOG_MS = 250;
const SPRING = { type: 'spring', stiffness: 520, damping: 38 } as const;

/**
 * Drives the quiz card from raw pointer events through the pure gesture machine in
 * `@domain/gesture`. The card tracks the finger 1:1 (motion values are set synchronously in the
 * move handler — no animation, no rAF), and *every* way a gesture can end funnels through the
 * reducer, so there is exactly one place that decides between "commit a grade" and "spring home".
 *
 * Replaces framer-motion's `drag`, which left the card wherever it was released when the
 * release was below the commit threshold, and which delivered `pointercancel` to `onDragEnd`
 * as if it were a release.
 */
export function useCardGesture({
  enabled,
  grading,
  onCommit,
}: {
  /** Accept new gestures (true while a revealed card is awaiting a grade). */
  enabled: boolean;
  /** A grade is in flight; the watchdog must leave the card alone. */
  grading: boolean;
  onCommit: (outcome: Outcome, from: Point) => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const stateRef = useRef(createGesture());
  const releasedAtRef = useRef(0);
  const enabledRef = useRef(enabled);
  const gradingRef = useRef(grading);
  const onCommitRef = useRef(onCommit);
  enabledRef.current = enabled;
  gradingRef.current = grading;
  onCommitRef.current = onCommit;

  /** Hard reset: stop any animation, put the card at origin, forget any held pointer. */
  const reset = useCallback(() => {
    stateRef.current = createGesture();
    x.stop();
    y.stop();
    x.set(0);
    y.set(0);
  }, [x, y]);

  const springHome = useCallback(() => {
    releasedAtRef.current = performance.now();
    animate(x, 0, SPRING);
    animate(y, 0, SPRING);
  }, [x, y]);

  const dispatch = useCallback(
    (event: GestureEvent) => {
      const { state, result } = gestureReduce(stateRef.current, event);
      stateRef.current = state;
      if (event.type === 'move' && state.pointerId !== null) {
        x.set(state.offset.x);
        y.set(state.offset.y);
      }
      applyResult(result);
    },
    // applyResult closes over stable refs/callbacks only
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [x, y, springHome],
  );

  function applyResult(result: GestureResult) {
    switch (result.type) {
      case 'release':
      case 'cancel':
        springHome();
        break;
      case 'commit':
        releasedAtRef.current = performance.now();
        onCommitRef.current(result.outcome, result.from);
        break;
      default:
        break;
    }
  }

  /** Abandon any held pointer without grading (used when a grade is committed by a button). */
  const cancel = useCallback(() => dispatch({ type: 'cancel' }), [dispatch]);

  // Interruptions that don't reach the element: touchcancel, window blur, tab hidden.
  useEffect(() => {
    const cancelAll = () => dispatch({ type: 'cancel' });
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') cancelAll();
    };
    window.addEventListener('touchcancel', cancelAll);
    window.addEventListener('blur', cancelAll);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('touchcancel', cancelAll);
      window.removeEventListener('blur', cancelAll);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [dispatch]);

  // Safety net, not the fix: if a pointer goes silent, or the card is ever drawn off-origin with
  // nothing holding it, put it home. The reducer's invariants make this a no-op in normal use.
  useEffect(() => {
    const id = setInterval(() => {
      const now = performance.now();
      dispatch({ type: 'idle', t: now });
      const s = stateRef.current;
      if (
        isOffsetStuck({
          pointerActive: s.pointerId !== null,
          grading: gradingRef.current,
          drawn: { x: x.get(), y: y.get() },
          msSinceRelease: now - releasedAtRef.current,
        })
      ) {
        reset();
      }
    }, WATCHDOG_MS);
    return () => clearInterval(id);
  }, [dispatch, reset, x, y]);

  const handlers = useMemo(
    () => ({
      onPointerDown(e: React.PointerEvent) {
        if (!enabledRef.current || !e.isPrimary) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // capture is best-effort; window-level cancel handling still covers interruptions
        }
        // Grabbing the card mid spring-home: stop the spring so the new drag starts from origin.
        x.stop();
        y.stop();
        x.set(0);
        y.set(0);
        dispatch({ type: 'down', pointerId: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp });
      },
      onPointerMove(e: React.PointerEvent) {
        dispatch({ type: 'move', pointerId: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp });
      },
      onPointerUp(e: React.PointerEvent) {
        dispatch({ type: 'up', pointerId: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp });
      },
      onPointerCancel(e: React.PointerEvent) {
        dispatch({ type: 'cancel', pointerId: e.pointerId });
      },
      onLostPointerCapture(e: React.PointerEvent) {
        // Fires after a normal pointerup too, by which point the gesture is already over (no-op).
        dispatch({ type: 'cancel', pointerId: e.pointerId });
      },
    }),
    [dispatch, x, y],
  );

  return { x, y, handlers, reset, cancel, springHome };
}
