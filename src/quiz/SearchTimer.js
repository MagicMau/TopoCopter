/**
 * Pure per-target search timer — no Phaser dependency.
 *
 * Counts down from a given duration and fires `onExpire` once when time runs out.
 */
export default class SearchTimer {
  /**
   * @param {{ onExpire?: () => void }} [options]
   */
  constructor(options = {}) {
    this._onExpire   = options.onExpire ?? null;
    this._remaining  = 0;
    this._running    = false;
  }

  /** Start (or restart) the timer with the given duration in ms. */
  start(durationMs) {
    this._remaining = durationMs;
    this._running   = true;
    return this;
  }

  /** Stop the timer without firing onExpire. */
  stop() {
    this._running = false;
    return this;
  }

  /** Remaining time in ms, clamped ≥ 0. */
  getRemaining() {
    return Math.max(0, this._remaining);
  }

  /** `true` while actively counting down. */
  get isRunning() {
    return this._running;
  }

  /**
   * Advance the timer by `delta` ms.
   * Fires `onExpire` (once) when time reaches zero.
   * @param {number} delta - ms since last frame
   */
  update(delta) {
    if (!this._running) return;

    this._remaining -= delta;

    if (this._remaining <= 0) {
      this._remaining = 0;
      this._running   = false;
      this._onExpire?.();
    }
  }
}
