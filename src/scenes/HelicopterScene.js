import Phaser from 'phaser';
import CameraController from '../core/CameraController.js';
import Helicopter from '../entities/Helicopter.js';
import MapScene from './MapScene.js';
import QuizController from '../quiz/QuizController.js';
import HoverDetector from '../quiz/HoverDetector.js';
import SearchTimer from '../quiz/SearchTimer.js';
import TargetVisualizer from '../quiz/TargetVisualizer.js';
import TargetRevealEffect from '../quiz/TargetRevealEffect.js';
import { resolveTargetRevealGeometry } from '../quiz/targetRevealResolver.js';
import {
  computeProjectedTargetBounds,
  containsProjectedPoint,
  resolveProjectedTargetGeometry,
} from '../quiz/targetGeometry.js';
import QuizHUD from '../ui/QuizHUD.js';
import ResultOverlay from '../ui/ResultOverlay.js';
import { DATA_CACHE_KEYS } from './PreloadScene.js';
import { computeFixedFramingFromBounds } from '../core/quizFraming.js';
import { getAudioManager } from '../audio/AudioManager.js';
import { interpolateRotorProfile } from '../audio/audioProfiles.js';
import {
  debugLog,
  describeCameraView,
  summarizeProjectedTargets,
  summarizeTargets,
} from '../core/runtimeDebug.js';
import {
  getCameraScrollForWorldCenter,
  setCameraScroll,
} from '../core/cameraMath.js';
import {
  CAMERA_FOLLOW,
  HELICOPTER_STYLE,
  MARKER_STYLE,
  MOVEMENT_STYLE,
  QUIZ_TARGET_STYLE,
  ROTATION_STYLE,
  UI_COPY,
  WORLD_DEPTHS,
  WORLD_LAYOUT,
} from '../ui/styles.js';

const MARKER_TARGET_PADDING_PX = 6;
const COMMAND_ARRIVAL_RADIUS_PX = 4;

export default class HelicopterScene extends MapScene {
  constructor() {
    super('HelicopterScene');

    this.spawnPoint = new Phaser.Math.Vector2(
      WORLD_LAYOUT.WIDTH * 0.5,
      WORLD_LAYOUT.HEIGHT * 0.5,
    );
    this.helicopterPosition = new Phaser.Math.Vector2(
      this.spawnPoint.x,
      this.spawnPoint.y,
    );
    this.helicopter = null;
    this.cameraController = null;
    this.freeLookActive = false;
    this.manualCameraUntil = 0;
    this.cameraFollowPaused = false;

    // Quiz subsystems (initialised in create / createSceneSystems)
    this._quizController    = null;
    this._hoverDetector     = null;
    this._searchTimer       = null;
    this._targetVisualizer  = null;
    this._targetRevealEffect = null;
    this._quizHUD           = null;
    this._resultOverlay     = null;
    this._activeTargetPoint = null; // { x, y } projected world coords
    this._activeTarget      = null;
    this._activeTargetReveal = null; // resolved geometry/reveal for hit-test + reveal effect
    this._activeTargetGeometry = null; // projected geometry for hit detection + framing
    this._answerRevealActive = false;
    this._pendingAdvanceEvent = null;

    // Run state
    this._runEnded           = false;
    this._searchTimerDuration = 0;   // ms per target for current quiz set
    this._currentQuizSetId   = null; // saved for retry

    // Fixed framing (set when a quiz set with fixedFraming:true is loaded)
    this._fixedFramingActive = false;
    this._quizSetTargets     = null; // array of resolved target objects
    this._framingState       = null; // { scrollX, scrollY, zoom, centerX, centerY }

    this._audioManager       = null;
    this._bootstrapQuizSetData = undefined;
  }

  createWorldContent() {
    // Initialise quiz controller first so getHelicopterOptions() can read the
    // level speed before the helicopter is instantiated.
    this._initQuizController();

    // Compute fixed framing before MapScene.create() reads getMinZoom() /
    // getInitialCameraFocus(), so the camera is placed correctly from the start.
    if (this._fixedFramingActive && this._quizSetTargets?.length > 0) {
      this._framingState = this._computeFramingState(
        this.scale.width,
        this.scale.height,
      );
    }

    const spawnPoint = this.getSpawnPoint();
    this.spawnPoint.set(spawnPoint.x, spawnPoint.y);

    this.helicopter = this.registerWorldObject(
      this.instantiateHelicopter(this.spawnPoint.x, this.spawnPoint.y),
    );

    this.helicopter?.setDepth?.(HELICOPTER_STYLE.DEPTH ?? WORLD_DEPTHS.HELICOPTER);
    this.helicopter?.clearTarget?.();
    this.helicopter?.setCollideWorldBounds?.(true);
    this.helicopter?.body?.setCollideWorldBounds?.(true);
    this.helicopter?.body?.setAllowGravity?.(false);

    debugLog('QUIZ-INIT', 'Prepared helicopter world content', this.getDebugSceneSnapshot({
      quizSetId: this._currentQuizSetId,
      fixedFramingActive: this._fixedFramingActive,
      precomputedFraming: this._framingState,
      quizTargets: summarizeTargets(this._quizSetTargets),
      spawnPoint: {
        x: this.spawnPoint.x,
        y: this.spawnPoint.y,
      },
    }));
  }

