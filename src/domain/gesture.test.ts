import { describe, expect, it } from 'vitest';
import {
  MAX_DRAG_PX,
  SPRING_SETTLE_MS,
  STALE_POINTER_MS,
  TAP_SLOP_PX,
  classifyRelease,
  createGesture,
  gestureReduce,
  isOffsetStuck,
  type GestureEvent,
  type GestureResult,
  type GestureState,
} from './gesture';

/** Feed a sequence of events, returning the final state and every non-'none' result. */
function run(events: GestureEvent[], start: GestureState = createGesture()) {
  let state = start;
  const results: GestureResult[] = [];
  for (const e of events) {
    const r = gestureReduce(state, e);
    state = r.state;
    if (r.result.type !== 'none') results.push(r.result);
  }
  return { state, results };
}

const down = (x: number, y: number, t = 0, pointerId = 1): GestureEvent => ({ type: 'down', pointerId, x, y, t });
const move = (x: number, y: number, t: number, pointerId = 1): GestureEvent => ({ type: 'move', pointerId, x, y, t });
const up = (x: number, y: number, t: number, pointerId = 1): GestureEvent => ({ type: 'up', pointerId, x, y, t });

/** A drag from (0,0) to (dx,dy) in `steps` moves spread evenly over `ms`, then release at the end point. */
function drag(dx: number, dy: number, ms: number, steps = 20): GestureEvent[] {
  const evs: GestureEvent[] = [down(0, 0, 0)];
  for (let i = 1; i <= steps; i++) evs.push(move((dx * i) / steps, (dy * i) / steps, (ms * i) / steps));
  evs.push(up(dx, dy, ms));
  return evs;
}

describe('§Y repro: releases below the commit thresholds', () => {
  it('a short, slow touch drag springs back and leaves no offset', () => {
    // 40px up over 1.2s. The old handler ignored this release and the card stayed at -40px.
    const { state, results } = run(drag(0, -40, 1200));
    expect(results).toEqual([{ type: 'release', from: { x: 0, y: -40 } }]);
    expect(state.offset).toEqual({ x: 0, y: 0 });
    expect(state.pointerId).toBeNull();
  });

  it('a slow drag just under the distance threshold in each direction springs back', () => {
    for (const [dx, dy] of [[0, -99], [0, 99], [-99, 0], [99, 0]]) {
      const { state, results } = run(drag(dx, dy, 2000));
      expect(results.map((r) => r.type)).toEqual(['release']);
      expect(state.offset).toEqual({ x: 0, y: 0 });
    }
  });

  it('a tap is filtered out as a tap, not a drag', () => {
    const { state, results } = run([down(50, 50, 0), up(50, 50, 80)]);
    expect(results).toEqual([{ type: 'tap' }]);
    expect(state.offset).toEqual({ x: 0, y: 0 });
  });

  it('a jittery tap inside the slop never moves the card', () => {
    let state = gestureReduce(createGesture(), down(50, 50)).state;
    for (const [x, y] of [[53, 52], [47, 55], [55, 50], [50, 56]]) {
      state = gestureReduce(state, move(x, y, 20)).state;
      expect(state.offset).toEqual({ x: 0, y: 0 });
    }
    const end = gestureReduce(state, up(51, 51, 90));
    expect(end.result).toEqual({ type: 'tap' });
  });

  it('crossing the slop starts a drag that tracks the finger 1:1', () => {
    let state = gestureReduce(createGesture(), down(0, 0)).state;
    state = gestureReduce(state, move(0, -(TAP_SLOP_PX + 1), 10)).state;
    expect(state.dragging).toBe(true);
    state = gestureReduce(state, move(5, -60, 20)).state;
    expect(state.offset).toEqual({ x: 5, y: -60 });
  });

  it('drifting back inside the slop after dragging is still a drag release, not a tap', () => {
    const { results } = run([down(0, 0, 0), move(0, -40, 50), move(0, -2, 100), up(0, -2, 150)]);
    expect(results.map((r) => r.type)).toEqual(['release']);
  });
});

