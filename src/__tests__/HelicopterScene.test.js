import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Scene: class {},
    Loader: { Events: { PROGRESS: 'progress' } },
    Physics: {
      Arcade: {
        Sprite: class {},
      },
    },
    Scale: { Events: { RESIZE: 'resize' } },
    Scenes: { Events: { SHUTDOWN: 'shutdown' } },
    Math: {
      Vector2: class {
        constructor(x = 0, y = 0) {
          this.x = x;
          this.y = y;
        }

        set(x, y) {
          this.x = x;
          this.y = y;
          return this;
        }
      },
      Clamp: (value, min, max) => Math.min(Math.max(value, min), max),
      Linear: (start, end, progress) => start + (end - start) * progress,
      Distance: {
        Between: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
      },
    },
  },
}));

import HelicopterScene from '../scenes/HelicopterScene.js';

describe('HelicopterScene.getSpawnPoint', () => {
  it('uses the fixed-framing center for curated quiz runs', () => {
    const scene = Object.create(HelicopterScene.prototype);
    scene._fixedFramingActive = true;
    scene._framingState = { centerX: 1234, centerY: 567 };
    scene.getMarkerCentroid = vi.fn(() => ({ x: 999, y: 888 }));

    expect(scene.getSpawnPoint()).toEqual({ x: 1234, y: 567 });
  });
});

describe('HelicopterScene.shouldHandleCommand', () => {
  const makeScene = () => {
    const scene = Object.create(HelicopterScene.prototype);
    scene._runEnded = false;
    scene.isWorldPointWithinBounds = vi.fn(() => true);
    scene.getActiveTouchCount = vi.fn(() => 0);
    scene.isPrimaryCommandPointer = vi.fn(() => true);
    return scene;
  };

  it('returns true when run is active and pointer is valid', () => {
    const scene = makeScene();
    const pointer = { pointerType: 'mouse' };
    expect(scene.shouldHandleCommand(pointer, 100, 100)).toBe(true);
  });

  it('returns false when run has ended', () => {
    const scene = makeScene();
    scene._runEnded = true;
    const pointer = { pointerType: 'mouse' };
    expect(scene.shouldHandleCommand(pointer, 100, 100)).toBe(false);
  });

  it('returns false when world point is out of bounds', () => {
    const scene = makeScene();
    scene.isWorldPointWithinBounds = vi.fn(() => false);
    const pointer = { pointerType: 'mouse' };
    expect(scene.shouldHandleCommand(pointer, -1, -1)).toBe(false);
  });
});

describe('HelicopterScene._buildLevelFromQuizSet', () => {
  it('includes searchTime from quiz set', () => {
    const scene = Object.create(HelicopterScene.prototype);
    const quizSet = {
      id: 'test-set',
      name: 'Test',
      searchTime: 45,
      hoverTime: 3000,
      helicopterSpeed: 300,
      targetRadius: 60,
      fixedFraming: false,
      framingPaddingFactor: 0.12,
      targets: ['t1'],
    };
    const targetsData = {
      countries: [{ id: 't1', name: 'Land', lat: 50, lon: 5 }],
    };
    const level = scene._buildLevelFromQuizSet(quizSet, targetsData);
    expect(level.searchTime).toBe(45);
  });

  it('defaults searchTime to 60 when not specified', () => {
    const scene = Object.create(HelicopterScene.prototype);
    const quizSet = {
      id: 'test-set',
      name: 'Test',
      targets: [],
      fixedFraming: false,
    };
    const level = scene._buildLevelFromQuizSet(quizSet, {});
    expect(level.searchTime).toBe(60);
  });
});
