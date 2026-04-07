import { describe, expect, it } from 'vitest';
import { getDutchCategoryLabel } from '../quiz/categoryLabels.js';

describe('getDutchCategoryLabel', () => {
  it('maps quiz categories that are used in the current data set', () => {
    expect(getDutchCategoryLabel('countries', '?')).toBe('land');
    expect(getDutchCategoryLabel('cities', '?')).toBe('stad');
    expect(getDutchCategoryLabel('water', '?')).toBe('water');
    expect(getDutchCategoryLabel('areas', '?')).toBe('gebied');
  });

  it('preserves unknown categories so prompts stay descriptive', () => {
    expect(getDutchCategoryLabel('provinces', '?')).toBe('provinces');
  });

  it('falls back when the category is empty', () => {
    expect(getDutchCategoryLabel('', '?')).toBe('?');
    expect(getDutchCategoryLabel(null, 'gebied')).toBe('gebied');
  });
});
