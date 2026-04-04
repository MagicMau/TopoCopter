/**
 * Pure quiz logic — no Phaser dependency.
 *
 * Resolves a level config, builds a randomised target sequence from the
 * categories specified by that level, and tracks score / progression.
 *
 * Usage:
 *   const qc = new QuizController(targetsData, levelsData, {
 *     onTargetChange: (target, progress) => …,
 *     onScoreUpdate:  (progress)         => …,
 *     onComplete:     (progress)         => …,
 *   });
 *   qc.start('level-1');
 *   qc.advance();   // call when current target is found
 */
export default class QuizController {
  constructor(targetsData, levelsData, options = {}) {
    this._targets    = targetsData ?? {};
    this._levelsData = levelsData  ?? { levels: [], default: 'level-1' };

    this._onTargetChange = options.onTargetChange ?? null;
    this._onScoreUpdate  = options.onScoreUpdate  ?? null;
    this._onComplete     = options.onComplete     ?? null;

    this.level         = null;
    this._sequence     = [];
    this._currentIndex = 0;
    this._score        = 0;
    this._started      = false;
  }

  // ── Level resolution ──────────────────────────────────────────────────────

  /**
   * Returns the level config for `levelId`, falling back to the default level
   * declared in levels.json, then to the first available level.
   * Returns null when no levels are defined at all.
   */
  resolveLevel(levelId) {
    const levels = this._levelsData.levels ?? [];
    if (levels.length === 0) return null;

    const id = levelId ?? this._levelsData.default;
    return levels.find((l) => l.id === id) ?? levels[0];
  }

  // ── Pool helpers ──────────────────────────────────────────────────────────

  /**
   * Collects all targets from the categories listed in `level.categories`,
   * annotating each with a `category` field.
   */
  buildPool(level) {
    const categories = level?.categories ?? [];
    const pool = [];

    for (const cat of categories) {
      const items = this._targets[cat];
      if (Array.isArray(items)) {
        for (const item of items) {
          pool.push({ ...item, category: cat });
        }
      }
    }

    return pool;
  }

  /** Fisher-Yates shuffle — returns a new array, does not mutate the input. */
  shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Resolve level, build sequence, reset score, fire first onTargetChange. */
  start(levelId) {
    this.level = this.resolveLevel(levelId);

    const pool     = this.buildPool(this.level);
    const shuffled = this.shuffle(pool);
    const count    = this.level?.targetCount ?? shuffled.length;

    this._sequence     = shuffled.slice(0, count);
    this._currentIndex = 0;
    this._score        = 0;
    this._started      = true;

    this._notifyTargetChange();
    return this;
  }

  reset() {
    this._sequence     = [];
    this._currentIndex = 0;
    this._score        = 0;
    this._started      = false;
    return this;
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  getCurrentTarget() {
    if (!this._started || this._currentIndex >= this._sequence.length) {
      return null;
    }
    return this._sequence[this._currentIndex];
  }

  /** Returns { current, total, score } progress snapshot. */
  getProgress() {
    return {
      current: this._currentIndex,
      total:   this._sequence.length,
      score:   this._score,
    };
  }

  isComplete() {
    return this._started && this._currentIndex >= this._sequence.length;
  }

  // ── Progression ───────────────────────────────────────────────────────────

  /**
   * Mark the current target as found, advance to the next, and fire the
   * appropriate callbacks.  No-op when the quiz is not started or already done.
   */
  advance() {
    if (!this._started || this._currentIndex >= this._sequence.length) {
      return this;
    }

    this._score        += 1;
    this._currentIndex += 1;
    this._onScoreUpdate?.(this.getProgress());

    if (this._currentIndex >= this._sequence.length) {
      this._onComplete?.(this.getProgress());
    } else {
      this._notifyTargetChange();
    }

    return this;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _notifyTargetChange() {
    this._onTargetChange?.(this.getCurrentTarget(), this.getProgress());
  }
}
