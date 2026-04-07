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
  scene.inputController = { setZoomLimits: vi.fn(), clampCamera: vi.fn(), setDragLocked: vi.fn() };
  scene.setCameraFollowPaused = vi.fn();
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

  it('locks camera follow and drag for width/contain framing (landscape)', () => {
    const scene = makeFramingScene();
    const framing = {
      zoom: 1.2,
      cameraScrollX: 100,
      cameraScrollY: 50,
      centerX: 800,
      centerY: 400,
      fitMode: 'width',
    };

    scene._applyFixedFramingState(framing);

    expect(scene.setCameraFollowPaused).toHaveBeenCalledWith(true);
    expect(scene.inputController.setDragLocked).toHaveBeenCalledWith(true);
  });

  it('enables camera follow and drag for cover framing (portrait)', () => {
    const scene = makeFramingScene();
    const framing = {
      zoom: 1.6,
      cameraScrollX: 200,
      cameraScrollY: 100,
      centerX: 800,
      centerY: 400,
      fitMode: 'cover',
    };

    scene._applyFixedFramingState(framing);

    expect(scene.setCameraFollowPaused).toHaveBeenCalledWith(false);
    expect(scene.inputController.setDragLocked).toHaveBeenCalledWith(false);
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

describe('HelicopterScene.isManualCameraActive', () => {
  const makeManualCameraScene = (fitMode = 'width', inputControllerOverrides = {}) => {
    const scene = Object.create(HelicopterScene.prototype);
    scene._fixedFramingActive = true;
    scene._framingState = { fitMode };
    scene.freeLookActive = false;
    scene.manualCameraUntil = 0;
    scene.time = { now: 0 };
    scene.inputController = {
      dragging: false,
      pinching: false,
      isCommandSteeringActive: vi.fn(() => false),
      commandSteering: false,
      ...inputControllerOverrides,
    };
    scene.enterFreeLook = vi.fn(function () {
      this.freeLookActive = true;
      this.manualCameraUntil = this.time.now + 3000;
    });
    scene.resumeCameraFollow = vi.fn(function () {
      this.freeLookActive = false;
      this.manualCameraUntil = 0;
    });
    return scene;
  };

  it('keeps landscape fixed framing locked', () => {
    const scene = makeManualCameraScene('width');

    expect(scene.isManualCameraActive(0)).toBe(true);
    expect(scene.enterFreeLook).not.toHaveBeenCalled();
  });

  it('allows follow in portrait cover mode when no camera gesture is active', () => {
    const scene = makeManualCameraScene('cover');

    expect(scene.isManualCameraActive(0)).toBe(false);
    expect(scene.enterFreeLook).not.toHaveBeenCalled();
  });

  it('switches cover mode back to manual camera control while dragging', () => {
    const scene = makeManualCameraScene('cover', { dragging: true });

    expect(scene.isManualCameraActive(0)).toBe(true);
    expect(scene.enterFreeLook).toHaveBeenCalled();
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

describe('HelicopterScene._computeFramingState with projection framing', () => {
  // Map bounds: width=400, height=600 (portrait map, aspect 0.667).
  // Viewport 390×844 (portrait, aspect 0.462 < 0.667) → cover mode.
  // cover zoom = max(390/400, 844/600) = max(0.975, 1.407) = 1.407.
  it('uses cover-fit for a portrait viewport relative to map bounds', () => {
    const scene = Object.create(HelicopterScene.prototype);
    scene._quizSetTargets = [{ id: 'country-iceland', lat: 65, lon: -19 }];
    scene._quizController = { level: { framingPaddingFactor: 0.25 } };
    scene._currentQuizSetId = 'quiz-noord-europa';
    scene._getProjectionFramingBounds = vi.fn(() => ({
      minX: 100,
      maxX: 500,
      minY: 50,
      maxY: 650,
      centerX: 300,
      centerY: 350,
    }));
    scene._getDatasets = vi.fn(() => ({}));
    scene.projectLatLon = vi.fn(() => ({ x: 200, y: 200 }));

    const framing = scene._computeFramingState(390, 844);

    expect(scene._getProjectionFramingBounds).toHaveBeenCalled();
    expect(framing.centerX).toBeCloseTo(300);
    expect(framing.centerY).toBeCloseTo(350);
    // Cover zoom fills the height: 844 / 600 ≈ 1.407
    expect(framing.zoom).toBeCloseTo(844 / 600, 5);
    expect(framing.fitMode).toBe('cover');
  });

  // Map bounds: width=1024, height=527 (landscape map like N.Europe, aspect 1.94).
  // Viewport 844×390 (landscape, aspect 2.16 > 1.94) → width mode.
  // width zoom = 844/1024 ≈ 0.824.
  it('uses width-fit for a landscape viewport relative to map bounds', () => {
    const scene = Object.create(HelicopterScene.prototype);
    scene._quizSetTargets = [{ id: 'country-norway', lat: 62, lon: 10 }];
    scene._quizController = { level: { framingPaddingFactor: 0.08 } };
    scene._currentQuizSetId = 'quiz-noord-europa';
    scene._getProjectionFramingBounds = vi.fn(() => ({
      minX: 1536,
      maxX: 2560,
      minY: 760,
      maxY: 1287,
      centerX: 2048,
      centerY: 1023,
    }));
    scene._getDatasets = vi.fn(() => ({}));
    scene.projectLatLon = vi.fn(() => ({ x: 2048, y: 1023 }));

    const framing = scene._computeFramingState(844, 390);

    expect(framing.zoom).toBeCloseTo(844 / 1024, 5);
    expect(framing.fitMode).toBe('width');
  });

  // Map bounds: width=1024, height=527 (landscape, aspect 1.94).
  // Viewport 390×844 (portrait, aspect 0.46 < 1.94) → cover mode.
  // cover zoom = max(390/1024, 844/527) = max(0.381, 1.601) = 1.601.
  it('uses cover-fit for a portrait viewport with a landscape map (N.Europe scenario)', () => {
    const scene = Object.create(HelicopterScene.prototype);
    scene._quizSetTargets = [{ id: 'country-norway', lat: 62, lon: 10 }];
    scene._quizController = { level: { framingPaddingFactor: 0.08 } };
    scene._currentQuizSetId = 'quiz-noord-europa';
    scene._getProjectionFramingBounds = vi.fn(() => ({
      minX: 1536,
      maxX: 2560,
      minY: 760,
      maxY: 1287,
      centerX: 2048,
      centerY: 1023,
    }));
    scene._getDatasets = vi.fn(() => ({}));
    scene.projectLatLon = vi.fn(() => ({ x: 2048, y: 1023 }));

    const framing = scene._computeFramingState(390, 844);

    // Cover zoom fills the height: 844/527 ≈ 1.601
    expect(framing.zoom).toBeCloseTo(844 / 527, 5);
    expect(framing.fitMode).toBe('cover');
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

describe('HelicopterScene._resolveStartPlayMode', () => {
  it('returns the playMode from sys.settings.data', () => {
    const scene = Object.create(HelicopterScene.prototype);
    scene.sys = { settings: { data: { playMode: 'spelling' } } };
    expect(scene._resolveStartPlayMode()).toBe('spelling');
  });

  it('falls back to scene.settings.data when sys data is absent', () => {
    const scene = Object.create(HelicopterScene.prototype);
    scene.sys = { settings: { data: null } };
    scene.scene = { settings: { data: { playMode: 'mixed' } } };
    expect(scene._resolveStartPlayMode()).toBe('mixed');
  });

  it('returns null when playMode is not present in scene data', () => {
    const scene = Object.create(HelicopterScene.prototype);
    scene.sys = { settings: { data: { quizSetId: 'quiz-nl' } } };
    expect(scene._resolveStartPlayMode()).toBe(null);
  });

  it('returns null when scene data is completely absent', () => {
    const scene = Object.create(HelicopterScene.prototype);
    scene.sys = { settings: { data: {} } };
    expect(scene._resolveStartPlayMode()).toBe(null);
  });

  it('returns null in a non-browser environment without sys/scene', () => {
    const scene = Object.create(HelicopterScene.prototype);
    expect(scene._resolveStartPlayMode()).toBe(null);
  });
});

// ── Spelling mode ──────────────────────────────────────────────────────────────

describe('HelicopterScene.shouldHandleCommand (spelling mode)', () => {
  const makeScene = () => {
    const scene = Object.create(HelicopterScene.prototype);
    scene._runEnded = false;
    scene._answerRevealActive = false;
    scene._spellingAutoFlyActive = false;
    scene._spellingWaitingForInput = false;
    scene.isWorldPointWithinBounds = vi.fn(() => true);
    scene.getActiveTouchCount = vi.fn(() => 0);
    scene.isPrimaryCommandPointer = vi.fn(() => true);
    return scene;
  };

  it('returns false while auto-flying to a spelling target', () => {
    const scene = makeScene();
    scene._answerRevealActive = true;
    scene._spellingAutoFlyActive = true;
    expect(scene.shouldHandleCommand({ pointerType: 'mouse' }, 100, 100)).toBe(false);
  });

  it('returns false while waiting for typed input', () => {
    const scene = makeScene();
    scene._answerRevealActive = true;
    scene._spellingWaitingForInput = true;
    expect(scene.shouldHandleCommand({ pointerType: 'mouse' }, 100, 100)).toBe(false);
  });
});

describe('HelicopterScene._checkSpellingArrival', () => {
  const makeScene = (heliPos, targetPos, geometry = null) => {
    const scene = Object.create(HelicopterScene.prototype);
    scene._spellingAutoFlyActive = true;
    scene._spellingWaitingForInput = false;
    scene._activeTargetPoint = targetPos;
    scene._activeTargetGeometry = geometry;
    scene.helicopter = { getPosition: vi.fn(() => heliPos) };
    scene.getCameraZoom = vi.fn(() => 1);
    scene.getTargetHitRadius = vi.fn(() => 50);
    scene._showSpellingPrompt = vi.fn();
    return scene;
  };

  it('calls _showSpellingPrompt when helicopter is within the hit radius', () => {
    const scene = makeScene({ x: 100, y: 100 }, { x: 120, y: 110 });

    scene._checkSpellingArrival();

    expect(scene._spellingAutoFlyActive).toBe(false);
    expect(scene._showSpellingPrompt).toHaveBeenCalled();
  });

  it('does not call _showSpellingPrompt when helicopter is outside hit radius', () => {
    const scene = makeScene({ x: 0, y: 0 }, { x: 500, y: 500 });

    scene._checkSpellingArrival();

    expect(scene._spellingAutoFlyActive).toBe(true);
    expect(scene._showSpellingPrompt).not.toHaveBeenCalled();
  });

  it('uses target geometry containment when projected geometry is available', () => {
    const scene = makeScene(
      { x: 200, y: 300 },
      { x: 900, y: 900 },
      { kind: 'circle', centerX: 200, centerY: 300, screenRadiusPx: 12 },
    );

    scene.getTargetHitRadius = vi.fn(() => 1);

    scene._checkSpellingArrival();

    expect(scene._spellingAutoFlyActive).toBe(false);
    expect(scene._showSpellingPrompt).toHaveBeenCalled();
  });

  it('does nothing when _activeTargetPoint is null', () => {
    const scene = makeScene({ x: 100, y: 100 }, null);

    scene._checkSpellingArrival();

    expect(scene._showSpellingPrompt).not.toHaveBeenCalled();
  });
});

describe('HelicopterScene._showSpellingPrompt', () => {
  it('pins the reveal and shows the typing overlay without playing success audio yet', () => {
    const overlay = { show: vi.fn() };
    const scene = Object.create(HelicopterScene.prototype);
    scene._activeTarget = { name: 'Finland', category: 'countries' };
    scene._activeTargetPoint = { x: 300, y: 400 };
    scene._activeTargetReveal = { kind: 'circle', screenRadiusPx: 40 };
    scene._spellingWaitingForInput = false;
    scene._targetRevealEffect = { playReveal: vi.fn(), pin: vi.fn() };
    scene._audioManager = { playFoundSound: vi.fn() };
    scene.getRevealDurationMs = vi.fn(() => 1200);
    scene._getOrCreateTypingOverlay = vi.fn(() => overlay);

    scene._showSpellingPrompt();

    expect(scene._spellingWaitingForInput).toBe(true);
    expect(scene._targetRevealEffect.playReveal).toHaveBeenCalledWith(
      scene._activeTargetReveal,
      scene._activeTargetPoint,
      { durationMs: 1200 },
    );
    expect(scene._targetRevealEffect.pin).toHaveBeenCalled();
    expect(scene._audioManager.playFoundSound).not.toHaveBeenCalled();
    expect(overlay.show).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Typ de naam van dit land:',
        check: expect.any(Function),
        onAccepted: expect.any(Function),
      }),
    );

    const [{ check }] = overlay.show.mock.calls[0];
    expect(check('finland')).toBe(true);
    expect(check('Zweden')).toBe(false);
  });
});

describe('HelicopterScene._handleSpellingAccepted', () => {
  it('plays the success cue, clears spelling state, and advances the quiz', () => {
    const scene = Object.create(HelicopterScene.prototype);
    scene._spellingAutoFlyActive = true;
    scene._spellingWaitingForInput = true;
    scene._answerRevealActive = true;
    scene._targetRevealEffect = { unpin: vi.fn(), clear: vi.fn() };
    scene._typingOverlay = { hide: vi.fn() };
    scene._quizController = { advance: vi.fn() };
    scene._audioManager = { playFoundSound: vi.fn() };

    scene._handleSpellingAccepted();

    expect(scene._spellingAutoFlyActive).toBe(false);
    expect(scene._spellingWaitingForInput).toBe(false);
    expect(scene._answerRevealActive).toBe(false);
    expect(scene._audioManager.playFoundSound).toHaveBeenCalled();
    expect(scene._targetRevealEffect.unpin).toHaveBeenCalled();
    expect(scene._targetRevealEffect.clear).toHaveBeenCalled();
    expect(scene._typingOverlay.hide).toHaveBeenCalled();
    expect(scene._quizController.advance).toHaveBeenCalled();
  });
});

describe('HelicopterScene._onQuizTargetChange (spelling mode)', () => {
  const makeScene = () => {
    const scene = Object.create(HelicopterScene.prototype);
    scene._pendingAdvanceEvent = { remove: vi.fn() };
    scene._answerRevealActive = false;
    scene._spellingAutoFlyActive = false;
    scene._spellingWaitingForInput = false;
    scene._activeTarget = null;
    scene._activeTargetPoint = null;
    scene._activeTargetReveal = null;
    scene._activeTargetGeometry = null;
    scene._typingOverlay = { hide: vi.fn() };
    scene._targetRevealEffect = { clear: vi.fn() };
    scene._targetVisualizer = { showTarget: vi.fn(), hideTarget: vi.fn() };
    scene._hoverDetector = { reset: vi.fn() };
    scene._searchTimer = { start: vi.fn() };
    scene._searchTimerDuration = 5000;
    scene._quizController = { level: { name: 'Test Level' } };
    scene._quizHUD = { showTarget: vi.fn(), showSpellingTarget: vi.fn() };
    scene.helicopter = { setTarget: vi.fn() };
    scene.projectLatLon = vi.fn(() => ({ x: 300, y: 400 }));
    scene.getPreciseArrivalThreshold = vi.fn(() => 3);
    scene.getTargetScreenRadius = vi.fn(() => 50);
    scene._getDatasets = vi.fn(() => ({}));
    scene._activeTargetReveal = null;
    scene._activeTargetGeometry = null;
    scene.getDebugSceneSnapshot = vi.fn(() => ({}));
    return scene;
  };

  it('auto-flies and blocks input for spelling questions', () => {
    const scene = makeScene();
    const previousAdvanceEvent = scene._pendingAdvanceEvent;

    const spellingTarget = {
      id: 'city-helsinki',
      name: 'Helsinki',
      lat: 60.17,
      lon: 24.94,
      category: 'cities',
      questionMode: 'spelling',
    };
    scene._onQuizTargetChange(spellingTarget, { score: 0, total: 5, current: 0 });

    expect(previousAdvanceEvent.remove).toHaveBeenCalledWith(false);
    expect(scene._pendingAdvanceEvent).toBeNull();
    expect(scene._answerRevealActive).toBe(true);
    expect(scene._spellingAutoFlyActive).toBe(true);
    expect(scene.helicopter.setTarget).toHaveBeenCalledWith(300, 400, {
      stopThreshold: 3,
      snapOnArrival: true,
    });
    expect(scene._activeTargetReveal).toEqual(expect.objectContaining({ kind: 'circle' }));
    expect(scene._activeTargetGeometry).toEqual(expect.objectContaining({
      kind: 'circle',
      centerX: 300,
      centerY: 400,
    }));
    expect(scene._targetVisualizer.hideTarget).toHaveBeenCalled();
    expect(scene._targetVisualizer.showTarget).not.toHaveBeenCalled();
    expect(scene._searchTimer.start).not.toHaveBeenCalled();
    expect(scene._quizHUD.showSpellingTarget).toHaveBeenCalledWith(
      'cities',
      'Test Level',
      { score: 0, total: 5, current: 0 },
    );
  });

  it('uses locate flow for normal locate questions', () => {
    const scene = makeScene();

    const locateTarget = {
      id: 'amsterdam',
      name: 'Amsterdam',
      lat: 52,
      lon: 4.9,
      category: 'cities',
      questionMode: 'locate',
    };
    scene._onQuizTargetChange(locateTarget, { score: 0, total: 5, current: 0 });

    expect(scene._answerRevealActive).toBe(false);
    expect(scene._spellingAutoFlyActive).toBe(false);
    expect(scene._targetVisualizer.showTarget).toHaveBeenCalled();
    expect(scene._searchTimer.start).toHaveBeenCalledWith(5000);
    expect(scene._quizHUD.showTarget).toHaveBeenCalledWith(
      'Amsterdam',
      'Test Level',
      { score: 0, total: 5, current: 0 },
    );
  });
});

describe('HelicopterScene._updateQuiz (spelling mode)', () => {
  it('does not tick the search timer while waiting for a typed answer', () => {
    const scene = Object.create(HelicopterScene.prototype);
    scene._targetRevealEffect = { update: vi.fn() };
    scene._answerRevealActive = true;
    scene._spellingAutoFlyActive = false;
    scene._checkSpellingArrival = vi.fn();
    scene._searchTimer = {
      isRunning: true,
      update: vi.fn(),
      getRemaining: vi.fn(() => 4000),
    };
    scene._quizHUD = { showTimer: vi.fn() };

    scene._updateQuiz(16);

    expect(scene._checkSpellingArrival).not.toHaveBeenCalled();
    expect(scene._searchTimer.update).not.toHaveBeenCalled();
    expect(scene._quizHUD.showTimer).not.toHaveBeenCalled();
  });
});

describe('HelicopterScene._buildSpellingPrompt', () => {
  it('generates a Dutch prompt using the category label', () => {
    const scene = Object.create(HelicopterScene.prototype);
    expect(scene._buildSpellingPrompt({ category: 'countries', name: 'Finland' }))
      .toBe('Typ de naam van dit land:');
  });

  it('uses Dutch nouns for water and areas', () => {
    const scene = Object.create(HelicopterScene.prototype);
    expect(scene._buildSpellingPrompt({ category: 'water', name: 'Noordzee' }))
      .toBe('Typ de naam van dit water:');
    expect(scene._buildSpellingPrompt({ category: 'areas', name: 'De Biesbosch' }))
      .toBe('Typ de naam van dit gebied:');
  });

  it('uses the raw category when there is no Dutch mapping', () => {
    const scene = Object.create(HelicopterScene.prototype);
    expect(scene._buildSpellingPrompt({ category: 'provinces', name: 'X' }))
      .toBe('Typ de naam van dit provinces:');
  });

  it('falls back to "gebied" when category is empty', () => {
    const scene = Object.create(HelicopterScene.prototype);
    expect(scene._buildSpellingPrompt({ category: '', name: 'X' }))
      .toBe('Typ de naam van dit gebied:');
  });
});
