import { describe, it, expect, vi } from 'vitest';
import QuizController from '../quiz/QuizController.js';
import { PLAY_MODE, QUESTION_MODE } from '../quiz/questionModes.js';

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
  areas: [
    { id: 'a-bies', name: 'De Biesbosch', lat: 51.76, lon: 4.8 },
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

    it('falls back to configured default (not levels[0]) when id is unknown', () => {
      // level-2 is the default but NOT the first level — proves the retry
      // goes through the configured default rather than blindly picking levels[0]
      const data = { default: 'level-2', levels: LEVELS.levels };
      const qc = new QuizController(TARGETS, data);
      expect(qc.resolveLevel('nope').id).toBe('level-2');
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

    it('includes area targets when a level requests the areas category', () => {
      const qc = new QuizController(TARGETS, LEVELS);
      const pool = qc.buildPool({ categories: ['areas', 'water'] });
      expect(pool).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'a-bies', category: 'areas' }),
          expect.objectContaining({ id: 'w-ns', category: 'water' }),
        ]),
      );
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

    it('uses fixedTargets directly when provided, bypassing categories', () => {
      const fixed = [
        { id: 'c-nl', name: 'Nederland', lat: 52, lon: 5, category: 'countries' },
        { id: 'w-ns', name: 'Noordzee',  lat: 56, lon: 3, category: 'water' },
      ];
      const qc   = new QuizController(TARGETS, LEVELS);
      const pool  = qc.buildPool({ fixedTargets: fixed, categories: ['countries'] });
      // fixedTargets wins — categories are ignored
      expect(pool).toHaveLength(2);
      expect(pool[0].id).toBe('c-nl');
      expect(pool[1].id).toBe('w-ns');
    });

    it('returns copies of fixedTargets, not the originals', () => {
      const fixed = [{ id: 'c-nl', name: 'Nederland', lat: 52, lon: 5 }];
      const qc   = new QuizController(TARGETS, LEVELS);
      const pool  = qc.buildPool({ fixedTargets: fixed });
      pool[0].name = 'CHANGED';
      expect(fixed[0].name).toBe('Nederland');
    });

    it('falls through to category-based pool when fixedTargets is empty', () => {
      const qc = new QuizController(TARGETS, LEVELS);
      const pool = qc.buildPool({ fixedTargets: [], categories: ['countries'] });
      expect(pool.length).toBe(TARGETS.countries.length);
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

    it('accepts a pre-resolved level object without re-resolving through levels data', () => {
      const qc = new QuizController(TARGETS, LEVELS);
      const curatedLevel = {
        id: 'quiz-west',
        name: 'West-Europa',
        targetCount: 2,
        fixedTargets: [
          { id: 'c-nl', name: 'Nederland', lat: 52.13, lon: 5.29, category: 'countries' },
          { id: 'w-ns', name: 'Noordzee', lat: 56.0, lon: 3.5, category: 'water' },
        ],
      };

      qc.start(curatedLevel);

      expect(qc.level).toBe(curatedLevel);
      expect(qc._sequence).toHaveLength(2);
      expect(qc._sequence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'c-nl' }),
          expect.objectContaining({ id: 'w-ns' }),
        ]),
      );
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

    it('reorders overlapping area and city targets when geometry inputs are provided', () => {
      const qc = new QuizController(
        {
          areas: [
            { id: 'area-scandinavia', name: 'Scandinavië', lat: 63.5, lon: 17 },
          ],
          cities: [
            { id: 'city-stockholm', name: 'Stockholm', lat: 59.3293, lon: 18.0686 },
            { id: 'city-amsterdam', name: 'Amsterdam', lat: 52.3676, lon: 4.9041 },
          ],
        },
        {
          default: 'level-1',
          levels: [
            {
              id: 'level-1',
              categories: ['areas', 'cities'],
              targetCount: 3,
            },
          ],
        },
        {
          projectFn: (lat, lon) => ({ x: lon * 100, y: lat * 100 }),
          datasets: {},
        },
      );
      qc.shuffle = vi.fn((items) => [...items]);

      qc.start('level-1');

      expect(qc._sequence.map((target) => target.id)).toEqual([
        'area-scandinavia',
        'city-amsterdam',
        'city-stockholm',
      ]);
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

  describe('playMode / question mode decoration', () => {
    it('adds questionMode=locate to all items by default (no playMode)', () => {
      const qc = new QuizController(TARGETS, LEVELS);
      qc.start('level-1');
      for (const item of qc._sequence) {
        expect(item.questionMode).toBe(QUESTION_MODE.LOCATE);
      }
    });

    it('adds questionMode=locate when playMode is LOCATE', () => {
      const qc = new QuizController(TARGETS, LEVELS, { playMode: PLAY_MODE.LOCATE });
      qc.start('level-1');
      for (const item of qc._sequence) {
        expect(item.questionMode).toBe(QUESTION_MODE.LOCATE);
      }
    });

    it('adds questionMode=spelling to all items when playMode is SPELLING', () => {
      const qc = new QuizController(TARGETS, LEVELS, { playMode: PLAY_MODE.SPELLING });
      qc.start('level-1');
      for (const item of qc._sequence) {
        expect(item.questionMode).toBe(QUESTION_MODE.SPELLING);
      }
    });

    it('alternates locate/spelling starting with locate for MIXED mode', () => {
      const qc = new QuizController(TARGETS, LEVELS, { playMode: PLAY_MODE.MIXED });
      qc.start('level-2'); // targetCount=4, gives us 4 items
      expect(qc._sequence[0].questionMode).toBe(QUESTION_MODE.LOCATE);
      expect(qc._sequence[1].questionMode).toBe(QUESTION_MODE.SPELLING);
      expect(qc._sequence[2].questionMode).toBe(QUESTION_MODE.LOCATE);
      expect(qc._sequence[3].questionMode).toBe(QUESTION_MODE.SPELLING);
    });

    it('getCurrentTarget returns the questionMode on the current item', () => {
      const qc = new QuizController(TARGETS, LEVELS, { playMode: PLAY_MODE.SPELLING });
      qc.start('level-1');
      expect(qc.getCurrentTarget().questionMode).toBe(QUESTION_MODE.SPELLING);
    });

    it('onTargetChange receives decorated target with questionMode', () => {
      const onChange = vi.fn();
      const qc = new QuizController(TARGETS, LEVELS, {
        playMode: PLAY_MODE.SPELLING,
        onTargetChange: onChange,
      });
      qc.start('level-1');
      const [target] = onChange.mock.calls[0];
      expect(target.questionMode).toBe(QUESTION_MODE.SPELLING);
    });

    it('does not mutate original target data when decorating', () => {
      const qc = new QuizController(TARGETS, LEVELS, { playMode: PLAY_MODE.SPELLING });
      qc.start('level-1');
      expect(TARGETS.countries[0]).not.toHaveProperty('questionMode');
    });

    it('re-decorates on restart with the same playMode', () => {
      const qc = new QuizController(TARGETS, LEVELS, { playMode: PLAY_MODE.SPELLING });
      qc.start('level-1');
      qc.advance();
      qc.start('level-1'); // restart
      expect(qc._sequence[0].questionMode).toBe(QUESTION_MODE.SPELLING);
    });
  });
});
