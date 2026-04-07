import { describe, it, expect, vi } from 'vitest';
import HoverDetector from '../quiz/HoverDetector.js';

describe('HoverDetector', () => {
  describe('constructor', () => {
    it('uses default hoverTime of 2000ms', () => {
      const hd = new HoverDetector();
      expect(hd.hoverTime).toBe(2000);
    });

    it('accepts custom hoverTime', () => {
      const hd = new HoverDetector({ hoverTime: 1500 });
      expect(hd.hoverTime).toBe(1500);
    });

    it('clamps negative hoverTime to 0', () => {
      const hd = new HoverDetector({ hoverTime: -100 });
      expect(hd.hoverTime).toBe(0);
    });

    it('starts as not hovering, not complete', () => {
      const hd = new HoverDetector();
      expect(hd.isHovering()).toBe(false);
      expect(hd.isComplete()).toBe(false);
      expect(hd.getProgress()).toBe(0);
    });
  });

  describe('update — outside radius', () => {
    it('returns hovering: false when outside radius', () => {
      const hd = new HoverDetector({ hoverTime: 1000 });
      const result = hd.update(16, 200, 0, 0, 0, 50);
      expect(result.hovering).toBe(false);
    });

    it('does not accumulate elapsed time when outside', () => {
      const hd = new HoverDetector({ hoverTime: 1000 });
      hd.update(500, 200, 0, 0, 0, 50);
      expect(hd.getProgress()).toBe(0);
    });

    it('resets elapsed time when leaving the zone', () => {
      const hd = new HoverDetector({ hoverTime: 1000 });
      hd.update(200, 0, 0, 0, 0, 50);  // inside
      hd.update(100, 200, 0, 0, 0, 50); // outside → reset
      expect(hd.getProgress()).toBe(0);
    });
  });

  describe('update — inside radius', () => {
    it('returns hovering: true when inside radius', () => {
      const hd = new HoverDetector({ hoverTime: 1000 });
      const result = hd.update(16, 0, 0, 0, 0, 50);
      expect(result.hovering).toBe(true);
    });

    it('accumulates progress over multiple frames', () => {
      const hd = new HoverDetector({ hoverTime: 1000 });
      hd.update(400, 0, 0, 0, 0, 50);
      hd.update(200, 0, 0, 0, 0, 50);
      expect(hd.getProgress()).toBeCloseTo(0.6, 5);
    });

    it('progress is clamped to 1', () => {
      const hd = new HoverDetector({ hoverTime: 1000 });
      hd.update(500, 0, 0, 0, 0, 50);
      hd.update(500, 0, 0, 0, 0, 50);
      hd.update(500, 0, 0, 0, 0, 50);
      expect(hd.getProgress()).toBeLessThanOrEqual(1);
    });

    it('detects hover at exact edge of radius (boundary)', () => {
      const hd = new HoverDetector({ hoverTime: 1000 });
      // distance = exactly 50, radius = 50 → on boundary → inside
      const result = hd.update(100, 50, 0, 0, 0, 50);
      expect(result.hovering).toBe(true);
    });

    it('detects hover at a diagonal position inside radius', () => {
      const hd = new HoverDetector({ hoverTime: 1000 });
      // distance ≈ 35.4, radius = 50 → inside
      const result = hd.update(100, 25, 25, 0, 0, 50);
      expect(result.hovering).toBe(true);
    });

    it('supports custom hit zones via isInZoneFn', () => {
      const hd = new HoverDetector({ hoverTime: 1000 });
      const result = hd.update(100, 999, 999, 0, 0, 0, () => true);
      expect(result.hovering).toBe(true);
      expect(result.progress).toBeCloseTo(0.1, 5);
    });
  });

  describe('completion', () => {
    it('fires onComplete exactly once when hoverTime is reached', () => {
      const onComplete = vi.fn();
      const hd = new HoverDetector({ hoverTime: 500, onComplete });
      hd.update(500, 0, 0, 0, 0, 50);
      expect(onComplete).toHaveBeenCalledOnce();
    });

    it('does not fire onComplete again on subsequent updates', () => {
      const onComplete = vi.fn();
      const hd = new HoverDetector({ hoverTime: 500, onComplete });
      hd.update(500, 0, 0, 0, 0, 50); // completes
      hd.update(100, 0, 0, 0, 0, 50); // should be no-op
      expect(onComplete).toHaveBeenCalledOnce();
    });

    it('returns complete: true and progress: 1 once finished', () => {
      const hd = new HoverDetector({ hoverTime: 500 });
      hd.update(600, 0, 0, 0, 0, 50);
      const result = hd.update(100, 0, 0, 0, 0, 50);
      expect(result.complete).toBe(true);
      expect(result.progress).toBe(1);
    });

    it('marks isComplete() as true', () => {
      const hd = new HoverDetector({ hoverTime: 500 });
      hd.update(600, 0, 0, 0, 0, 50);
      expect(hd.isComplete()).toBe(true);
    });
  });

  describe('onProgress callback', () => {
    it('is called each frame with current progress', () => {
      const onProgress = vi.fn();
      const hd = new HoverDetector({ hoverTime: 1000, onProgress });
      hd.update(250, 0, 0, 0, 0, 50);
      expect(onProgress).toHaveBeenCalledOnce();
      const [progress, hovering] = onProgress.mock.calls[0];
      expect(progress).toBeCloseTo(0.25, 5);
      expect(hovering).toBe(true);
    });

    it('passes hovering: false when outside radius', () => {
      const onProgress = vi.fn();
      const hd = new HoverDetector({ hoverTime: 1000, onProgress });
      hd.update(250, 500, 0, 0, 0, 50);
      const [, hovering] = onProgress.mock.calls[0];
      expect(hovering).toBe(false);
    });
  });

  describe('reset', () => {
    it('clears elapsed time and completion state', () => {
      const hd = new HoverDetector({ hoverTime: 500 });
      hd.update(600, 0, 0, 0, 0, 50); // complete
      hd.reset();
      expect(hd.isComplete()).toBe(false);
      expect(hd.isHovering()).toBe(false);
      expect(hd.getProgress()).toBe(0);
    });

    it('allows re-completion after reset', () => {
      const onComplete = vi.fn();
      const hd = new HoverDetector({ hoverTime: 500, onComplete });
      hd.update(600, 0, 0, 0, 0, 50);
      hd.reset();
      hd.update(600, 0, 0, 0, 0, 50);
      expect(onComplete).toHaveBeenCalledTimes(2);
    });

    it('is chainable', () => {
      const hd = new HoverDetector();
      expect(hd.reset()).toBe(hd);
    });
  });

  describe('setHoverTime', () => {
    it('updates hoverTime', () => {
      const hd = new HoverDetector({ hoverTime: 2000 });
      hd.setHoverTime(1000);
      expect(hd.hoverTime).toBe(1000);
    });

    it('is chainable', () => {
      const hd = new HoverDetector();
      expect(hd.setHoverTime(1000)).toBe(hd);
    });
  });

  describe('hoverTime: 0', () => {
    it('immediately returns complete when inside radius', () => {
      const onComplete = vi.fn();
      const hd = new HoverDetector({ hoverTime: 0, onComplete });
      const result = hd.update(1, 0, 0, 0, 0, 50);
      expect(result.complete).toBe(true);
      expect(onComplete).toHaveBeenCalledOnce();
    });
  });

  describe('isInZoneFn override', () => {
    it('uses isInZoneFn instead of radius check when provided', () => {
      const hd = new HoverDetector({ hoverTime: 1000 });
      // Helicopter is at (200, 0) — outside a radius of 50 around (0, 0).
      // But isInZoneFn always returns true, so it should still hover.
      const alwaysIn = () => true;
      const result = hd.update(500, 200, 0, 0, 0, 50, alwaysIn);
      expect(result.hovering).toBe(true);
    });

    it('isInZoneFn returning false keeps detector outside zone', () => {
      const hd = new HoverDetector({ hoverTime: 1000 });
      // Helicopter at origin — inside radius 50. But isInZoneFn returns false.
      const neverIn = () => false;
      const result = hd.update(500, 0, 0, 0, 0, 50, neverIn);
      expect(result.hovering).toBe(false);
      expect(hd.getProgress()).toBe(0);
    });

    it('completes when isInZoneFn returns true for long enough', () => {
      const onComplete = vi.fn();
      const hd = new HoverDetector({ hoverTime: 500, onComplete });
      const alwaysIn = () => true;
      // Outside radius 10, but isInZoneFn says in
      hd.update(600, 999, 0, 0, 0, 10, alwaysIn);
      expect(onComplete).toHaveBeenCalledOnce();
    });

    it('passes helicopter coords to isInZoneFn', () => {
      const hd = new HoverDetector({ hoverTime: 1000 });
      const captured = [];
      const spy = (x, y) => { captured.push({ x, y }); return false; };
      hd.update(100, 42, 77, 0, 0, 50, spy);
      expect(captured).toHaveLength(1);
      expect(captured[0]).toEqual({ x: 42, y: 77 });
    });
  });
});
