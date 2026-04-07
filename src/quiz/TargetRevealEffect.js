import MapRenderer from '../core/MapRenderer.js';
import { PALETTE, QUIZ_TARGET_STYLE, WORLD_DEPTHS } from '../ui/styles.js';

const REVEAL_FILL_COLOR = 0xffd166;
const REVEAL_STROKE_COLOR = 0xffffff;
const REVEAL_LINE_COLOR = 0xffef99;

export default class TargetRevealEffect {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this._scene = scene;
    this._graphics = scene.registerWorldObject(
      scene.add.graphics().setDepth((WORLD_DEPTHS.QUIZ_TARGET ?? 4) + 0.1),
    );

    this._active = false;
    this._elapsed = 0;
    this._durationMs = QUIZ_TARGET_STYLE.REVEAL_DURATION_MS;
    this._point = { x: 0, y: 0 };
    this._screenRadiusPx = QUIZ_TARGET_STYLE.REVEAL_AREA_RADIUS;
    this._kind = 'circle';
    this._renderer = null;
  }

  playReveal(reveal, point, options = {}) {
    this._active = true;
    this._elapsed = 0;
    this._durationMs = Number.isFinite(options.durationMs)
      ? Math.max(options.durationMs, 1)
      : QUIZ_TARGET_STYLE.REVEAL_DURATION_MS;
    this._point = {
      x: Number.isFinite(point?.x) ? point.x : 0,
      y: Number.isFinite(point?.y) ? point.y : 0,
    };
    this._kind = reveal?.kind ?? 'circle';
    this._screenRadiusPx = Number.isFinite(reveal?.screenRadiusPx)
      ? Math.max(reveal.screenRadiusPx, 1)
      : QUIZ_TARGET_STYLE.REVEAL_AREA_RADIUS;
    this._renderer = null;

    if (reveal?.geometry && (this._kind === 'polygon' || this._kind === 'line')) {
      this._renderer = new MapRenderer({
        pathType: this._kind === 'line' ? 'line' : 'polygon',
        renderFill: this._kind !== 'line',
        renderStroke: true,
      });
      this._renderer.loadGeoJSON(reveal.geometry, {
        geometryType: this._kind === 'line' ? 'line' : 'polygon',
      });
    }

    this._draw();
    return this;
  }

  update(delta) {
    if (!this._active) {
      return false;
    }

    this._elapsed += Math.max(Number(delta) || 0, 0);
    if (this._elapsed >= this._durationMs) {
      this.clear();
      return false;
    }

    this._draw();
    return true;
  }

  clear() {
    this._active = false;
    this._renderer = null;
    this._graphics?.clear();
    return this;
  }

  destroy() {
    this.clear();
    this._graphics?.destroy();
    this._graphics = null;
  }

  _draw() {
    const g = this._graphics;
    if (!g || !this._active) {
      return;
    }

    g.clear();

    const zoom = Math.max(this._scene?.cameras?.main?.zoom ?? 1, 0.0001);
    const progress = Math.min(this._elapsed / this._durationMs, 1);
    const envelope = Math.sin(progress * Math.PI);
    const pulse = 0.86 + 0.14 * Math.sin((this._elapsed / 180) * Math.PI * 2);
    const fillAlpha = 0.08 + 0.22 * envelope * pulse;
    const strokeAlpha = 0.35 + 0.45 * envelope;

    if (this._renderer) {
      this._renderer.render(g, this._scene?.projection, {
        fillColor: REVEAL_FILL_COLOR,
        fillAlpha,
        borderColor: this._kind === 'line' ? REVEAL_LINE_COLOR : REVEAL_STROKE_COLOR,
        borderAlpha: strokeAlpha,
        borderWidth:
          (this._kind === 'line'
            ? QUIZ_TARGET_STYLE.REVEAL_LINE_WIDTH
            : QUIZ_TARGET_STYLE.REVEAL_BORDER_WIDTH) / zoom,
      });
      return;
    }

    const radius = (this._screenRadiusPx / zoom) * (1 + envelope * 0.12);
    const strokeWidth = QUIZ_TARGET_STYLE.REVEAL_BORDER_WIDTH / zoom;

    g.fillStyle(PALETTE.marker, fillAlpha);
    g.fillCircle(this._point.x, this._point.y, radius);
    g.lineStyle(strokeWidth, REVEAL_STROKE_COLOR, strokeAlpha);
    g.strokeCircle(this._point.x, this._point.y, radius);
  }
}
