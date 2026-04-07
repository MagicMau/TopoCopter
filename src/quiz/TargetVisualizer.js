import { PALETTE, QUIZ_TARGET_STYLE, WORLD_DEPTHS } from '../ui/styles.js';

/** Period (ms) for the pulsing alpha animation. */
const PULSE_PERIOD   = 1400;

/**
 * World-space Phaser graphics that visually marks the active quiz target.
 *
 * Draws a pulsing ring at the target position and overlays a progress arc
 * that fills as the helicopter hovers. The marker keeps a stable on-screen
 * size so the target does not become easier just because the user zoomed in.
 *
 * The graphics object is registered via `scene.registerWorldObject()`, so the
 * UI camera automatically ignores it.
 */
export default class TargetVisualizer {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this._scene    = scene;
    this._graphics = scene.registerWorldObject(
      scene.add.graphics().setDepth(WORLD_DEPTHS.QUIZ_TARGET),
    );

    this._targetX       = 0;
    this._targetY       = 0;
    this._screenRadius  = QUIZ_TARGET_STYLE.SCREEN_RADIUS;
    this._hoverProgress = 0;
    this._elapsed       = 0;
    this._visible       = false;
    this._hovering      = false;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  showTarget(worldX, worldY, radius) {
    this._targetX       = worldX;
    this._targetY       = worldY;
    this._screenRadius  = Math.max(1, radius);
    this._visible       = true;
    this._hovering      = false;
    this._hoverProgress = 0;
    this._elapsed       = 0;
    this._graphics?.clear();
    return this;
  }

  /**
   * Called every frame.
   * @param {number}  progress - hover progress 0–1
   * @param {number}  delta    - frame delta ms (drives pulse animation)
   * @param {boolean} hovering - whether the helicopter is inside the target zone
   */
  updateProgress(progress, delta, hovering = false) {
    if (!this._visible) return;
    this._hovering      = Boolean(hovering);
    this._hoverProgress = Math.max(0, Math.min(1, progress));
    this._elapsed      += delta;
    this._draw();
  }

  hideTarget() {
    this._visible = false;
    this._graphics?.clear();
    return this;
  }

  destroy() {
    this._graphics?.destroy();
    this._graphics = null;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _draw() {
    const g = this._graphics;
    if (!g || !this._visible) return;

    g.clear();

    // Only render when the helicopter is inside the target zone
    if (!this._hovering) return;

    const zoom = Math.max(this._scene?.cameras?.main?.zoom ?? 1, 0.0001);
    const r = this._screenRadius / zoom;
    const ringStroke = QUIZ_TARGET_STYLE.RING_STROKE / zoom;
    const progressStroke = QUIZ_TARGET_STYLE.PROGRESS_STROKE / zoom;
    const { _targetX: x, _targetY: y } = this;

    // Pulse factor (0.6 → 1.0) driven by elapsed time
    const pulse     = 0.5 + 0.5 * Math.sin((this._elapsed / PULSE_PERIOD) * Math.PI * 2);
    const ringAlpha = 0.45 + 0.30 * pulse;

    // Subtle filled circle
    g.fillStyle(PALETTE.marker, 0.10 + 0.06 * pulse);
    g.fillCircle(x, y, r);

    // Outer pulsing ring
    g.lineStyle(ringStroke, PALETTE.marker, ringAlpha);
    g.strokeCircle(x, y, r);

    // Hover progress arc (white, clockwise from top)
    if (this._hoverProgress > 0) {
      const start = -Math.PI / 2;
      const end   = start + Math.PI * 2 * this._hoverProgress;

      g.lineStyle(progressStroke, 0xffffff, 0.88);
      g.beginPath();
      g.arc(x, y, r, start, end, false);
      g.strokePath();
    }
  }
}
