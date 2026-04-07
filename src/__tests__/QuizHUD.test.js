import { describe, expect, it } from 'vitest';
import QuizHUD from '../ui/QuizHUD.js';

function makeText(initialText = '') {
  return {
    text: initialText,
    visible: true,
    height: 24,
    setOrigin() { return this; },
    setDepth() { return this; },
    setText(value) {
      this.text = value;
      return this;
    },
    setVisible(value) {
      this.visible = value;
      return this;
    },
    setStyle(style) {
      this.style = { ...(this.style ?? {}), ...style };
      return this;
    },
    setX(value) {
      this.x = value;
      return this;
    },
    setY(value) {
      this.y = value;
      return this;
    },
    destroy() {},
  };
}

function makeGraphics() {
  return {
    visible: true,
    clear() { return this; },
    fillStyle() { return this; },
    fillRoundedRect() { return this; },
    setDepth() { return this; },
    setVisible(value) {
      this.visible = value;
      return this;
    },
    setPosition(x, y) {
      this.x = x;
      this.y = y;
      return this;
    },
    destroy() {},
  };
}

function makeScene() {
  return {
    scale: { width: 1280, height: 720 },
    registerUiObject: (object) => object,
    add: {
      text: (_x, _y, content) => makeText(content),
      graphics: () => makeGraphics(),
    },
  };
}

describe('QuizHUD', () => {
  it('restores the locate label after showing a spelling question', () => {
    const hud = new QuizHUD(makeScene());
    const progress = { current: 1, total: 5, score: 2 };

    hud.showSpellingTarget('cities', 'Noord-Europa', progress);
    hud.showTarget('Amsterdam', 'Noord-Europa', progress);

    expect(hud._labelText.text).toBe('Vind:');
  });
});
