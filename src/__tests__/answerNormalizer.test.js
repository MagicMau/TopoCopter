import { describe, it, expect } from 'vitest';
import {
  normalizeAnswer,
  matchesAnswer,
  matchesAnyAnswer,
} from '../quiz/answerNormalizer.js';

describe('normalizeAnswer', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeAnswer('  Belgium  ')).toBe('belgium');
  });

  it('converts to lower-case', () => {
    expect(normalizeAnswer('NEDERLAND')).toBe('nederland');
    expect(normalizeAnswer('Nederland')).toBe('nederland');
  });

  it('strips diacritics/accents (NFD decomposition)', () => {
    expect(normalizeAnswer('België')).toBe('belgie');
    expect(normalizeAnswer('Ïle-de-France')).toBe('ile-de-france');
    expect(normalizeAnswer('São Paulo')).toBe('sao paulo');
    expect(normalizeAnswer('Zürich')).toBe('zurich');
    expect(normalizeAnswer('München')).toBe('munchen');
    expect(normalizeAnswer('Kraków')).toBe('krakow');
    expect(normalizeAnswer('Réunion')).toBe('reunion');
    expect(normalizeAnswer('Côte d\'Ivoire')).toBe('cote d\'ivoire');
  });

  it('preserves hyphens and spaces', () => {
    expect(normalizeAnswer('Île-de-France')).toBe('ile-de-france');
    expect(normalizeAnswer('Den Haag')).toBe('den haag');
  });

  it('returns an empty string for an empty input', () => {
    expect(normalizeAnswer('')).toBe('');
  });

  it('returns an empty string for a whitespace-only input', () => {
    expect(normalizeAnswer('   ')).toBe('');
  });

  it('returns an empty string for non-string input', () => {
    expect(normalizeAnswer(null)).toBe('');
    expect(normalizeAnswer(undefined)).toBe('');
    expect(normalizeAnswer(42)).toBe('');
  });

  it('handles plain ASCII strings without modification beyond lower-case', () => {
    expect(normalizeAnswer('berlin')).toBe('berlin');
    expect(normalizeAnswer('Paris')).toBe('paris');
  });
});

describe('matchesAnswer', () => {
  it('returns true for an exact match', () => {
    expect(matchesAnswer('Nederland', 'Nederland')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(matchesAnswer('nederland', 'Nederland')).toBe(true);
    expect(matchesAnswer('NEDERLAND', 'nederland')).toBe(true);
  });

  it('ignores leading/trailing whitespace', () => {
    expect(matchesAnswer('  Nederland  ', 'Nederland')).toBe(true);
  });

  it('matches diacritic-free input to accented expected', () => {
    expect(matchesAnswer('Belgie', 'België')).toBe(true);
    expect(matchesAnswer('belgie', 'België')).toBe(true);
    expect(matchesAnswer('Zurich', 'Zürich')).toBe(true);
    expect(matchesAnswer('Ile-de-France', 'Île-de-France')).toBe(true);
  });

  it('matches accented input to plain expected', () => {
    expect(matchesAnswer('België', 'Belgie')).toBe(true);
  });

  it('returns false for a wrong answer', () => {
    expect(matchesAnswer('Duitsland', 'Nederland')).toBe(false);
  });

  it('returns false for an empty input against a non-empty expected', () => {
    expect(matchesAnswer('', 'Nederland')).toBe(false);
  });

  it('returns true for two empty strings', () => {
    expect(matchesAnswer('', '')).toBe(true);
  });
});

describe('matchesAnyAnswer', () => {
  it('returns true when input matches one of the candidates', () => {
    expect(matchesAnyAnswer('Holland', ['Nederland', 'Holland'])).toBe(true);
  });

  it('returns true when input matches via normalisation', () => {
    expect(matchesAnyAnswer('belgie', ['België', 'Belgium'])).toBe(true);
    expect(matchesAnyAnswer('belgium', ['België', 'Belgium'])).toBe(true);
  });

  it('returns false when input matches none of the candidates', () => {
    expect(matchesAnyAnswer('Duitsland', ['Nederland', 'Holland'])).toBe(false);
  });

  it('returns false for an empty candidates array', () => {
    expect(matchesAnyAnswer('Nederland', [])).toBe(false);
  });

  it('returns false for empty input when candidates are non-empty', () => {
    expect(matchesAnyAnswer('', ['Nederland'])).toBe(false);
  });

  it('returns true for empty input when a candidate is also empty', () => {
    expect(matchesAnyAnswer('', [''])).toBe(true);
  });

  it('is case-insensitive across all candidates', () => {
    expect(matchesAnyAnswer('NEDERLAND', ['nederland', 'holland'])).toBe(true);
  });

  it('trims input before matching', () => {
    expect(matchesAnyAnswer('  Nederland  ', ['Nederland'])).toBe(true);
  });
});
