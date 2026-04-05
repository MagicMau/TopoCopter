import Phaser from 'phaser';
import CameraController from '../core/CameraController.js';
import Helicopter from '../entities/Helicopter.js';
import MapScene from './MapScene.js';
import QuizController from '../quiz/QuizController.js';
import HoverDetector from '../quiz/HoverDetector.js';
import SearchTimer from '../quiz/SearchTimer.js';
import TargetVisualizer from '../quiz/TargetVisualizer.js';
import QuizHUD from '../ui/QuizHUD.js';
import ResultOverlay from '../ui/ResultOverlay.js';
import { DATA_CACHE_KEYS } from './PreloadScene.js';
import { computeFixedFraming } from '../core/quizFraming.js';
import {
  CAMERA_FOLLOW,
  HELICOPTER_STYLE,
  MARKER_STYLE,
  MOVEMENT_STYLE,
  ROTATION_STYLE,
  UI_COPY,
  WORLD_DEPTHS,
  WORLD_LAYOUT,
} from '../ui/styles.js';

const MARKER_TARGET_PADDING_PX = 6;
const MARKER_ARRIVAL_RADIUS_PX = 3;

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
    this._quizHUD           = null;
    this._resultOverlay     = null;
    this._activeTargetPoint = null; // { x, y } projected world coords

    // Run state
    this._runEnded           = false;
    this._searchTimerDuration = 0;   // ms per target for current quiz set
    this._currentQuizSetId   = null; // saved for retry

    // Fixed framing (set when a quiz set with fixedFraming:true is loaded)
    this._fixedFramingActive = false;
    this._quizSetTargets     = null; // array of resolved target objects
    this._framingState       = null; // { scrollX, scrollY, zoom, centerX, centerY }
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
  }

  createSceneSystems() {
    if (this.physics?.world) {
      this.physics.world.setBounds(0, 0, WORLD_LAYOUT.WIDTH, WORLD_LAYOUT.HEIGHT);
    }

    this.cameraController = this.instantiateCameraController();
    this.input.on('wheel', this.handleWheelInteraction, this);
    this.setCameraFollowPaused(false);

    this._startQuizSystems();

    // Fixed framing: permanently lock camera follow so the framing holds.
    if (this._fixedFramingActive) {
      this.setCameraFollowPaused(true);
    }
  }

  destroySceneSystems() {
    this.input?.off('wheel', this.handleWheelInteraction, this);
    this.setCameraFollowPaused(false);
    this.cameraController?.destroy?.();
    this.cameraController = null;
    this.helicopter?.clearTarget?.();
    this.helicopter = null;
    this.freeLookActive = false;
    this.manualCameraUntil = 0;

    this._resultOverlay?.destroy();
    this._quizHUD?.destroy();
    this._targetVisualizer?.destroy();
    this._resultOverlay    = null;
    this._quizHUD          = null;
    this._targetVisualizer = null;
    this._hoverDetector    = null;
    this._searchTimer      = null;
    this._quizController   = null;
    this._activeTargetPoint = null;

    this._runEnded            = false;
    this._searchTimerDuration = 0;
    this._currentQuizSetId    = null;

    this._fixedFramingActive = false;
    this._quizSetTargets     = null;
    this._framingState       = null;
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
    if (!this._fixedFramingActive) {
      this.resumeCameraFollow();
    }
    this.setHelicopterTarget(worldX, worldY);
  }

  handleCommandMove(worldX, worldY) {
    this.setHelicopterTarget(worldX, worldY);
  }

  handleCommandUp(pointer) {
    void pointer;
  }

  shouldHandleCommand(pointer, worldX, worldY) {
    if (this._runEnded) return false;

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

    this.helicopter.setTarget(target.x, target.y);
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
      MARKER_ARRIVAL_RADIUS_PX / this.getCameraZoom(),
    );
  }

  getCameraZoom() {
    return Math.max(this.cameras.main?.zoom ?? 1, 0.0001);
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

  // Recompute fixed framing on viewport resize so all targets stay visible.
  handleResize(gameSize) {
    if (this._fixedFramingActive && this._quizSetTargets?.length > 0) {
      this._framingState = this._computeFramingState(gameSize.width, gameSize.height);
    }

    super.handleResize?.(gameSize);

    if (this._fixedFramingActive && this._framingState) {
      const z = this._framingState.zoom;
      this.cameras.main.setZoom(z);
      this.cameras.main.scrollX = this._framingState.scrollX;
      this.cameras.main.scrollY = this._framingState.scrollY;
      this.inputController?.setZoomLimits(z, z);
      this.baseMapMinZoom = z;
    }
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
      const data = this.sys?.settings?.data ?? this.scene?.settings?.data;
      if (data?.quizSetId) return data.quizSetId;

      // URL param fallback for direct deep-linking
      const params = new URLSearchParams(window.location.search);
      const id = params.get('quizset');
      if (id) return id;
    } catch (_) { /* non-browser env */ }
    return null;
  }

  _resolveQuizSet(quizSetId) {
    const quizSetsData = this.cache?.json?.get(DATA_CACHE_KEYS.QUIZ_SETS) ?? null;
    if (!quizSetsData) return null;
    return (quizSetsData.sets ?? []).find((s) => s.id === quizSetId) ?? null;
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
    const fixedTargets = (quizSet.targets ?? [])
      .map((id) => targetMap.get(id))
      .filter(Boolean);

    return {
      id: quizSet.id,
      name: quizSet.name,
      description: quizSet.description ?? '',
      hoverTime: quizSet.hoverTime ?? 3000,
      helicopterSpeed: quizSet.helicopterSpeed ?? 300,
      targetRadius: quizSet.targetRadius ?? 60,
      searchTime: quizSet.searchTime ?? 60,
      fixedTargets,
      fixedFraming: Boolean(quizSet.fixedFraming),
      framingPaddingFactor: quizSet.framingPaddingFactor ?? 0.15,
    };
  }

  /** Compute framing state for the given viewport dimensions. */
  _computeFramingState(viewWidth, viewHeight) {
    if (!this._quizSetTargets?.length) return null;

    const level = this._quizController?.level;
    const paddingFactor = level?.framingPaddingFactor ?? 0.15;

    return computeFixedFraming(
      this._quizSetTargets,
      (lat, lon) => this.projectLatLon(lat, lon),
      viewWidth,
      viewHeight,
      paddingFactor,
    );
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
    const quizSetId = this._resolveStartQuizSetId();
    if (quizSetId) {
      const quizSet = this._resolveQuizSet(quizSetId);
      if (quizSet) {
        const levelConfig = this._buildLevelFromQuizSet(quizSet, targetsData);
        this._quizController.level = levelConfig;
        this._currentQuizSetId     = quizSetId;

        if (quizSet.fixedFraming) {
          this._fixedFramingActive = true;
          this._quizSetTargets = levelConfig.fixedTargets;
        }
        return;
      }
    }

    // Fall back to URL-based level selection
    const levelId = this._resolveStartLevelId();
    this._quizController.level = this._quizController.resolveLevel(levelId);
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
      onComplete: () => this._quizController?.advance(),
    });

    // World-space target ring
    this._targetVisualizer = new TargetVisualizer(this);

    // UI overlays
    this._quizHUD       = new QuizHUD(this);
    this._resultOverlay = new ResultOverlay(this);

    // Start the quiz (fires onTargetChange → _onQuizTargetChange)
    this._quizController.start(level);
  }

  // ── Quiz callbacks ────────────────────────────────────────────────────────

  _onQuizTargetChange(target, progress) {
    if (!target) return;

    const pt = this.projectLatLon(target.lat, target.lon);
    this._activeTargetPoint = pt ?? null;

    if (pt) {
      const radius = this._quizController?.level?.targetRadius ?? 60;
      this._targetVisualizer?.showTarget(pt.x, pt.y, radius);
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
  }

  _onQuizScoreUpdate(progress) {
    // HUD will refresh on next onTargetChange; nothing extra needed here.
    void progress;
  }

  _onQuizComplete(progress) {
    if (this._runEnded) return;
    this._runEnded = true;

    this._searchTimer?.stop();
    this._targetVisualizer?.hideTarget();
    this._quizHUD?.hideTimer();
    this._quizHUD?.showComplete(progress.score, progress.total);
    this._hoverDetector = null;

    this._showResult(true, progress.score, progress.total);
  }

  /** Called by the SearchTimer when time runs out for the current target. */
  _endRunLoss() {
    if (this._runEnded) return;
    this._runEnded = true;

    this._hoverDetector = null;
    this._searchTimer?.stop();
    this._targetVisualizer?.hideTarget();
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
    const scale = Phaser.Math.Clamp(
      HELICOPTER_STYLE.SCALE_FACTOR / zoom,
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

    if (!manualCameraActive) {
      this.cameraController?.update?.(delta);
    }

    this._updateQuiz(delta);
  }

  _updateQuiz(delta) {
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

    const radius = this._quizController?.level?.targetRadius ?? 60;
    const result = this._hoverDetector.update(
      delta,
      heliX,
      heliY,
      this._activeTargetPoint.x,
      this._activeTargetPoint.y,
      radius,
    );

    // Drive the pulse animation even when not hovering
    if (this._targetVisualizer && !result.complete) {
      this._targetVisualizer.updateProgress(result.progress, delta, result.hovering);
    }
  }
}