  createSceneSystems() {
    if (this.physics?.world) {
      this.physics.world.setBounds(0, 0, WORLD_LAYOUT.WIDTH, WORLD_LAYOUT.HEIGHT);
    }

    this._audioManager = getAudioManager();
    this._audioManager.startRotorLoop();

    this.cameraController = this.instantiateCameraController();
    this.input.on('wheel', this.handleWheelInteraction, this);
    this.setCameraFollowPaused(false);

    this._startQuizSystems();

    // Fixed framing: permanently lock camera follow so the framing holds.
    // Also recompute and reapply the framing using the actual camera viewport
    // dimensions (camera.width / camera.height), which are authoritative once
    // Phaser's scene systems are fully live.  createWorldContent() called
    // _computeFramingState with scale.width / scale.height; those values can
    // differ from the camera's actual viewport at startup (e.g. when
    // devicePixelRatio != 1 or when the initial game-config dimensions have not
    // yet been reconciled with the live canvas size).  Reapplying here
    // guarantees that the scroll is computed from the same dimensions as the
    // zoom, preventing the wrong region from appearing on screen.
    if (this._fixedFramingActive) {
      this.setCameraFollowPaused(true);
      const cam = this.cameras.main;
      const framing = this._computeFramingState(cam.width, cam.height);
      if (framing) {
        this._framingState = framing;
        this._applyFixedFramingState(framing, 'startup-live-camera');
      } else {
        debugLog('FRAMING-COMPUTE', 'Live camera framing returned null during startup', this.getDebugSceneSnapshot({
          quizSetId: this._currentQuizSetId,
          liveCameraViewport: {
            width: cam.width,
            height: cam.height,
          },
          fixedFramingActive: this._fixedFramingActive,
          quizTargets: summarizeTargets(this._quizSetTargets),
        }));
      }
    }
  }

  destroySceneSystems() {
    debugLog('SCENE-DESTROY', 'Destroying helicopter scene systems', {
      quizSetId: this._currentQuizSetId,
      fixedFramingActive: this._fixedFramingActive,
      framingState: this._framingState,
      quizTargetCount: this._quizSetTargets?.length ?? 0,
    });

    this.input?.off('wheel', this.handleWheelInteraction, this);
    this.setCameraFollowPaused(false);
    this.cameraController?.destroy?.();
    this.cameraController = null;
    this.helicopter?.clearTarget?.();
    this.helicopter = null;
    this.freeLookActive = false;
    this.manualCameraUntil = 0;
    this._pendingAdvanceEvent?.remove?.(false);
    this._pendingAdvanceEvent = null;

    this._resultOverlay?.destroy();
    this._quizHUD?.destroy();
    this._targetRevealEffect?.destroy();
    this._targetVisualizer?.destroy();
    this._resultOverlay    = null;
    this._quizHUD          = null;
    this._targetRevealEffect = null;
    this._targetVisualizer = null;
    this._targetRevealEffect = null;
    this._hoverDetector    = null;
    this._searchTimer      = null;
    this._quizController   = null;
    this._activeTargetPoint = null;
    this._activeTarget = null;
    this._activeTargetReveal = null;
    this._activeTargetGeometry = null;
    this._answerRevealActive = false;
    this._pendingAdvanceEvent = null;

    this._runEnded            = false;
    this._searchTimerDuration = 0;
    this._currentQuizSetId    = null;

    this._fixedFramingActive = false;
    this._quizSetTargets     = null;
    this._framingState       = null;
    this._bootstrapQuizSetData = undefined;

    this._audioManager?.stopRotorLoop();
    this._audioManager = null;
  }

  getHelicopterOptions() {
    const baseSpeed = this._quizController?.level?.helicopterSpeed ?? MOVEMENT_STYLE.MAX_SPEED;

    return {
      depth: HELICOPTER_STYLE.DEPTH,
      style: {
        ...HELICOPTER_STYLE,
        depth: HELICOPTER_STYLE.DEPTH,
      },
      movement: {
        maxSpeed: baseSpeed,
        acceleration: MOVEMENT_STYLE.ACCELERATION,
        decelerationRadius: MOVEMENT_STYLE.DECELERATION_RADIUS,
        stopThreshold: MOVEMENT_STYLE.STOP_THRESHOLD,
      },
      rotation: {
        turnSpeed: ROTATION_STYLE.TURN_SPEED,
        velocityThreshold: ROTATION_STYLE.MIN_SPEED,
      },
      maxSpeed: baseSpeed,
      acceleration: MOVEMENT_STYLE.ACCELERATION,
      decelerationRadius: MOVEMENT_STYLE.DECELERATION_RADIUS,
      stopThreshold: MOVEMENT_STYLE.STOP_THRESHOLD,
      turnSpeed: ROTATION_STYLE.TURN_SPEED,
      velocityThreshold: ROTATION_STYLE.MIN_SPEED,
    };
  }

  getInputControllerOptions(baseOptions) {
    const opts = {
      ...baseOptions,
      onCommandDown: (worldX, worldY, pointer) =>
        this.handleCommandDown(worldX, worldY, pointer),
      onCommandMove: (worldX, worldY, pointer) =>
        this.handleCommandMove(worldX, worldY, pointer),
      onCommandUp: (pointer) => this.handleCommandUp(pointer),
      commandPredicate: (pointer, worldX, worldY) =>
        this.shouldHandleCommand(pointer, worldX, worldY),
      // When camera-follow is active, zoom around the screen centre (helicopter stays visible).
      // Only zoom around the mouse pointer when the user has entered free-look mode.
      getZoomAnchor: (mouseCanvasX, mouseCanvasY) => {
        if (this.freeLookActive) {
          return { x: mouseCanvasX, y: mouseCanvasY };
        }
        return {
          x: this.cameras.main.width * 0.5,
          y: this.cameras.main.height * 0.5,
        };
      },
    };

    if (this._fixedFramingActive && this._framingState) {
      const z = this._framingState.zoom;
      opts.zoomLocked = true;
      opts.dragLocked = true;
      opts.minZoom = z;
      opts.maxZoom = z;
    }

    return opts;
  }

  getOverlayText() {
    return UI_COPY.HELICOPTER_CONTROLS ?? super.getOverlayText();
  }

  getProjectionOptions() {
    const bootstrapQuizSetData = this._resolveBootstrapQuizSetData();
    const projectionConfig = bootstrapQuizSetData?.quizSet?.projection;

    if (projectionConfig && typeof projectionConfig === 'object') {
      return {
        ...super.getProjectionOptions(),
        ...projectionConfig,
      };
    }

    return super.getProjectionOptions();
  }

  getInitialCameraFocus() {
    if (this._fixedFramingActive && this._framingState) {
      return { x: this._framingState.centerX, y: this._framingState.centerY };
    }

    return this.readPointInto(
      this.helicopter?.getPosition?.(),
      this.helicopterPosition,
      this.spawnPoint,
    );
  }

