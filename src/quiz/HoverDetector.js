/**
 * Pure hover-detection logic — no Phaser dependency.
 *
 * Measures how long the helicopter stays within `radius` pixels of the target.
 * When the accumulated hover time reaches `hoverTime` ms the `onComplete`
 * callback fires once, and the detector marks itself complete (no further
 * callbacks until `reset()` is called).
 *
 * Usage:
 *   const hd = new HoverDetector({
 *     hoverTime:  2000,
 *     onProgress: (progress, hovering) => …,  // 0–1 each frame
 *     onComplete: ()                   => …,  // fired once on success
 *   });
 *
 *   // each game frame:
 *   const { hovering, progress, complete } = hd.update(
 *     delta, heliX, heliY, targetX, targetY, radius,
 *   );
 */
export default class HoverDetector {
  constructor(options = {}) {
    this._hoverTime  = Math.max(0, Number.isFinite(Number(options.hoverTime)) ? Number(options.hoverTime) : 2000);
    this._onProgress = options.onProgress ?? null;
    this._onComplete = options.onComplete ?? null;

    this._elapsed  = 0;
    this._hovering = false;
    this._complete = false;
  }

  // ── Configuration ─────────────────────────────────────────────────────────

  get hoverTime() { return this._hoverTime; }

  setHoverTime(ms) {
    this._hoverTime = Math.max(0, Number(ms) || 0);
    return this;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  reset() {
    this._elapsed  = 0;
    this._hovering = false;
    this._complete = false;
    return this;
  }

  // ── Per-frame update ──────────────────────────────────────────────────────

  /**
   * @param {number} delta       - frame delta in ms
   * @param {number} helicopterX - helicopter world-x
   * @param {number} helicopterY - helicopter world-y
   * @param {number} targetX     - target world-x
   * @param {number} targetY     - target world-y
   * @param {number} radius      - hover radius in world pixels
   * @returns {{ hovering: boolean, progress: number, complete: boolean }}
   */
  update(delta, helicopterX, helicopterY, targetX, targetY, radius) {
    if (this._complete) {
      return { hovering: false, progress: 1, complete: true };
    }

    const dx    = helicopterX - targetX;
    const dy    = helicopterY - targetY;
    const inZone = (dx * dx + dy * dy) <= (radius * radius);

    if (inZone) {
      this._elapsed += delta;
      this._hovering = true;
    } else {
      this._elapsed  = 0;
      this._hovering = false;
    }

    const progress = this._hoverTime > 0
      ? Math.min(this._elapsed / this._hoverTime, 1)
      : (inZone ? 1 : 0);

    this._onProgress?.(progress, this._hovering);

    if (progress >= 1) {
      this._complete = true;
      this._onComplete?.();
      return { hovering: true, progress: 1, complete: true };
    }

    return { hovering: this._hovering, progress, complete: false };
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  isHovering()  { return this._hovering; }
  isComplete()  { return this._complete; }
  getProgress() {
    return this._hoverTime > 0
      ? Math.min(this._elapsed / this._hoverTime, 1)
      : 0;
  }
}
