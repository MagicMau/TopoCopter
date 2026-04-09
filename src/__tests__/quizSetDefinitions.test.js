import { describe, expect, it } from 'vitest';
import {
  flattenQuizSetTargetIds,
  normalizeQuizSet,
  normalizeQuizSetsData,
} from '../quiz/quizSetDefinitions.js';

describe('quizSetDefinitions', () => {
  it('keeps legacy flat target arrays working', () => {
    expect(flattenQuizSetTargetIds({
      targets: ['country-netherlands', 'city-amsterdam'],
    })).toEqual(['country-netherlands', 'city-amsterdam']);
  });

  it('flattens grouped targets in category order', () => {
    expect(flattenQuizSetTargetIds({
      targetsByCategory: {
        countries: ['country-netherlands', 'country-belgium'],
        cities: ['city-amsterdam'],
        water: ['water-rhine'],
      },
    })).toEqual([
      'country-netherlands',
      'country-belgium',
      'city-amsterdam',
      'water-rhine',
    ]);
  });

  it('deduplicates targets while preserving first occurrence', () => {
    expect(flattenQuizSetTargetIds({
      targets: ['country-netherlands'],
      targetsByCategory: {
        countries: ['country-netherlands', 'country-belgium'],
      },
    })).toEqual(['country-netherlands', 'country-belgium']);
  });

  it('normalizes quiz sets with a computed target count', () => {
    expect(normalizeQuizSet({
      id: 'quiz-west-europa',
      targetsByCategory: {
        countries: ['country-netherlands'],
        cities: ['city-amsterdam'],
      },
    })).toEqual(expect.objectContaining({
      id: 'quiz-west-europa',
      targets: ['country-netherlands', 'city-amsterdam'],
      targetCount: 2,
    }));
  });

  it('normalizes a quiz-set data file end to end', () => {
    expect(normalizeQuizSetsData({
      version: 1,
      sets: [
        {
          id: 'quiz-west-europa',
          targetsByCategory: {
            countries: ['country-netherlands'],
          },
        },
      ],
    })).toEqual({
      version: 1,
      sets: [
        {
          id: 'quiz-west-europa',
          targetsByCategory: {
            countries: ['country-netherlands'],
          },
          targets: ['country-netherlands'],
          targetCount: 1,
        },
      ],
    });
  });
});