  getMinZoom() {
    if (this._fixedFramingActive && this._framingState) {
      return this._framingState.zoom;
    }

    return Math.max(
      this.scale.width / WORLD_LAYOUT.WIDTH,
      this.scale.height / WORLD_LAYOUT.HEIGHT,
    );
  }

  getSpawnPoint() {
    if (this._fixedFramingActive && this._framingState) {
      return {
        x: this._framingState.centerX,
        y: this._framingState.centerY,
      };
    }

    return this.getMarkerCentroid() ?? super.getInitialCameraFocus();
  }

  handleCommandDown(worldX, worldY) {
    this._audioManager?.unlock();

    if (this._runEnded || this._answerRevealActive) {
      return;
    }

    if (!this._fixedFramingActive) {
      this.resumeCameraFollow();
    }
    this.setHelicopterTarget(worldX, worldY);
  }

  handleCommandMove(worldX, worldY) {
    if (this._runEnded || this._answerRevealActive) {
      return;
    }

    this.setHelicopterTarget(worldX, worldY);
  }

  handleCommandUp(pointer) {
    void pointer;
  }

  shouldHandleCommand(pointer, worldX, worldY) {
    if (this._runEnded || this._answerRevealActive) return false;

    if (!this.isWorldPointWithinBounds(worldX, worldY)) {
      return false;
    }

    if (pointer.pointerType === 'touch') {
      return this.getActiveTouchCount() < 2;
    }

    return this.isPrimaryCommandPointer(pointer);
  }

  getActiveTouchCount() {
    const pointers = this.input.manager?.pointers ?? this.input.pointers ?? [];

    return pointers.filter(
      (pointer) => pointer.isDown && pointer.pointerType === 'touch',
    ).length;
  }

  isPrimaryCommandPointer(pointer) {
    const leftButtonDown =
      typeof pointer.leftButtonDown === 'function'
        ? pointer.leftButtonDown()
        : pointer.button === 0;
    const secondaryButtonDown =
      (typeof pointer.rightButtonDown === 'function' &&
        pointer.rightButtonDown()) ||
      (typeof pointer.middleButtonDown === 'function' &&
        pointer.middleButtonDown());

    return leftButtonDown && !secondaryButtonDown;
  }

  setHelicopterTarget(worldX, worldY) {
    if (this._runEnded || this._answerRevealActive) {
      return;
    }

    if (!this.helicopter?.setTarget) {
      return;
    }

    const target = this.clampWorldPoint(worldX, worldY);

    // Only snap to the active quiz target — background city markers must not redirect
    // clicks, as their snap radius (in world units) is too large at low zoom and causes
    // the helicopter to fly to an unintended city instead of the clicked position.
    const quizTarget = this._getQuizSnapTarget(target.x, target.y);
    if (quizTarget) {
      this.helicopter.setTarget(quizTarget.x, quizTarget.y, {
        stopThreshold: this.getPreciseArrivalThreshold(),
        snapOnArrival: true,
      });
      return;
    }

    this.helicopter.setTarget(target.x, target.y, {
      stopThreshold: this.getPreciseArrivalThreshold(),
      snapOnArrival: true,
    });
  }

  _getQuizSnapTarget(worldX, worldY) {
    if (!this._activeTargetPoint) {
      return null;
    }

    const hitRadius = this.getMarkerTargetRadius();
    const dx = this._activeTargetPoint.x - worldX;
    const dy = this._activeTargetPoint.y - worldY;

    return dx * dx + dy * dy <= hitRadius * hitRadius ? this._activeTargetPoint : null;
  }

  getMarkerTargetRadius() {
    const markerRadius =
      (MARKER_STYLE.RADIUS ?? 0) +
      (MARKER_STYLE.STROKE_WIDTH ?? 0) * 0.5 +
      MARKER_TARGET_PADDING_PX;

    return markerRadius / this.getCameraZoom();
  }

  getPreciseArrivalThreshold() {
    return Math.min(
      MOVEMENT_STYLE.STOP_THRESHOLD,
      COMMAND_ARRIVAL_RADIUS_PX / this.getCameraZoom(),
    );
  }

  getCameraZoom() {
    return Math.max(this.cameras.main?.zoom ?? 1, 0.0001);
  }

  getTargetScreenRadius() {
    const configuredRadius = this._quizController?.level?.targetScreenRadius;
    return Number.isFinite(configuredRadius)
      ? Math.max(configuredRadius, 1)
      : QUIZ_TARGET_STYLE.SCREEN_RADIUS;
  }

  getTargetHitRadius() {
    return this.getTargetScreenRadius() / this.getCameraZoom();
  }

  getHelicopterScreenWidth() {
    const configuredWidth = this._quizController?.level?.helicopterScreenWidth;
    return Number.isFinite(configuredWidth)
      ? Math.max(configuredWidth, 1)
      : HELICOPTER_STYLE.SCREEN_WIDTH;
  }

  getRevealDurationMs() {
    const configuredDuration = this._quizController?.level?.revealDurationMs;
    return Number.isFinite(configuredDuration)
      ? Math.max(configuredDuration, 1)
      : QUIZ_TARGET_STYLE.REVEAL_DURATION_MS;
  }

  _getDatasets() {
    return {
      worldGeoJson: this.cache?.json?.get(DATA_CACHE_KEYS.WORLD_GEOJSON),
      lakesGeoJson: this.cache?.json?.get(DATA_CACHE_KEYS.WORLD_MAJOR_LAKES),
      riversGeoJson: this.cache?.json?.get(DATA_CACHE_KEYS.WORLD_MAJOR_RIVERS),
    };
  }

  resolveTargetReveal(target = this._activeTarget) {
    return resolveTargetRevealGeometry(target, this._getDatasets());
  }

  resolveProjectedTargetGeometry(target = this._activeTarget) {
    return resolveProjectedTargetGeometry(
      target,
      (lat, lon) => this.projectLatLon(lat, lon),
      this._getDatasets(),
    );
  }

