import { describe, expect, it, vi } from 'vitest';
import TargetRevealEffect from '../quiz/TargetRevealEffect.js';

function makeGraphics() {
  const graphics = {
    clear: vi.fn(() => graphics),
    fillStyle: vi.fn(() => graphics),
    fillCircle: vi.fn(() => graphics),
    lineStyle: vi.fn(() => graphics),
    strokeCircle: vi.fn(() => graphics),
    setDepth: vi.fn(() => graphics),
    destroy: vi.fn(),
  };
  return graphics;
}

function makeScene() {
  const graphics = makeGraphics();
  return {
    registerWorldObject: (object) => object,
    add: {
      graphics: () => graphics,
    },
    cameras: {
      main: { zoom: 1 },
    },
    projection: null,
  };
}

describe('TargetRevealEffect', () => {
  it('resumes its fade after being unpinned', () => {
    const effect = new TargetRevealEffect(makeScene());
    effect.playReveal({ kind: 'circle', screenRadiusPx: 32 }, { x: 100, y: 100 }, {
      durationMs: 100,
    });

    effect.pin();
    effect.update(250);
    effect.unpin();

    expect(effect._active).toBe(true);

    effect.update(10);
    expect(effect._active).toBe(true);

    effect.update(50);
    expect(effect._active).toBe(false);
  });
});