describe('§Y repro: interruptions', () => {
  it('pointercancel past the commit distance springs back and does NOT grade', () => {
    // framer-motion routed pointercancel into onDragEnd with the last offset, committing a grade.
    const { state, results } = run([down(0, 0, 0), move(0, -80, 40), move(0, -160, 80), { type: 'cancel', pointerId: 1 }]);
    expect(results).toEqual([{ type: 'cancel', from: { x: 0, y: -160 } }]);
    expect(state.offset).toEqual({ x: 0, y: 0 });
    expect(state.pointerId).toBeNull();
  });

  it('a cancel with no pointerId (touchcancel / blur / hidden) cancels the active gesture', () => {
    const { state, results } = run([down(0, 0, 0), move(120, 0, 50), { type: 'cancel' }]);
    expect(results.map((r) => r.type)).toEqual(['cancel']);
    expect(state.offset).toEqual({ x: 0, y: 0 });
  });

  it('a late pointerup after a cancel is ignored', () => {
    const { results } = run([down(0, 0, 0), move(0, -200, 50), { type: 'cancel', pointerId: 1 }, up(0, -200, 60)]);
    expect(results.map((r) => r.type)).toEqual(['cancel']);
  });

  it('cancel while idle, or for a different pointer, is a no-op', () => {
    expect(gestureReduce(createGesture(), { type: 'cancel' }).result.type).toBe('none');
    const held = gestureReduce(createGesture(), down(0, 0, 0, 1)).state;
    expect(gestureReduce(held, { type: 'cancel', pointerId: 2 }).state).toBe(held);
  });

  it('a pointer that goes silent is dropped by the idle watchdog', () => {
    let { state } = run([down(0, 0, 0), move(0, -60, 100)]);
    expect(gestureReduce(state, { type: 'idle', t: 100 + STALE_POINTER_MS - 1 }).result.type).toBe('none');
    const r = gestureReduce(state, { type: 'idle', t: 100 + STALE_POINTER_MS });
    expect(r.result.type).toBe('cancel');
    state = r.state;
    expect(state.offset).toEqual({ x: 0, y: 0 });
    expect(state.pointerId).toBeNull();
  });

  it('a second finger is ignored and cannot hijack or end the first', () => {
    const { state, results } = run([
      down(0, 0, 0, 1),
      down(300, 300, 10, 2),
      move(0, -60, 20, 1),
      move(300, 100, 25, 2),
      up(300, 100, 30, 2),
    ]);
    expect(results).toEqual([]);
    expect(state.pointerId).toBe(1);
    expect(state.offset).toEqual({ x: 0, y: -60 });
  });
});

describe('commits (§7.2 unchanged by the fix)', () => {
  it('swipe up or down past the threshold is correct', () => {
    expect(run(drag(0, -140, 600)).results[0]).toMatchObject({ type: 'commit', outcome: 'correct' });
    expect(run(drag(0, 140, 600)).results[0]).toMatchObject({ type: 'commit', outcome: 'correct' });
  });

  it('swipe left is blank, swipe right is wrong_card', () => {
    expect(run(drag(-140, 0, 600)).results[0]).toMatchObject({ type: 'commit', outcome: 'blank' });
    expect(run(drag(140, 0, 600)).results[0]).toMatchObject({ type: 'commit', outcome: 'wrong_card' });
  });

  it('a slow drag past the threshold still commits (distance alone is enough)', () => {
    expect(run(drag(-120, 0, 5000)).results[0]).toMatchObject({ type: 'commit', outcome: 'blank' });
  });

  it('the dominant axis wins on a diagonal; a tie goes horizontal', () => {
    expect(classifyRelease({ x: -110, y: -130 }, { x: 0, y: 0 })).toBe('correct');
    expect(classifyRelease({ x: -130, y: -110 }, { x: 0, y: 0 })).toBe('blank');
    expect(classifyRelease({ x: 120, y: 120 }, { x: 0, y: 0 })).toBe('wrong_card');
  });

  it('a fast flick commits below the distance threshold, if the card has moved enough', () => {
    // 50px in 50ms = 1000px/s
    const { results } = run(drag(0, -50, 50, 5));
    expect(results[0]).toMatchObject({ type: 'commit', outcome: 'correct' });
  });

  it('a flick on a barely-moved card does not commit (jittery tap)', () => {
    // 20px in 10ms is fast but under FLICK_MIN_DISTANCE_PX
    expect(classifyRelease({ x: 0, y: -20 }, { x: 0, y: -2000 })).toBeNull();
  });

  it('drag out then snap back before release does not commit on velocity', () => {
    // Out to -90, then quickly back toward origin and release at -50: velocity opposes displacement.
    const { results } = run([down(0, 0, 0), move(0, -90, 300), move(0, -70, 330), move(0, -50, 360), up(0, -50, 380)]);
    expect(results.map((r) => r.type)).toEqual(['release']);
  });

  it('pausing before lifting zeroes the velocity', () => {
    // Fast move, then holds still 400ms, then lifts: not a flick.
    const { results } = run([down(0, 0, 0), move(0, -20, 10), move(0, -60, 30), up(0, -60, 430)]);
    expect(results.map((r) => r.type)).toEqual(['release']);
  });

  it('the commit result reports the (clamped) offset the card was drawn at', () => {
    const { results } = run(drag(0, -900, 400));
    expect(results[0]).toMatchObject({ type: 'commit', outcome: 'correct', from: { x: 0, y: -MAX_DRAG_PX } });
  });
});