  instantiateHelicopter(x, y) {
    const options = this.getHelicopterOptions();
    const attempts =
      Helicopter.length >= 3
        ? [
            () => new Helicopter(this, x, y, options),
            () => new Helicopter(this, { x, y, ...options }),
            () => new Helicopter({ scene: this, x, y, ...options }),
          ]
        : Helicopter.length === 2
          ? [
              () => new Helicopter(this, { x, y, ...options }),
              () => new Helicopter(this, x, y, options),
              () => new Helicopter({ scene: this, x, y, ...options }),
            ]
          : [
              () => new Helicopter({ scene: this, x, y, ...options }),
              () => new Helicopter(this, { x, y, ...options }),
              () => new Helicopter(this, x, y, options),
            ];

    for (const attempt of attempts) {
      try {
        const helicopter = attempt();

        if (this.isUsableHelicopter(helicopter)) {
          return helicopter;
        }
      } catch (error) {
        void error;
      }
    }

    throw new Error('Unable to instantiate Helicopter');
  }

  isUsableHelicopter(helicopter) {
    return Boolean(
      helicopter &&
        (!('scene' in helicopter) || helicopter.scene === this) &&
        typeof helicopter.setTarget === 'function' &&
        typeof helicopter.update === 'function' &&
        typeof helicopter.getPosition === 'function' &&
        typeof helicopter.getVelocity === 'function',
    );
  }

  instantiateCameraController() {
    const options = this.getCameraControllerOptions();
    const attempts = [
      () => new CameraController(this.cameras.main, this.helicopter, options),
      () => new CameraController(this, options),
      () => new CameraController({ scene: this, ...options }),
    ];

    for (const attempt of attempts) {
      try {
        const controller = attempt();

        if (this.isUsableCameraController(controller)) {
          return controller;
        }
      } catch (error) {
        void error;
      }
    }

    return null;
  }

  isUsableCameraController(controller) {
    if (!controller) {
      return false;
    }

    if ('camera' in controller && controller.camera && controller.camera !== this.cameras.main) {
      return false;
    }

    if ('scene' in controller && controller.scene && controller.scene !== this) {
      return false;
    }

    if ('target' in controller && controller.target && controller.target !== this.helicopter) {
      return false;
    }

    return (
      typeof controller.update === 'function' ||
      typeof controller.destroy === 'function' ||
      typeof controller.pause === 'function' ||
      typeof controller.resume === 'function' ||
      typeof controller.setPaused === 'function'
    );
  }

  getCameraControllerOptions() {
    return {
      scene: this,
      camera: this.cameras.main,
      target: this.helicopter,
      followTarget: this.helicopter,
      worldWidth: WORLD_LAYOUT.WIDTH,
      worldHeight: WORLD_LAYOUT.HEIGHT,
      bounds: {
        width: WORLD_LAYOUT.WIDTH,
        height: WORLD_LAYOUT.HEIGHT,
      },
      followLag: CAMERA_FOLLOW.FOLLOW_LAG,
      followLerp: CAMERA_FOLLOW.FOLLOW_LERP,
      lerp: CAMERA_FOLLOW.FOLLOW_LERP,
      xLerp: CAMERA_FOLLOW.FOLLOW_LERP,
      yLerp: CAMERA_FOLLOW.FOLLOW_LERP,
      deadzoneWidth: CAMERA_FOLLOW.DEADZONE_WIDTH,
      deadzoneHeight: CAMERA_FOLLOW.DEADZONE_HEIGHT,
      getTargetPosition: () =>
        this.readPointInto(
          this.helicopter?.getPosition?.(),
          this.helicopterPosition,
          this.spawnPoint,
        ),
    };
  }

  handleWheelInteraction() {
    // Only pause camera-follow when already in free-look mode.  Applying a grace period
    // unconditionally caused the helicopter to fly off-screen whenever the user zoomed
    // in while it was mid-flight (camera detached, helicopter kept moving).
    if (this.freeLookActive) {
      this.manualCameraUntil = Math.max(
        this.manualCameraUntil,
        this.time.now + CAMERA_FOLLOW.ZOOM_GRACE_MS,
      );
    }
  }

  /**
   * Apply a precomputed framing state directly to the camera and input
   * controller.
   *
   * When `fitMode` is `'cover'` the viewport is portrait relative to the map:
   * re-enable camera follow so the helicopter stays visible while the zoom is
   * locked and drag is allowed for manual panning.  In all other modes (width /
   * contain) the camera is locked in place so the full map is always visible.
   */
  _applyFixedFramingState(framing, reason = 'manual') {
    if (!framing) return;

    const beforeCamera = describeCameraView(this.cameras.main, this.projection);
    const z = framing.zoom;
    this.cameras.main.setZoom(z);
    const cameraScroll = Number.isFinite(framing.cameraScrollX) && Number.isFinite(framing.cameraScrollY)
      ? { x: framing.cameraScrollX, y: framing.cameraScrollY }
      : getCameraScrollForWorldCenter(
        this.cameras.main,
        framing.centerX,
        framing.centerY,
      );
    setCameraScroll(this.cameras.main, cameraScroll.x, cameraScroll.y);
    this.inputController?.setZoomLimits(z, z);
    this.inputController?.clampCamera?.();
    this.baseMapMinZoom = z;

    // Portrait (cover) mode: follow the helicopter so it is always on screen.
    // Landscape (width/contain) mode: lock the camera so the full map is visible.
    if (framing.fitMode === 'cover') {
      this.setCameraFollowPaused?.(false);
      this.inputController?.setDragLocked?.(false);
    } else {
      this.setCameraFollowPaused?.(true);
      this.inputController?.setDragLocked?.(true);
    }

    debugLog('FRAMING-APPLY', `Applied fixed framing (${reason})`, this.getDebugSceneSnapshot({
      quizSetId: this._currentQuizSetId,
      fixedFramingActive: this._fixedFramingActive,
      beforeCamera,
      framing,
    }));
  }

