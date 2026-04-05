import { describe, it, expect, vi } from 'vitest';
import SearchTimer from '../quiz/SearchTimer.js';

describe('SearchTimer', () => {
  describe('initial state', () => {
    it('is not running before start()', () => {
      const t = new SearchTimer();
      expect(t.isRunning).toBe(false);
    });

    it('returns 0 remaining before start()', () => {
      const t = new SearchTimer();
      expect(t.getRemaining()).toBe(0);
    });
  });

  describe('start()', () => {
    it('sets isRunning to true', () => {
      const t = new SearchTimer();
      t.start(5000);
      expect(t.isRunning).toBe(true);
    });

    it('sets remaining to the supplied duration', () => {
      const t = new SearchTimer();
      t.start(3000);
      expect(t.getRemaining()).toBe(3000);
    });

    it('can be restarted mid-run', () => {
      const t = new SearchTimer();
      t.start(5000);
      t.update(2000);
      t.start(4000);
      expect(t.getRemaining()).toBe(4000);
      expect(t.isRunning).toBe(true);
    });
  });

  describe('stop()', () => {
    it('halts the countdown', () => {
      const t = new SearchTimer();
      t.start(5000);
      t.stop();
      expect(t.isRunning).toBe(false);
    });

    it('does not fire onExpire when stopped', () => {
      const onExpire = vi.fn();
      const t = new SearchTimer({ onExpire });
      t.start(1000);
      t.stop();
      t.update(2000);
      expect(onExpire).not.toHaveBeenCalled();
    });
  });

  describe('update()', () => {
    it('decreases remaining by delta', () => {
      const t = new SearchTimer();
      t.start(5000);
      t.update(1000);
      expect(t.getRemaining()).toBe(4000);
    });

    it('does nothing when not running', () => {
      const t = new SearchTimer();
      t.update(9999);
      expect(t.getRemaining()).toBe(0);
      expect(t.isRunning).toBe(false);
    });

    it('clamps remaining to 0 (never negative)', () => {
      const t = new SearchTimer();
      t.start(500);
      t.update(9999);
      expect(t.getRemaining()).toBe(0);
    });

    it('fires onExpire exactly once when time runs out', () => {
      const onExpire = vi.fn();
      const t = new SearchTimer({ onExpire });
      t.start(1000);
      t.update(600);
      expect(onExpire).not.toHaveBeenCalled();
      t.update(500); // crosses zero
      expect(onExpire).toHaveBeenCalledTimes(1);
    });

    it('does not fire onExpire again on subsequent updates after expiry', () => {
      const onExpire = vi.fn();
      const t = new SearchTimer({ onExpire });
      t.start(1000);
      t.update(1001);
      t.update(500);
      expect(onExpire).toHaveBeenCalledTimes(1);
    });

    it('stops running after expiry', () => {
      const t = new SearchTimer();
      t.start(1000);
      t.update(1500);
      expect(t.isRunning).toBe(false);
    });
  });

  describe('no onExpire callback', () => {
    it('does not throw when onExpire is not provided', () => {
      const t = new SearchTimer();
      t.start(100);
      expect(() => t.update(200)).not.toThrow();
    });
  });
});
