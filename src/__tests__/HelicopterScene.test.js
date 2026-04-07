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

  it('returns false while the answer reveal is active', () => {
    const scene = makeScene();
    scene._answerRevealActive = true;
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

describe('HelicopterScene screen-space helpers', () => {
  const makeSizingScene = () => {
    const scene = Object.create(HelicopterScene.prototype);
    scene.cameras = { main: { zoom: 2 } };
    scene._quizController = {
      level: {
        targetScreenRadius: 18,
        helicopterScreenWidth: 72,
      },
    };
    return scene;
  };

  it('converts target radius from screen pixels to world units', () => {
    const scene = makeSizingScene();
    expect(scene.getTargetHitRadius()).toBeCloseTo(9);
  });

  it('scales the helicopter to a stable on-screen width', () => {
    const scene = makeSizingScene();
    scene.helicopter = {
      getBaseDisplaySize: () => ({ width: 80, height: 80 }),
      setVisualScale: vi.fn(),
    };

    scene.syncHelicopterScale();

    expect(scene.helicopter.setVisualScale).toHaveBeenCalledWith(0.45);
  });
});

describe('HelicopterScene.setHelicopterTarget', () => {
  const makeTargetScene = () => {
    const scene = Object.create(HelicopterScene.prototype);
    scene._runEnded = false;
    scene._answerRevealActive = false;
    scene.helicopter = { setTarget: vi.fn() };
    scene.clampWorldPoint = vi.fn((x, y) => ({ x, y }));
    scene.getPreciseArrivalThreshold = vi.fn(() => 2.5);
    scene._getQuizSnapTarget = vi.fn(() => null);
    return scene;
  };

  it('snaps regular click targets to the exact cursor position', () => {
    const scene = makeTargetScene();

    scene.setHelicopterTarget(120, 340);

    expect(scene.helicopter.setTarget).toHaveBeenCalledWith(120, 340, {
      stopThreshold: 2.5,
      snapOnArrival: true,
    });
  });

  it('prefers the active quiz target when the click lands inside its snap radius', () => {
    const scene = makeTargetScene();
    scene._getQuizSnapTarget = vi.fn(() => ({ x: 500, y: 600 }));

    scene.setHelicopterTarget(120, 340);

    expect(scene.helicopter.setTarget).toHaveBeenCalledWith(500, 600, {
      stopThreshold: 2.5,
      snapOnArrival: true,
    });
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

// ── Fixed-framing startup / resize ────────────────────────────────────────────

const makeFramingScene = () => {
  const scene = Object.create(HelicopterScene.prototype);
  scene._fixedFramingActive = false;
  scene._quizSetTargets = null;
  scene._framingState = null;
  scene.baseMapMinZoom = 1;

  const camera = {
    width: 1280,
    height: 720,
    zoom: 1,
    scrollX: 0,
    scrollY: 0,
    setZoom: vi.fn(function (z) {
      this.zoom = z;
    }),
    setViewport: vi.fn(),
    setSize: vi.fn(),
  };
  scene.cameras = { main: camera };
  scene.uiCamera = { setViewport: vi.fn(), setSize: vi.fn() };
  scene.inputController = { setZoomLimits: vi.fn(), clampCamera: vi.fn() };
  scene.overlayText = null;
  scene.syncZoomResponsiveElements = vi.fn();
  scene.layoutOverlay = vi.fn();
  scene.scale = { width: 1280, height: 720 };
  scene.lastCameraZoom = 1;

  return scene;
};

describe('HelicopterScene._applyFixedFramingState', () => {
  it('sets camera zoom, scroll and zoom limits from the framing', () => {
    const scene = makeFramingScene();
    const framing = {
      zoom: 2.5,
      scrollX: 300,
      scrollY: 150,
      cameraScrollX: 300,
      cameraScrollY: 150,
      centerX: 940,
      centerY: 510,
    };

    scene._applyFixedFramingState(framing);

    expect(scene.cameras.main.setZoom).toHaveBeenCalledWith(2.5);
    expect(scene.cameras.main.scrollX).toBe(300);
    expect(scene.cameras.main.scrollY).toBe(150);
    expect(scene.inputController.setZoomLimits).toHaveBeenCalledWith(2.5, 2.5);
    expect(scene.inputController.clampCamera).toHaveBeenCalled();
    expect(scene.baseMapMinZoom).toBe(2.5);
  });

  it('is a no-op when framing is null', () => {
    const scene = makeFramingScene();
    scene.cameras.main.scrollX = 999;

    scene._applyFixedFramingState(null);

    expect(scene.cameras.main.setZoom).not.toHaveBeenCalled();
    expect(scene.cameras.main.scrollX).toBe(999);
    expect(scene.inputController.setZoomLimits).not.toHaveBeenCalled();
  });
});

describe('HelicopterScene.handleResize with fixed framing', () => {
  it('locks zoom limits to the framing zoom after resize', () => {
    const scene = makeFramingScene();
    scene._fixedFramingActive = true;
    scene._quizSetTargets = [{ lat: 48, lon: 2 }];
    const newFraming = {
      zoom: 2.8,
      scrollX: 350,
      scrollY: 180,
      cameraScrollX: 350,
      cameraScrollY: 180,
      centerX: 990,
      centerY: 540,
    };
    scene._computeFramingState = vi.fn(() => newFraming);

    scene.handleResize({ width: 1440, height: 900 });

    expect(scene._computeFramingState).toHaveBeenCalledWith(1440, 900);
    expect(scene.cameras.main.setZoom).toHaveBeenCalledWith(2.8);
    expect(scene.cameras.main.scrollX).toBe(350);
    expect(scene.cameras.main.scrollY).toBe(180);

    // Final setZoomLimits call must lock both ends to the framing zoom.
    const calls = scene.inputController.setZoomLimits.mock.calls;
    expect(calls[calls.length - 1]).toEqual([2.8, 2.8]);
  });

  it('does not apply fixed framing state when fixed framing is inactive', () => {
    const scene = makeFramingScene();
    scene._fixedFramingActive = false;
    scene._computeFramingState = vi.fn();

    scene.handleResize({ width: 1440, height: 900 });

    expect(scene._computeFramingState).not.toHaveBeenCalled();
    expect(scene.cameras.main.setZoom).not.toHaveBeenCalled();
  });
});

describe('HelicopterScene createSceneSystems fixed-framing reapplication', () => {
  it('recomputes framing with camera.width/height and applies it at startup', () => {
    const scene = makeFramingScene();
    scene._fixedFramingActive = true;
    scene._quizSetTargets = [{ lat: 48, lon: 2 }];

    // Camera may differ from scale dimensions (the scenario the fix addresses).
    scene.cameras.main.width = 1920;
    scene.cameras.main.height = 1080;

    const framingFromCamera = {
      zoom: 3.2,
      scrollX: 420,
      scrollY: 210,
      centerX: 1100,
      centerY: 580,
    };
    scene._computeFramingState = vi.fn(() => framingFromCamera);
    scene._applyFixedFramingState = vi.fn();
    scene.setCameraFollowPaused = vi.fn();

    // Stub the non-fixed-framing parts of createSceneSystems.
    scene.physics = null;
    scene._audioManager = { startRotorLoop: vi.fn() };
    scene.instantiateCameraController = vi.fn(() => null);
    scene.input = { on: vi.fn() };
    scene._startQuizSystems = vi.fn();

    scene.createSceneSystems();

    // Must use the real camera dimensions, not scale.width/height.
    expect(scene._computeFramingState).toHaveBeenCalledWith(1920, 1080);
    expect(scene._applyFixedFramingState).toHaveBeenCalledWith(
      framingFromCamera,
      'startup-live-camera',
    );
    expect(scene._framingState).toBe(framingFromCamera);
  });
});
