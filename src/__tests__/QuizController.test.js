import { describe, it, expect, vi } from 'vitest';
import QuizController from '../quiz/QuizController.js';

const TARGETS = {
  countries: [
    { id: 'c-nl', name: 'Nederland', lat: 52.13, lon: 5.29 },
    { id: 'c-de', name: 'Duitsland', lat: 51.16, lon: 10.45 },
    { id: 'c-fr', name: 'Frankrijk', lat: 46.23, lon: 2.21 },
  ],
  cities: [
    { id: 'ci-ams', name: 'Amsterdam', lat: 52.37, lon: 4.90 },
    { id: 'ci-ber', name: 'Berlijn',   lat: 52.52, lon: 13.40 },
  ],
  water: [
    { id: 'w-ns', name: 'Noordzee', lat: 56.0, lon: 3.5 },
  ],
};

const LEVELS = {
  default: 'level-1',
  levels: [
    {
      id: 'level-1',
      name: 'Landen',
      categories: ['countries'],
      targetCount: 2,
      hoverTime: 3000,
      helicopterSpeed: 300,
      targetRadius: 80,
    },
    {
      id: 'level-2',
      name: 'Gemengd',
      categories: ['countries', 'cities'],
      targetCount: 4,
      hoverTime: 2500,
      helicopterSpeed: 360,
      targetRadius: 60,
    },
  ],
};