describe('clamping', () => {
  it('the drawn offset never exceeds MAX_DRAG_PX on either axis', () => {
    let state = gestureReduce(createGesture(), down(0, 0)).state;
    state = gestureReduce(state, move(-5000, 4000, 10)).state;
    expect(state.offset).toEqual({ x: -MAX_DRAG_PX, y: MAX_DRAG_PX });
  });
});

describe('invariant: offset is non-zero only while a pointer is held', () => {
  // Deterministic LCG so a failure is reproducible.
  function lcg(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  it('holds across thousands of random event sequences', () => {
    const rnd = lcg(12345);
    for (let trial = 0; trial < 300; trial++) {
      let state = createGesture();
      let t = 0;
      for (let i = 0; i < 40; i++) {
        t += Math.floor(rnd() * 200);
        const pointerId = 1 + Math.floor(rnd() * 2);
        const x = (rnd() - 0.5) * 900;
        const y = (rnd() - 0.5) * 900;
        const pick = rnd();
        const ev: GestureEvent =
          pick < 0.2 ? { type: 'down', pointerId, x, y, t }
          : pick < 0.6 ? { type: 'move', pointerId, x, y, t }
          : pick < 0.8 ? { type: 'up', pointerId, x, y, t }
          : pick < 0.9 ? { type: 'cancel', pointerId: rnd() < 0.5 ? pointerId : undefined }
          : { type: 'idle', t: t + Math.floor(rnd() * 5000) };
        state = gestureReduce(state, ev).state;

        if (state.pointerId === null) expect(state.offset).toEqual({ x: 0, y: 0 });
        expect(Math.abs(state.offset.x)).toBeLessThanOrEqual(MAX_DRAG_PX);
        expect(Math.abs(state.offset.y)).toBeLessThanOrEqual(MAX_DRAG_PX);
      }
    }
  });

  it('every pointerup/cancel ends the gesture: a release is never followed by a held pointer', () => {
    for (const end of [up(0, -30, 100), up(0, -300, 100), { type: 'cancel' } as GestureEvent]) {
      const { state } = run([down(0, 0, 0), move(0, -30, 50), end]);
      expect(state.pointerId).toBeNull();
      expect(state.offset).toEqual({ x: 0, y: 0 });
    }
  });
});

describe('isOffsetStuck (UI watchdog)', () => {
  const base = { pointerActive: false, grading: false, drawn: { x: 0, y: -40 }, msSinceRelease: SPRING_SETTLE_MS + 1 };
  it('flags an off-origin card with no pointer, no grade in flight, and the spring long finished', () => {
    expect(isOffsetStuck(base)).toBe(true);
  });
  it('leaves a card alone while held, while grading, while springing, or at rest', () => {
    expect(isOffsetStuck({ ...base, pointerActive: true })).toBe(false);
    expect(isOffsetStuck({ ...base, grading: true })).toBe(false);
    expect(isOffsetStuck({ ...base, msSinceRelease: 100 })).toBe(false);
    expect(isOffsetStuck({ ...base, drawn: { x: 0.2, y: -0.3 } })).toBe(false);
  });
});
