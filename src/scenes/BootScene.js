import Phaser from 'phaser';
import { PALETTE } from '../ui/styles.js';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    this.cameras.main.setBackgroundColor(PALETTE.water);

    const canvas = this.game.canvas;
    if (canvas) {
      canvas.style.touchAction = 'none';
      canvas.style.userSelect = 'none';
      canvas.style.webkitUserSelect = 'none';
      canvas.style.webkitTapHighlightColor = 'transparent';
    }

    this.input.mouse?.disableContextMenu();

    const pointerCount =
      this.input.manager?.pointersTotal ?? this.input.pointersTotal ?? 1;

    if (!this.registry.get('touch-pointers-ready')) {
      if (pointerCount < 3) {
        this.input.addPointer(3 - pointerCount);
      }

      this.registry.set('touch-pointers-ready', true);
    }

    this.scene.start('PreloadScene');
  }
}
