/**
 * Helpers for normalising and matching typed answers.
 *
 * Normalisation pipeline (in order):
 *   1. Trim leading/trailing whitespace
 *   2. Convert to lower-case
 *   3. Decompose Unicode characters (NFD) and strip combining diacritical
 *      marks, so "België" matches "belgie", "São Paulo" matches "sao paulo",
 *      "Île-de-France" matches "ile-de-france", etc.
 */

/**
 * Normalise a string for answer comparison.
 *
 * @param {string} str
 * @returns {string}
 */
export function normalizeAnswer(str) {
  if (typeof str !== 'string') return '';
  return str
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Returns `true` when `input` matches `expected` after normalisation.
 *
 * @param {string} input     The player's typed input.
 * @param {string} expected  The canonical correct answer.
 * @returns {boolean}
 */
export function matchesAnswer(input, expected) {
  return normalizeAnswer(input) === normalizeAnswer(expected);
}

/**
 * Returns `true` when `input` matches any of the candidate strings after
 * normalisation.  Useful for targets that have multiple accepted spellings
 * or aliases (e.g. ["Nederland", "Netherlands", "Pays-Bas"]).
 *
 * @param {string}   input       The player's typed input.
 * @param {string[]} candidates  One or more accepted correct answers.
 * @returns {boolean}
 */
export function matchesAnyAnswer(input, candidates) {
  const normalised = normalizeAnswer(input);
  return candidates.some((c) => normalizeAnswer(c) === normalised);
}