  // Recompute fixed framing on viewport resize so all targets stay visible.
  handleResize(gameSize) {
    const beforeResizeCamera = describeCameraView(this.cameras.main, this.projection);

    if (this._fixedFramingActive && this._quizSetTargets?.length > 0) {
      this._framingState = this._computeFramingState(gameSize.width, gameSize.height);
    }

    super.handleResize?.(gameSize);

    if (this._fixedFramingActive && this._framingState) {
      this._applyFixedFramingState(this._framingState, 'resize');
    }

    debugLog('FRAMING-RESIZE', 'Handled helicopter scene resize', this.getDebugSceneSnapshot({
      quizSetId: this._currentQuizSetId,
      beforeResizeCamera,
      gameSize: {
        width: gameSize.width,
        height: gameSize.height,
      },
      recomputedFraming: this._framingState,
    }));
  }

  layoutOverlay() {
    super.layoutOverlay?.();
    this._quizHUD?.layout();
    this._resultOverlay?.layout();
  }

  // ── Quiz subsystem initialisation ─────────────────────────────────────────

  _resolveStartLevelId() {
    try {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('level');
      if (id) return id;
    } catch (_) { /* non-browser env */ }
    return null;
  }

  _resolveStartQuizSetId() {
    try {
      // Scene data passed via this.scene.start('HelicopterScene', { quizSetId })
      const sysData = this.sys?.settings?.data;
      const sceneData = this.scene?.settings?.data;
      const data = sysData ?? sceneData;
      if (data?.quizSetId) {
        debugLog('QUIZ-INIT', 'Resolved quiz set id from scene data', {
          sysData,
          sceneData,
          resolvedQuizSetId: data.quizSetId,
        });
        return data.quizSetId;
      }

      // URL param fallback for direct deep-linking
      const params = new URLSearchParams(window.location.search);
      const id = params.get('quizset');
      if (id) {
        debugLog('QUIZ-INIT', 'Resolved quiz set id from URL parameter', {
          sysData,
          sceneData,
          resolvedQuizSetId: id,
        });
        return id;
      }
    } catch (_) { /* non-browser env */ }
    return null;
  }

  _resolveQuizSet(quizSetId) {
    const quizSetsData = this.cache?.json?.get(DATA_CACHE_KEYS.QUIZ_SETS) ?? null;
    if (!quizSetsData) return null;
    return (quizSetsData.sets ?? []).find((s) => s.id === quizSetId) ?? null;
  }

  _resolveBootstrapQuizSetData() {
    if (this._bootstrapQuizSetData !== undefined) {
      return this._bootstrapQuizSetData;
    }

    const quizSetId = this._resolveStartQuizSetId();

    if (!quizSetId) {
      this._bootstrapQuizSetData = null;
      return this._bootstrapQuizSetData;
    }

    const quizSet = this._resolveQuizSet(quizSetId);
    const targetsData = this.cache?.json?.get(DATA_CACHE_KEYS.QUIZ_TARGETS) ?? null;

    if (!quizSet || !targetsData) {
      this._bootstrapQuizSetData = null;
      return this._bootstrapQuizSetData;
    }

    this._bootstrapQuizSetData = {
      quizSetId,
      quizSet,
      levelConfig: this._buildLevelFromQuizSet(quizSet, targetsData),
    };

    return this._bootstrapQuizSetData;
  }

  _getProjectionFramingBounds() {
    const projectionConfig = this._resolveBootstrapQuizSetData()?.quizSet?.projection;

    if (!projectionConfig?.bounds || !this.projection) {
      return null;
    }

    const minX = this.projection.offsetX;
    const minY = this.projection.offsetY;
    const maxX = minX + this.projection.mapWidth;
    const maxY = minY + this.projection.mapHeight;

    return {
      minX,
      maxX,
      minY,
      maxY,
      centerX: (minX + maxX) * 0.5,
      centerY: (minY + maxY) * 0.5,
    };
  }

  /**
   * Build a level-compatible config object from a quiz-set definition, with
   * all `targets` IDs resolved to full target objects.
   */
  _buildLevelFromQuizSet(quizSet, targetsData) {
    const allTargets = Object.entries(targetsData).flatMap(([cat, items]) =>
      Array.isArray(items) ? items.map((t) => ({ ...t, category: cat })) : [],
    );
    const targetMap = new Map(allTargets.map((t) => [t.id, t]));
    const requestedIds = quizSet.targets ?? [];
    const fixedTargets = (quizSet.targets ?? [])
      .map((id) => targetMap.get(id))
      .filter(Boolean);

    debugLog('QUIZ-INIT', 'Built level config from quiz set targets', {
      quizSetId: quizSet.id ?? null,
      requestedIds,
      missingIds: requestedIds.filter((id) => !targetMap.has(id)),
      targetSummary: summarizeTargets(fixedTargets),
    });

    return {
      id: quizSet.id,
      name: quizSet.name,
      description: quizSet.description ?? '',
      hoverTime: quizSet.hoverTime ?? 3000,
      helicopterSpeed: quizSet.helicopterSpeed ?? 300,
      targetRadius: quizSet.targetRadius ?? 60,
      targetScreenRadius:
        Number.isFinite(quizSet.targetScreenRadius)
          ? Math.max(quizSet.targetScreenRadius, 1)
          : QUIZ_TARGET_STYLE.SCREEN_RADIUS,
      helicopterScreenWidth:
        Number.isFinite(quizSet.helicopterScreenWidth)
          ? Math.max(quizSet.helicopterScreenWidth, 1)
          : HELICOPTER_STYLE.SCREEN_WIDTH,
      revealDurationMs:
        Number.isFinite(quizSet.revealDurationMs)
          ? Math.max(quizSet.revealDurationMs, 1)
          : QUIZ_TARGET_STYLE.REVEAL_DURATION_MS,
      searchTime: quizSet.searchTime ?? 60,
      fixedTargets,
      fixedFraming: Boolean(quizSet.fixedFraming),
      framingPaddingFactor: quizSet.framingPaddingFactor ?? 0.15,
      projection: quizSet.projection ?? null,
    };
  }

