import { OVERLAY_STYLE, PALETTE, WORLD_DEPTHS } from './styles.js';

const FONT          = OVERLAY_STYLE.FONT_FAMILY;
const BG_COLOR      = 0x0f172a;
const TEXT_COLOR    = '#f8fafc';
const WIN_COLOR     = '#4ade80';
const LOSS_COLOR    = '#f87171';
const DEPTH         = WORLD_DEPTHS.OVERLAY + 1;

const BTN_BG_NORMAL = 'rgba(30,41,59,0.92)';
const BTN_BG_HOVER  = 'rgba(51,65,85,0.97)';

/**
 * Full-screen result overlay shown when a quiz run ends (win or loss).
 *
 * Uses `scene.registerUiObject()` so objects are rendered by the UI camera
 * with scrollFactor 0, consistent with the rest of the HUD layer.
 */
export default class ResultOverlay {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this._scene   = scene;
    this._objs    = [];
    this._showing = false;
    this._showParams = null;
  }

  /**
   * @param {{
   *   won:      boolean,
   *   score:    number,
   *   total:    number,
   *   onRetry:  () => void,
   *   onChoose: () => void,
   * }} params
   */
  show(params) {
    this._showParams = params;
    this._rebuild(params);
  }

  hide() {
    this._cleanup();
    this._showParams = null;
    this._showing    = false;
  }

  /** Re-render at the current viewport size (e.g. after a resize event). */
  layout() {
    if (this._showParams) {
      this._rebuild(this._showParams);
    }
  }

  destroy() {
    this._cleanup();
    this._showParams = null;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _rebuild(params) {
    this._cleanup();
    this._showing = true;

    const { won, score, total, onRetry, onChoose } = params;
    const sw = this._scene.scale?.width  ?? 400;
    const sh = this._scene.scale?.height ?? 300;
    const cx = sw / 2;
    const cy = Math.round(sh * 0.42);

    // Semi-transparent backdrop
    const bg = this._reg(this._scene.add.graphics().setDepth(DEPTH));
    bg.fillStyle(BG_COLOR, 0.82);
    bg.fillRect(0, 0, sw, sh);

    // Win / loss title
    const titleStr   = won ? '🎉 Gewonnen!' : '⏱ Tijd is op!';
    const titleColor = won ? WIN_COLOR : LOSS_COLOR;
    this._reg(
      this._scene.add.text(cx, cy - 70, titleStr, {
        fontFamily: FONT,
        fontSize:   '30px',
        fontStyle:  'bold',
        color:      titleColor,
      }).setOrigin(0.5).setDepth(DEPTH),
    );

    // Score line
    this._reg(
      this._scene.add.text(cx, cy - 22, `Score: ${score} / ${total}`, {
        fontFamily: FONT,
        fontSize:   '18px',
        color:      TEXT_COLOR,
      }).setOrigin(0.5).setDepth(DEPTH),
    );

    // Buttons
    const btnY = cy + 46;
    this._makeButton(cx - 108, btnY, 'Opnieuw spelen', onRetry);
    this._makeButton(cx + 108, btnY, 'Kies een quiz',  onChoose);
  }

  _makeButton(x, y, label, onClick) {
    let pressedPointerId = null;
    const btn = this._reg(
      this._scene.add.text(x, y, label, {
        fontFamily:      FONT,
        fontSize:        '15px',
        color:           TEXT_COLOR,
        backgroundColor: BTN_BG_NORMAL,
        padding:         { x: 14, y: 10 },
      })
        .setOrigin(0.5)
        .setDepth(DEPTH)
        .setInteractive({ useHandCursor: true }),
    );

    btn.on('pointerdown', (pointer) => {
      pressedPointerId = pointer.id;
      btn.setStyle({ backgroundColor: BTN_BG_HOVER });
    });
    btn.on('pointerup', (pointer) => {
      const shouldClick = pressedPointerId === pointer.id;
      pressedPointerId = null;
      btn.setStyle({ backgroundColor: BTN_BG_NORMAL });
      if (shouldClick) {
        onClick();
      }
    });
    btn.on('pointerover',  () => btn.setStyle({ backgroundColor: BTN_BG_HOVER }));
    btn.on('pointerout',   () => {
      pressedPointerId = null;
      btn.setStyle({ backgroundColor: BTN_BG_NORMAL });
    });
  }

  _reg(obj) {
    const registered = this._scene.registerUiObject(obj);
    this._objs.push(registered ?? obj);
    return registered ?? obj;
  }

  _cleanup() {
    for (const obj of this._objs) {
      obj?.destroy?.();
    }
    this._objs = [];
  }
}