describe('QuizController', () => {
  describe('resolveLevel', () => {
    it('returns the level matching the given id', () => {
      const qc = new QuizController(TARGETS, LEVELS);
      expect(qc.resolveLevel('level-2').id).toBe('level-2');
    });

    it('falls back to the default level when id is null', () => {
      const qc = new QuizController(TARGETS, LEVELS);
      expect(qc.resolveLevel(null).id).toBe('level-1');
    });

    it('falls back to default when id is unknown', () => {
      const qc = new QuizController(TARGETS, LEVELS);
      // unknown id → default → level-1 found
      expect(qc.resolveLevel('nope').id).toBe('level-1');
    });

    it('returns null when no levels are defined', () => {
      const qc = new QuizController(TARGETS, { levels: [] });
      expect(qc.resolveLevel(null)).toBeNull();
    });

    it('returns first level when default key is missing', () => {
      const data = { levels: LEVELS.levels };
      const qc = new QuizController(TARGETS, data);
      expect(qc.resolveLevel(null).id).toBe('level-1');
    });
  });

  describe('buildPool', () => {
    it('returns targets from all specified categories', () => {
      const qc = new QuizController(TARGETS, LEVELS);
      const level = qc.resolveLevel('level-2');
      const pool  = qc.buildPool(level);
      expect(pool.length).toBe(5); // 3 countries + 2 cities
    });

    it('annotates each item with its category', () => {
      const qc   = new QuizController(TARGETS, LEVELS);
      const pool  = qc.buildPool(qc.resolveLevel('level-2'));
      const cats  = new Set(pool.map((p) => p.category));
      expect(cats.has('countries')).toBe(true);
      expect(cats.has('cities')).toBe(true);
    });

    it('returns empty array for unknown category', () => {
      const qc = new QuizController(TARGETS, LEVELS);
      expect(qc.buildPool({ categories: ['nonexistent'] })).toHaveLength(0);
    });

    it('does not mutate original targets objects', () => {
      const qc   = new QuizController(TARGETS, LEVELS);
      const pool  = qc.buildPool(qc.resolveLevel('level-1'));
      pool[0].name = 'MODIFIED';
      expect(TARGETS.countries[0].name).toBe('Nederland');
    });
  });

  describe('shuffle', () => {
    it('returns a new array of the same length', () => {
      const qc = new QuizController(TARGETS, LEVELS);
      const arr = [1, 2, 3, 4, 5];
      const result = qc.shuffle(arr);
      expect(result).toHaveLength(arr.length);
      expect(result).not.toBe(arr); // different reference
    });

    it('contains all original elements', () => {
      const qc  = new QuizController(TARGETS, LEVELS);
      const arr = ['a', 'b', 'c', 'd'];
      const result = qc.shuffle(arr);
      expect(result.sort()).toEqual(arr.sort());
    });

    it('does not mutate the input array', () => {
      const qc  = new QuizController(TARGETS, LEVELS);
      const arr = [1, 2, 3];
      qc.shuffle(arr);
      expect(arr).toEqual([1, 2, 3]);
    });
  });

  describe('start', () => {
    it('sets level and creates a sequence of the configured length', () => {
      const qc = new QuizController(TARGETS, LEVELS);
      qc.start('level-1');
      expect(qc.level.id).toBe('level-1');
      expect(qc._sequence).toHaveLength(2); // targetCount: 2
    });

    it('limits sequence to targetCount even if pool is larger', () => {
      const qc = new QuizController(TARGETS, LEVELS);
      qc.start('level-2'); // pool = 5, targetCount = 4
      expect(qc._sequence).toHaveLength(4);
    });

    it('fires onTargetChange with the first target', () => {
      const onChange = vi.fn();
      const qc = new QuizController(TARGETS, LEVELS, { onTargetChange: onChange });
      qc.start('level-1');
      expect(onChange).toHaveBeenCalledOnce();
      const [target, progress] = onChange.mock.calls[0];
      expect(target).toBeTruthy();
      expect(progress.current).toBe(0);
      expect(progress.total).toBe(2);
    });

    it('resets score to 0 on restart', () => {
      const qc = new QuizController(TARGETS, LEVELS);
      qc.start('level-1');
      qc.advance();
      qc.start('level-1');
      expect(qc.getProgress().score).toBe(0);
    });
  });

  describe('getCurrentTarget', () => {
    it('returns null before start', () => {
      const qc = new QuizController(TARGETS, LEVELS);
      expect(qc.getCurrentTarget()).toBeNull();
    });

    it('returns the first target after start', () => {
      const qc = new QuizController(TARGETS, LEVELS);
      qc.start('level-1');
      expect(qc.getCurrentTarget()).toBeTruthy();
    });

    it('returns null after all targets are exhausted', () => {
      const qc = new QuizController(TARGETS, LEVELS);
      qc.start('level-1');
      qc.advance();
      qc.advance();
      expect(qc.getCurrentTarget()).toBeNull();
    });
  });

  describe('advance', () => {
    it('increments score and index', () => {
      const qc = new QuizController(TARGETS, LEVELS);
      qc.start('level-1');
      qc.advance();
      expect(qc.getProgress().current).toBe(1);
      expect(qc.getProgress().score).toBe(1);
    });

    it('fires onScoreUpdate', () => {
      const onScore = vi.fn();
      const qc = new QuizController(TARGETS, LEVELS, { onScoreUpdate: onScore });
      qc.start('level-1');
      qc.advance();
      expect(onScore).toHaveBeenCalledOnce();
    });

    it('fires onTargetChange for next target (not last)', () => {
      const onChange = vi.fn();
      const qc = new QuizController(TARGETS, LEVELS, { onTargetChange: onChange });
      qc.start('level-1'); // first call
      qc.advance();        // second call (moving to index 1)
      expect(onChange).toHaveBeenCalledTimes(2);
    });

    it('fires onComplete when last target is advanced past', () => {
      const onComplete = vi.fn();
      const qc = new QuizController(TARGETS, LEVELS, { onComplete: onComplete });
      qc.start('level-1');
      qc.advance();
      qc.advance(); // last
      expect(onComplete).toHaveBeenCalledOnce();
      const [progress] = onComplete.mock.calls[0];
      expect(progress.score).toBe(2);
    });

    it('is a no-op before start', () => {
      const onScore = vi.fn();
      const qc = new QuizController(TARGETS, LEVELS, { onScoreUpdate: onScore });
      qc.advance();
      expect(onScore).not.toHaveBeenCalled();
    });

    it('is chainable', () => {
      const qc = new QuizController(TARGETS, LEVELS);
      qc.start('level-1');
      expect(qc.advance()).toBe(qc);
    });
  });

  describe('isComplete', () => {
    it('is false before start', () => {
      const qc = new QuizController(TARGETS, LEVELS);
      expect(qc.isComplete()).toBe(false);
    });

    it('is false after start', () => {
      const qc = new QuizController(TARGETS, LEVELS);
      qc.start('level-1');
      expect(qc.isComplete()).toBe(false);
    });

    it('is true after all targets are advanced past', () => {
      const qc = new QuizController(TARGETS, LEVELS);
      qc.start('level-1');
      qc.advance();
      qc.advance();
      expect(qc.isComplete()).toBe(true);
    });
  });

  describe('reset', () => {
    it('clears state', () => {
      const qc = new QuizController(TARGETS, LEVELS);
      qc.start('level-1');
      qc.advance();
      qc.reset();
      expect(qc._started).toBe(false);
      expect(qc._sequence).toHaveLength(0);
      expect(qc._score).toBe(0);
      expect(qc._currentIndex).toBe(0);
      expect(qc.getCurrentTarget()).toBeNull();
    });

    it('is chainable', () => {
      const qc = new QuizController(TARGETS, LEVELS);
      expect(qc.reset()).toBe(qc);
    });
  });
});