  /** Compute framing state for the given viewport dimensions. */
  _computeFramingState(viewWidth, viewHeight) {
    if (!this._quizSetTargets?.length) return null;

    const level = this._quizController?.level;
    const projectionFramingBounds = this._getProjectionFramingBounds();
    const paddingFactor = projectionFramingBounds
      ? 0
      : level?.framingPaddingFactor ?? 0.15;
    const datasets = this._getDatasets();
    const projectFn = (lat, lon) => this.projectLatLon(lat, lon);
    const projectedTargets = summarizeProjectedTargets(
      this._quizSetTargets,
      projectFn,
    );
    const targetBounds = projectionFramingBounds ?? computeProjectedTargetBounds(
      this._quizSetTargets,
      projectFn,
      datasets,
    );
    const framingFitMode = projectionFramingBounds
      ? (() => {
          const mapW = projectionFramingBounds.maxX - projectionFramingBounds.minX;
          const mapH = Math.max(projectionFramingBounds.maxY - projectionFramingBounds.minY, 1);
          const viewAspect = viewWidth / Math.max(viewHeight, 1);
          // Portrait viewport relative to the map's aspect ratio → cover (fill height).
          // Landscape viewport → width-fit (fill width, current landscape behaviour).
          return viewAspect < mapW / mapH ? 'cover' : 'width';
        })()
      : 'contain';
    const framing = computeFixedFramingFromBounds(
      targetBounds,
      viewWidth,
      viewHeight,
      paddingFactor,
      Infinity,
      framingFitMode,
    );

    debugLog('FRAMING-COMPUTE', 'Computed fixed framing state', {
      quizSetId: this._currentQuizSetId,
      viewWidth,
      viewHeight,
      paddingFactor,
      targetSummary: summarizeTargets(this._quizSetTargets),
      projectedTargets,
      projectionFramingBounds,
      targetBounds,
      framingFitMode,
      framing,
    });

    return framing ? { ...framing, fitMode: framingFitMode } : null;
  }

  _initQuizController() {
    const targetsData = this.cache?.json?.get(DATA_CACHE_KEYS.QUIZ_TARGETS) ?? null;
    const levelsData  = this.cache?.json?.get(DATA_CACHE_KEYS.QUIZ_LEVELS)  ?? null;

    if (!targetsData || !levelsData) return;

    this._quizController = new QuizController(targetsData, levelsData, {
      onTargetChange: (target, progress) => this._onQuizTargetChange(target, progress),
      onScoreUpdate:  (progress)         => this._onQuizScoreUpdate(progress),
      onComplete:     (progress)         => this._onQuizComplete(progress),
    });

    // Check for a curated quiz set selected from QuizSelectionScene
    const bootstrapQuizSetData = this._resolveBootstrapQuizSetData();
    if (bootstrapQuizSetData?.quizSet && bootstrapQuizSetData.levelConfig) {
      const { quizSetId, quizSet, levelConfig } = bootstrapQuizSetData;
      this._quizController.level = levelConfig;
      this._currentQuizSetId     = quizSetId;

      if (quizSet.fixedFraming) {
        this._fixedFramingActive = true;
        this._quizSetTargets = levelConfig.fixedTargets;
      }

      debugLog('QUIZ-INIT', 'Resolved curated quiz set for helicopter scene', {
        sceneData: this.sys?.settings?.data ?? null,
        quizSet: {
          id: quizSet.id ?? null,
          name: quizSet.name ?? null,
          fixedFraming: Boolean(quizSet.fixedFraming),
          searchTime: quizSet.searchTime ?? null,
          hoverTime: quizSet.hoverTime ?? null,
          helicopterSpeed: quizSet.helicopterSpeed ?? null,
          framingPaddingFactor: quizSet.framingPaddingFactor ?? null,
          projection: quizSet.projection ?? null,
        },
        levelConfig: {
          id: levelConfig.id ?? null,
          name: levelConfig.name ?? null,
          searchTime: levelConfig.searchTime ?? null,
          hoverTime: levelConfig.hoverTime ?? null,
          helicopterSpeed: levelConfig.helicopterSpeed ?? null,
          targetRadius: levelConfig.targetRadius ?? null,
        },
        targetSummary: summarizeTargets(levelConfig.fixedTargets),
      });
      return;
    }

    // Fall back to URL-based level selection
    const levelId = this._resolveStartLevelId();
    this._quizController.level = this._quizController.resolveLevel(levelId);

    debugLog('QUIZ-INIT', 'Resolved fallback level for helicopter scene', {
      requestedLevelId: levelId,
      resolvedLevel: {
        id: this._quizController.level?.id ?? null,
        name: this._quizController.level?.name ?? null,
      },
    });
  }

  _startQuizSystems() {
    if (!this._quizController) return;

    const level = this._quizController.level;

    // Per-target search timer (seconds from level config, converted to ms)
    const searchTimeSecs = level?.searchTime ?? 60;
    this._searchTimerDuration = searchTimeSecs * 1000;

    this._searchTimer = new SearchTimer({
      onExpire: () => this._endRunLoss(),
    });

    // Hover detector
    this._hoverDetector = new HoverDetector({
      hoverTime:  level?.hoverTime ?? 2000,
      onProgress: (progress) => {
        this._quizHUD?.updateHoverProgress(progress);
      },
      onComplete: () => this._handleTargetFound(),
    });

    // World-space target ring
    this._targetVisualizer = new TargetVisualizer(this);
    this._targetRevealEffect = new TargetRevealEffect(this);

    // UI overlays
    this._quizHUD       = new QuizHUD(this);
    this._resultOverlay = new ResultOverlay(this);

    // Start the quiz (fires onTargetChange → _onQuizTargetChange)
    this._quizController.start(level);

    debugLog('QUIZ-START', 'Started quiz systems', {
      quizSetId: this._currentQuizSetId,
      fixedFramingActive: this._fixedFramingActive,
      level: {
        id: level?.id ?? null,
        name: level?.name ?? null,
        searchTime: level?.searchTime ?? null,
        hoverTime: level?.hoverTime ?? null,
        helicopterSpeed: level?.helicopterSpeed ?? null,
        targetRadius: level?.targetRadius ?? null,
      },
      targetSummary: summarizeTargets(level?.fixedTargets),
    });
  }

