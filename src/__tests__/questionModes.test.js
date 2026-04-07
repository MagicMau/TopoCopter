import { describe, it, expect } from 'vitest';
import {
  PLAY_MODE,
  QUESTION_MODE,
  decorateSequence,
} from '../quiz/questionModes.js';

const ITEMS = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Beta' },
  { id: 'c', name: 'Gamma' },
  { id: 'd', name: 'Delta' },
];

describe('PLAY_MODE', () => {
  it('exposes locate, spelling, and mixed constants', () => {
    expect(PLAY_MODE.LOCATE).toBe('locate');
    expect(PLAY_MODE.SPELLING).toBe('spelling');
    expect(PLAY_MODE.MIXED).toBe('mixed');
  });

  it('is frozen', () => {
    expect(Object.isFrozen(PLAY_MODE)).toBe(true);
  });
});

describe('QUESTION_MODE', () => {
  it('exposes locate and spelling constants', () => {
    expect(QUESTION_MODE.LOCATE).toBe('locate');
    expect(QUESTION_MODE.SPELLING).toBe('spelling');
  });

  it('is frozen', () => {
    expect(Object.isFrozen(QUESTION_MODE)).toBe(true);
  });
});

describe('decorateSequence', () => {
  it('assigns questionMode=locate to all items when playMode is LOCATE', () => {
    const result = decorateSequence(ITEMS, PLAY_MODE.LOCATE);
    expect(result.every((r) => r.questionMode === QUESTION_MODE.LOCATE)).toBe(true);
  });

  it('assigns questionMode=locate to all items when playMode is null', () => {
    const result = decorateSequence(ITEMS, null);
    expect(result.every((r) => r.questionMode === QUESTION_MODE.LOCATE)).toBe(true);
  });

  it('assigns questionMode=locate to all items when playMode is undefined', () => {
    const result = decorateSequence(ITEMS, undefined);
    expect(result.every((r) => r.questionMode === QUESTION_MODE.LOCATE)).toBe(true);
  });

  it('assigns questionMode=spelling to all items when playMode is SPELLING', () => {
    const result = decorateSequence(ITEMS, PLAY_MODE.SPELLING);
    expect(result.every((r) => r.questionMode === QUESTION_MODE.SPELLING)).toBe(true);
  });

  it('alternates locate/spelling starting with locate for MIXED mode', () => {
    const result = decorateSequence(ITEMS, PLAY_MODE.MIXED);
    expect(result[0].questionMode).toBe(QUESTION_MODE.LOCATE);
    expect(result[1].questionMode).toBe(QUESTION_MODE.SPELLING);
    expect(result[2].questionMode).toBe(QUESTION_MODE.LOCATE);
    expect(result[3].questionMode).toBe(QUESTION_MODE.SPELLING);
  });

  it('returns a new array (does not mutate input)', () => {
    const result = decorateSequence(ITEMS, PLAY_MODE.SPELLING);
    expect(result).not.toBe(ITEMS);
    expect(ITEMS[0]).not.toHaveProperty('questionMode');
  });

  it('returns copies of items, not the originals', () => {
    const result = decorateSequence(ITEMS, PLAY_MODE.LOCATE);
    result[0].name = 'CHANGED';
    expect(ITEMS[0].name).toBe('Alpha');
  });

  it('preserves all existing item properties', () => {
    const result = decorateSequence(ITEMS, PLAY_MODE.LOCATE);
    expect(result[0]).toMatchObject({ id: 'a', name: 'Alpha' });
  });

  it('works on an empty sequence', () => {
    expect(decorateSequence([], PLAY_MODE.MIXED)).toEqual([]);
  });

  it('works on a single-item sequence in MIXED mode (gets locate)', () => {
    const result = decorateSequence([ITEMS[0]], PLAY_MODE.MIXED);
    expect(result[0].questionMode).toBe(QUESTION_MODE.LOCATE);
  });
});
