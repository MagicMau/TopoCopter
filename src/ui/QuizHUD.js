import { OVERLAY_STYLE, PALETTE, WORLD_DEPTHS } from './styles.js';

const PAD           = 16;
const PROGRESS_W    = 180;
const PROGRESS_H    = 7;
const FONT          = OVERLAY_STYLE.FONT_FAMILY;
const BG            = PALETTE.overlayBackground;
const TEXT_COLOR    = PALETTE.overlayText;
const DIM_COLOR     = '#94a3b8';
const ACCENT_COLOR  = '#ff6b4a';
const PROG_BG_COLOR = 0x334155;
const PROG_FG_COLOR = 0xff6b4a;

/**
 * UI overlay for the quiz HUD — shown in the top-right corner.
 *
 * Layout (top → bottom, right-aligned):
 *   Level name  (small, dimmed)
 *   "Vind:"     (small label)
 *   Target name (bold)
 *   Score       "3 / 8"  (accent color)
 *   Hover bar   ▓▓▓░░░░
 *
 * All display objects are registered via `scene.registerUiObject()` so they:
 *   • are ignored by the main world camera
 *   • are shown by the UI camera with scroll factor 0
 */
export default class QuizHUD {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this._scene = scene;
    this._objs  = [];   // all managed display objects

    this._levelText  = this._text('', { color: DIM_COLOR,    fontSize: '12px' });
    this._labelText  = this._text('Vind:', { color: DIM_COLOR, fontSize: '12px' });
    this._targetText = this._text('', { color: TEXT_COLOR,   fontSize: '18px', fontStyle: 'bold' });
    this._scoreText  = this._text('', { color: ACCENT_COLOR, fontSize: '12px' });
    this._progBg     = this._gfx();
    this._progBar    = this._gfx();

    this._hideAll();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Show or update the HUD.
   * @param {string} targetName
   * @param {string} levelName
   * @param {{ current: number, total: number, score: number }} progress
   */
  showTarget(targetName, levelName, progress) {
    const { score, total } = progress;

    this._levelText .setText(levelName ?? '').setVisible(Boolean(levelName));
    this._labelText .setVisible(true);
    this._targetText.setText(targetName ?? '???').setVisible(true);
    this._scoreText .setText(`${score} / ${total}`).setVisible(true);
    this._progBg    .setVisible(true);
    this._progBar   .setVisible(true);

    this._drawBar(0);
    this._layout();
  }

  /** @param {number} progress - 0 to 1 */
  updateHoverProgress(progress) {
    this._drawBar(Math.max(0, Math.min(1, progress)));
  }

  showComplete(score, total) {
    this._labelText .setVisible(false);
    this._scoreText .setVisible(false);
    this._progBg    .setVisible(false);
    this._progBar   .setVisible(false);
    this._targetText.setText(`✓ Klaar!  ${score} / ${total}`).setVisible(true);
    this._drawBar(0);
    this._layout();
  }

  hide() {
    this._hideAll();
  }

  /** Re-compute element positions after a resize. */
  layout() {
    this._layout();
  }

  destroy() {
    for (const obj of this._objs) {
      obj?.destroy?.();
    }
    this._objs       = [];
    this._levelText  = null;
    this._labelText  = null;
    this._targetText = null;
    this._scoreText  = null;
    this._progBg     = null;
    this._progBar    = null;
  }

  // ── Internal builders ─────────────────────────────────────────────────────

  _text(content, extra = {}) {
    const obj = this._scene.registerUiObject(
      this._scene.add
        .text(0, 0, content, {
          fontFamily: FONT,
          fontSize:   extra.fontSize  ?? '14px',
          fontStyle:  extra.fontStyle ?? 'normal',
          color:      extra.color     ?? TEXT_COLOR,
          backgroundColor: BG,
          padding: { x: 10, y: 6 },
        })
        .setOrigin(1, 0)
        .setDepth(WORLD_DEPTHS.OVERLAY),
    );
    this._objs.push(obj);
    return obj;
  }

  _gfx() {
    const obj = this._scene.registerUiObject(
      this._scene.add.graphics().setDepth(WORLD_DEPTHS.OVERLAY),
    );
    this._objs.push(obj);
    return obj;
  }

  // ── Internal logic ────────────────────────────────────────────────────────

  _hideAll() {
    for (const obj of this._objs) {
      obj?.setVisible(false);
    }
  }

  _layout() {
    const sw = this._scene?.scale?.width  ?? 400;
    const rx = sw - PAD;       // right edge anchor
    let   y  = PAD;

    const place = (obj) => {
      if (!obj?.visible) return;
      obj.setX(rx).setY(y);
      y += (obj.height || 24) + 3;
    };

    place(this._levelText);
    place(this._labelText);
    place(this._targetText);
    place(this._scoreText);

    // Progress bar — left-aligned below the text block
    if (this._progBg?.visible) {
      const barX = rx - PROGRESS_W;
      this._progBg .setPosition(barX, y);
      this._progBar.setPosition(barX, y);
    }
  }

  _drawBar(progress) {
    if (!this._progBg || !this._progBar) return;

    this._progBg.clear();
    this._progBg.fillStyle(PROG_BG_COLOR, 0.55);
    this._progBg.fillRoundedRect(0, 0, PROGRESS_W, PROGRESS_H, 3);

    this._progBar.clear();
    if (progress > 0) {
      const filled = Math.round(PROGRESS_W * progress);
      this._progBar.fillStyle(PROG_FG_COLOR, 0.9);
      this._progBar.fillRoundedRect(0, 0, filled, PROGRESS_H, 3);
    }
  }
}