  // ── Quiz callbacks ────────────────────────────────────────────────────────

  _onQuizTargetChange(target, progress) {
    if (!target) return;

    this._pendingAdvanceEvent?.remove?.(false);
    this._pendingAdvanceEvent = null;
    this._answerRevealActive = false;
    this._activeTarget = target;
    this._targetRevealEffect?.clear();
    const pt = this.projectLatLon(target.lat, target.lon);
    this._activeTargetPoint = pt ?? null;

    const datasets = this._getDatasets();
    // Resolve geometry once per target; reused for hit detection, framing, and reveal effect.
    this._activeTargetReveal = resolveTargetRevealGeometry(target, datasets);
    this._activeTargetGeometry = resolveProjectedTargetGeometry(
      target,
      (lat, lon) => this.projectLatLon(lat, lon),
      datasets,
    );

    if (pt) {
      this._targetVisualizer?.showTarget(
        pt.x,
        pt.y,
        this.getTargetScreenRadius(),
      );
    } else {
      this._targetVisualizer?.hideTarget();
    }

    this._hoverDetector?.reset();

    // Restart the per-target search timer
    if (this._searchTimerDuration > 0) {
      this._searchTimer?.start(this._searchTimerDuration);
    }

    const levelName = this._quizController?.level?.name ?? '';
    this._quizHUD?.showTarget(target.name, levelName, progress);

    debugLog('QUIZ-TARGET', 'Activated quiz target', this.getDebugSceneSnapshot({
      quizSetId: this._currentQuizSetId,
      target: {
        id: target.id ?? null,
        name: target.name ?? null,
        category: target.category ?? null,
        lat: target.lat ?? null,
        lon: target.lon ?? null,
      },
      projectedTargetPoint: pt,
      revealKind: this._activeTargetReveal?.kind ?? null,
      geometryKind: this._activeTargetGeometry?.kind ?? null,
      geometryBounds: this._activeTargetGeometry?.bounds ?? null,
      progress,
      levelName,
    }));
  }

  _handleTargetFound() {
    if (this._runEnded || this._answerRevealActive || !this._activeTarget) {
      return;
    }

    this._answerRevealActive = true;
    this._audioManager?.playFoundSound();
    this._hoverDetector?.reset();
    this._searchTimer?.stop();
    this._targetVisualizer?.hideTarget();
    this._stopGameplayInput();

    if (this._activeTargetPoint) {
      // Reuse pre-resolved geometry (cached in _onQuizTargetChange); fall back to
      // re-resolving only if somehow not set yet.
      const reveal = this._activeTargetReveal ?? this.resolveTargetReveal(this._activeTarget);
      this._targetRevealEffect?.playReveal(reveal, this._activeTargetPoint, {
        durationMs: this.getRevealDurationMs(),
      });
    }

    const advance = () => {
      this._pendingAdvanceEvent = null;
      this._answerRevealActive = false;
      this._targetRevealEffect?.clear();
      this._quizController?.advance();
    };

    if (typeof this.time?.delayedCall === 'function') {
      this._pendingAdvanceEvent = this.time.delayedCall(
        this.getRevealDurationMs(),
        advance,
      );
      return;
    }

    advance();
  }

  _onQuizScoreUpdate(progress) {
    // HUD will refresh on next onTargetChange; nothing extra needed here.
    void progress;
  }

  _onQuizComplete(progress) {
    if (this._runEnded) return;
    this._runEnded = true;
    this._pendingAdvanceEvent?.remove?.(false);
    this._pendingAdvanceEvent = null;
    this._answerRevealActive = false;

    this._audioManager?.playWinSound();

    this._stopGameplayInput();
    this._searchTimer?.stop();
    this._targetVisualizer?.hideTarget();
    this._targetRevealEffect?.clear();
    this._quizHUD?.hideTimer();
    this._quizHUD?.showComplete(progress.score, progress.total);
    this._hoverDetector = null;

    this._showResult(true, progress.score, progress.total);
  }

  /** Called by the SearchTimer when time runs out for the current target. */
  _endRunLoss() {
    if (this._runEnded) return;
    this._runEnded = true;
    this._pendingAdvanceEvent?.remove?.(false);
    this._pendingAdvanceEvent = null;
    this._answerRevealActive = false;

    this._audioManager?.playLossSound();

    this._stopGameplayInput();
    this._hoverDetector = null;
    this._searchTimer?.stop();
    this._targetVisualizer?.hideTarget();
    this._targetRevealEffect?.clear();
    this._quizHUD?.hideTimer();
    this._quizHUD?.hide();

    const progress = this._quizController?.getProgress() ?? { score: 0, total: 0 };
    this._showResult(false, progress.score, progress.total);
  }

  _showResult(won, score, total) {
    this._resultOverlay?.show({
      won,
      score,
      total,
      onRetry: () => {
        if (this._currentQuizSetId) {
          this.scene.restart({ quizSetId: this._currentQuizSetId });
        } else {
          this.scene.restart();
        }
      },
      onChoose: () => {
        this.scene.start('QuizSelectionScene');
      },
    });
  }

  _stopGameplayInput() {
    this.helicopter?.clearTarget?.();
    this.inputController?.endCommand?.(null, false);
    this.inputController?.endDrag?.();
    this.inputController?.endPinch?.();
  }

  enterFreeLook() {
    if (this.freeLookActive) {
      return;
    }

    this.freeLookActive = true;
    this.manualCameraUntil = this.time.now + CAMERA_FOLLOW.INPUT_GRACE_MS;
    this.setCameraFollowPaused(true);
  }

  resumeCameraFollow() {
    this.freeLookActive = false;
    this.manualCameraUntil = 0;
    this.setCameraFollowPaused(false);
  }

