/**
 * Shared constants and helpers for play modes / question modes.
 *
 * PLAY_MODE describes the overall mode of a quiz run (what the player selected).
 * QUESTION_MODE describes the mode of a single question in the sequence.
 *
 * These are kept separate so that MIXED play mode can produce a sequence that
 * interleaves different question types.
 */

/** The mode of an entire quiz run. */
export const PLAY_MODE = Object.freeze({
  LOCATE:   'locate',
  SPELLING: 'spelling',
  MIXED:    'mixed',
});

/** The mode of a single question item. */
export const QUESTION_MODE = Object.freeze({
  LOCATE:   'locate',
  SPELLING: 'spelling',
});

/**
 * Decorates each item in `sequence` with a `questionMode` property derived
 * from `playMode`.  Returns a new array; does not mutate the input.
 *
 * - LOCATE (or null/undefined): all items → questionMode = 'locate'
 * - SPELLING: all items → questionMode = 'spelling'
 * - MIXED: index 0 → 'locate', index 1 → 'spelling', index 2 → 'locate', …
 *
 * @param {object[]} sequence  Array of target items (already shuffled/sliced).
 * @param {string|null} playMode  One of the PLAY_MODE values, or null/undefined.
 * @returns {object[]}
 */
export function decorateSequence(sequence, playMode) {
  const mode = playMode ?? PLAY_MODE.LOCATE;

  return sequence.map((item, index) => {
    let questionMode;
    if (mode === PLAY_MODE.SPELLING) {
      questionMode = QUESTION_MODE.SPELLING;
    } else if (mode === PLAY_MODE.MIXED) {
      questionMode = index % 2 === 0 ? QUESTION_MODE.LOCATE : QUESTION_MODE.SPELLING;
    } else {
      questionMode = QUESTION_MODE.LOCATE;
    }
    return { ...item, questionMode };
  });
}