  setCameraFollowPaused(paused) {
    if (this.cameraFollowPaused === paused) {
      return;
    }

    this.cameraFollowPaused = paused;
    this.cameraController?.setPaused?.(paused);
    this.cameraController?.setEnabled?.(!paused);

    if (paused) {
      this.cameraController?.pause?.();
      return;
    }

    this.cameraController?.resume?.();
  }

  isManualCameraActive(now) {
    // Fixed framing: camera never follows or drifts; always treated as manual.
    if (this._fixedFramingActive) {
      return true;
    }

    const cameraGestureActive = Boolean(
      this.inputController?.dragging || this.inputController?.pinching,
    );
    const steeringActive = Boolean(
      this.inputController?.isCommandSteeringActive?.() ??
        this.inputController?.commandSteering,
    );

    if (cameraGestureActive) {
      this.enterFreeLook();
      // Continuously push the resume deadline forward while a gesture is live
      this.manualCameraUntil = now + CAMERA_FOLLOW.INPUT_GRACE_MS;
    } else if (this.freeLookActive && !steeringActive && now >= this.manualCameraUntil) {
      // Grace period elapsed with no active gesture — resume camera follow
      this.resumeCameraFollow();
    }

    return (
      this.freeLookActive ||
      cameraGestureActive ||
      steeringActive ||
      now < this.manualCameraUntil
    );
  }

  syncZoomResponsiveElements() {
    super.syncZoomResponsiveElements();
    this.syncHelicopterScale();
  }

  syncHelicopterScale() {
    if (!this.helicopter) {
      return;
    }

    const zoom = Math.max(this.cameras.main.zoom, 0.0001);
    const baseDisplaySize = this.helicopter.getBaseDisplaySize?.() ?? {
      width: this.helicopter.displayWidth ?? HELICOPTER_STYLE.SCREEN_WIDTH,
      height: this.helicopter.displayHeight ?? HELICOPTER_STYLE.SCREEN_WIDTH,
    };
    const baseWidth = Math.max(baseDisplaySize.width || 0, 1);
    const scale = Phaser.Math.Clamp(
      this.getHelicopterScreenWidth() / (baseWidth * zoom),
      HELICOPTER_STYLE.MIN_SCALE,
      HELICOPTER_STYLE.MAX_SCALE,
    );

    if (typeof this.helicopter.setVisualScale === 'function') {
      this.helicopter.setVisualScale(scale);
    } else {
      this.helicopter.setScale?.(scale);
    }
    // Do NOT call refreshBody / updateFromGameObject here: refreshBody resets the
    // physics body velocity (body.stop()), which would kill helicopter movement on
    // every zoom event.  The hitbox was explicitly sized at construction time and
    // does not need resyncing when only the visual scale changes.
  }

  readPointInto(point, targetVector, fallbackPoint = this.spawnPoint) {
    const candidate = point ?? fallbackPoint;
    const fallback = fallbackPoint ?? super.getInitialCameraFocus();
    const x = Array.isArray(candidate) ? candidate[0] : candidate?.x;
    const y = Array.isArray(candidate) ? candidate[1] : candidate?.y;

    if (this.isWorldPointWithinBounds(x, y)) {
      targetVector.set(x, y);
      return targetVector;
    }

    const fallbackX = Array.isArray(fallback) ? fallback[0] : fallback?.x;
    const fallbackY = Array.isArray(fallback) ? fallback[1] : fallback?.y;
    const clampedFallback = this.clampWorldPoint(fallbackX, fallbackY);
    targetVector.set(clampedFallback.x, clampedFallback.y);

    return targetVector;
  }

  updateScene(time, delta) {
    const now = Number.isFinite(time) ? time : this.time.now;
    const manualCameraActive = this.isManualCameraActive(now);

    this.setCameraFollowPaused(manualCameraActive);
    this.helicopter?.update?.(delta);
    this._updateRotorAudio();

    if (!manualCameraActive) {
      this.cameraController?.update?.(delta);
    }

    this._updateQuiz(delta);
  }

  _updateRotorAudio() {
    if (!this._audioManager) return;
    const vel = this.helicopter?.getVelocity?.();
    const vx = Array.isArray(vel) ? vel[0] : (vel?.x ?? 0);
    const vy = Array.isArray(vel) ? vel[1] : (vel?.y ?? 0);
    const speed = Math.hypot(vx, vy);
    const maxSpeed = this._quizController?.level?.helicopterSpeed ?? MOVEMENT_STYLE.MAX_SPEED;
    const profile = interpolateRotorProfile(speed, maxSpeed);
    this._audioManager.setRotorProfile(profile);
  }

  _updateQuiz(delta) {
    this._targetRevealEffect?.update(delta);

    if (this._answerRevealActive) {
      return;
    }

    // Tick the search timer even when the hover detector is idle
    if (this._searchTimer?.isRunning) {
      this._searchTimer.update(delta);
      if (this._searchTimer.isRunning) {
        this._quizHUD?.showTimer(this._searchTimer.getRemaining());
      }
    }

    if (!this._hoverDetector || !this._activeTargetPoint) return;

    const pos = this.helicopter?.getPosition?.();
    if (!pos) return;

    const heliX = Array.isArray(pos) ? pos[0] : pos.x;
    const heliY = Array.isArray(pos) ? pos[1] : pos.y;
    if (!Number.isFinite(heliX) || !Number.isFinite(heliY)) return;

    const targetGeometry = this._activeTargetGeometry;
    const isInZoneFn = targetGeometry
      ? (x, y) => containsProjectedPoint(targetGeometry, x, y, this.getCameraZoom())
      : null;
    const radius = targetGeometry ? 0 : this.getTargetHitRadius();

    const result = this._hoverDetector.update(
      delta,
      heliX,
      heliY,
      this._activeTargetPoint.x,
      this._activeTargetPoint.y,
      radius,
      isInZoneFn,
    );

    // Drive the pulse animation even when not hovering
    if (this._targetVisualizer && !result.complete) {
      this._targetVisualizer.updateProgress(result.progress, delta, result.hovering);
    }
  }
}
