import Phaser from 'phaser';
import { CAMERA_LIMITS } from '../ui/styles.js';
import {
  debugLog,
  describeCameraView,
} from './runtimeDebug.js';
import {
  getCameraScrollForVisibleWorldOrigin,
  getCameraScrollForWorldPoint,
  getCameraVisibleWorldRect,
  getCameraWorldPoint,
  getCameraViewportMetrics,
  setCameraScroll,
} from './cameraMath.js';

export default class InputController {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.camera = options.camera ?? scene.cameras.main;
    this.worldWidth = options.worldWidth ?? this.camera.width;
    this.worldHeight = options.worldHeight ?? this.camera.height;
    this.minZoom = options.minZoom ?? this.camera.zoom;
    this.maxZoom = Math.max(
      options.maxZoom ?? CAMERA_LIMITS.MAX_ZOOM,
      this.minZoom,
    );
    this.wheelZoomSpeed =
      options.wheelZoomSpeed ?? CAMERA_LIMITS.WHEEL_ZOOM_SPEED;
    this.doubleTapDelay =
      options.doubleTapDelay ?? CAMERA_LIMITS.DOUBLE_TAP_DELAY;
    this.doubleTapDistance =
      options.doubleTapDistance ?? CAMERA_LIMITS.DOUBLE_TAP_DISTANCE;
    this.doubleTapZoomFactor =
      options.doubleTapZoomFactor ?? CAMERA_LIMITS.DOUBLE_TAP_ZOOM_FACTOR;
    this.onCommandDown =
      typeof options.onCommandDown === 'function' ? options.onCommandDown : null;
    this.onCommandMove =
      typeof options.onCommandMove === 'function' ? options.onCommandMove : null;
    this.onCommandUp =
      typeof options.onCommandUp === 'function' ? options.onCommandUp : null;
    this.commandPredicate =
      typeof options.commandPredicate === 'function'
        ? options.commandPredicate
        : () => false;
    this.getZoomAnchor =
      typeof options.getZoomAnchor === 'function' ? options.getZoomAnchor : null;
    const commandMoveThreshold = Number(options.commandMoveThreshold);
    this.commandMoveThreshold =
      Number.isFinite(commandMoveThreshold) && commandMoveThreshold >= 0
        ? commandMoveThreshold
        : 10;
    this.zoomLocked = Boolean(options.zoomLocked);
    this.dragLocked = Boolean(options.dragLocked);

    this.commandPointerId = null;
    this.commandStartX = 0;
    this.commandStartY = 0;
    this.commandSteering = false;
    this.dragPointerId = null;
    this.dragging = false;
    this.pinching = false;
    this.lastPointerX = 0;
    this.lastPointerY = 0;
    this.lastPinchDistance = 0;
    this.lastPinchMidX = 0;
    this.lastPinchMidY = 0;
    this.lastTapTime = Number.NEGATIVE_INFINITY;
    this.lastTapX = 0;
    this.lastTapY = 0;
    this._activeZoomDebugSource = null;
    this._lastZoomDebugAt = Number.NEGATIVE_INFINITY;
    this.pointerCanvasPoint = new Phaser.Math.Vector2();
    this.pointerWorldPoint = new Phaser.Math.Vector2();

    this.bindEvents();
    this.clampCamera();
  }

  bindEvents() {
    this.scene.input.on('pointerdown', this.handlePointerDown, this);
    this.scene.input.on('pointermove', this.handlePointerMove, this);
    this.scene.input.on('pointerup', this.handlePointerUp, this);
    this.scene.input.on('pointerupoutside', this.handlePointerUp, this);
    this.scene.input.on('wheel', this.handleWheel, this);
  }

  handlePointerDown(pointer) {
    const touchPointers = this.getTouchPointers();

    if (pointer.pointerType === 'touch' && touchPointers.length >= 2) {
      this.beginPinch(touchPointers[0], touchPointers[1]);
      return;
    }

    if (!this.isInteractivePointer(pointer)) {
      return;
    }

    if (pointer.pointerType === 'touch' && this.isDoubleTap(pointer)) {
      this.endCommand(pointer, false);
      this.endDrag();
      if (!this.zoomLocked) {
        const canvasPoint = this.getPointerCanvasPoint(
          pointer,
          this.pointerCanvasPoint,
        );
        this._activeZoomDebugSource = 'double-tap';
        this.zoomTo(
          this.camera.zoom * this.doubleTapZoomFactor,
          canvasPoint.x,
          canvasPoint.y,
        );
      }
      return;
    }

    if (this.tryBeginCommand(pointer)) {
      return;
    }

    this.beginDrag(pointer);
  }

  handlePointerMove(pointer) {
    if (this.pinching) {
      const touchPointers = this.getTouchPointers();
      if (touchPointers.length >= 2) {
        this.updatePinch(touchPointers[0], touchPointers[1]);
      }
      return;
    }

    if (this.commandPointerId === pointer.id) {
      if (!pointer.isDown) {
        return;
      }

      const canvasPoint = this.getPointerCanvasPoint(pointer, this.pointerCanvasPoint);

      if (!this.commandSteering) {
        const deltaX = canvasPoint.x - this.commandStartX;
        const deltaY = canvasPoint.y - this.commandStartY;
        const moveThreshold = this.commandMoveThreshold;

        if (deltaX * deltaX + deltaY * deltaY < moveThreshold * moveThreshold) {
          return;
        }

        this.commandSteering = true;
      }

      const worldPoint = this.getPointerWorldPoint(
        pointer,
        this.pointerWorldPoint,
      );
      this.onCommandMove?.(worldPoint.x, worldPoint.y, pointer);
      return;
    }

    if (!this.dragging || this.dragPointerId !== pointer.id || !pointer.isDown) {
      return;
    }

    if (this.dragLocked) {
      return;
    }

    const deltaX = pointer.x - this.lastPointerX;
    const deltaY = pointer.y - this.lastPointerY;

    this.lastPointerX = pointer.x;
    this.lastPointerY = pointer.y;

    this.camera.scrollX -= deltaX / this.camera.zoom;
    this.camera.scrollY -= deltaY / this.camera.zoom;
    this.clampCamera();
  }

  handlePointerUp(pointer) {
    if (this.pinching) {
      const touchPointers = this.getTouchPointers();
      if (touchPointers.length < 2) {
        this.endPinch();
        if (touchPointers.length === 1) {
          this.beginDrag(touchPointers[0]);
        }
      }
      return;
    }

    if (pointer.id === this.commandPointerId) {
      this.endCommand(pointer);
      return;
    }

    if (pointer.id === this.dragPointerId) {
      this.endDrag();
    }
  }

  handleWheel(pointer, currentlyOver, deltaX, deltaY, deltaZ) {
    void currentlyOver;
    void deltaX;
    void deltaZ;

    pointer.event?.preventDefault?.();

    if (this.zoomLocked) {
      return;
    }

    const canvasPoint = this.getPointerCanvasPoint(
      pointer,
      this.pointerCanvasPoint,
    );
    const zoomScale = Math.exp(-(Number(deltaY) || 0) * this.wheelZoomSpeed);

    let anchorX = canvasPoint.x;
    let anchorY = canvasPoint.y;
    if (this.getZoomAnchor) {
      const anchor = this.getZoomAnchor(canvasPoint.x, canvasPoint.y);
      if (anchor) {
        anchorX = anchor.x;
        anchorY = anchor.y;
      }
    }

    this._activeZoomDebugSource = 'wheel';
    this.zoomTo(this.camera.zoom * zoomScale, anchorX, anchorY);
  }

  beginDrag(pointer) {
    if (this.dragLocked) {
      return;
    }

    this.endCommand(pointer, false);
    this.dragging = true;
    this.dragPointerId = pointer.id;
    this.lastPointerX = pointer.x;
    this.lastPointerY = pointer.y;
  }

  endDrag() {
    this.dragging = false;
    this.dragPointerId = null;
  }

  tryBeginCommand(pointer) {
    if (!this.isCommandPointer(pointer)) {
      return false;
    }

    const worldPoint = this.getPointerWorldPoint(pointer, this.pointerWorldPoint);

    if (!this.commandPredicate(pointer, worldPoint.x, worldPoint.y)) {
      return false;
    }

    this.beginCommand(pointer, worldPoint.x, worldPoint.y);

    return true;
  }

  beginCommand(pointer, worldX, worldY) {
    this.endDrag();
    this.commandPointerId = pointer.id;
    const canvasPoint = this.getPointerCanvasPoint(pointer, this.pointerCanvasPoint);
    this.commandStartX = canvasPoint.x;
    this.commandStartY = canvasPoint.y;
    this.commandSteering = false;
    this.onCommandDown?.(worldX, worldY, pointer);
  }

  endCommand(pointer = this.getPointerById(this.commandPointerId), notify = true) {
    if (this.commandPointerId === null) {
      return;
    }

    this.commandPointerId = null;
    this.commandStartX = 0;
    this.commandStartY = 0;
    this.commandSteering = false;

    if (notify) {
      this.onCommandUp?.(pointer);
    }
  }

  beginPinch(pointerA, pointerB) {
    this.endDrag();
    this.endCommand(
      this.getPointerById(this.commandPointerId) ?? pointerA ?? pointerB,
    );
    this.pinching = true;
    this.lastPinchDistance = Math.max(
      Phaser.Math.Distance.Between(
        pointerA.x,
        pointerA.y,
        pointerB.x,
        pointerB.y,
      ),
      1,
    );
    this.lastPinchMidX = (pointerA.x + pointerB.x) * 0.5;
    this.lastPinchMidY = (pointerA.y + pointerB.y) * 0.5;
  }

  updatePinch(pointerA, pointerB) {
    if (this.zoomLocked) {
      return;
    }

    const pinchDistance = Math.max(
      Phaser.Math.Distance.Between(
        pointerA.x,
        pointerA.y,
        pointerB.x,
        pointerB.y,
      ),
      1,
    );
    const pinchMidX = (pointerA.x + pointerB.x) * 0.5;
    const pinchMidY = (pointerA.y + pointerB.y) * 0.5;
    const zoomFactor = pinchDistance / this.lastPinchDistance;
    this._activeZoomDebugSource = 'pinch';
    this.zoomTo(
      this.camera.zoom * zoomFactor,
      pinchMidX,
      pinchMidY,
      this.lastPinchMidX,
      this.lastPinchMidY,
    );

    this.lastPinchDistance = pinchDistance;
    this.lastPinchMidX = pinchMidX;
    this.lastPinchMidY = pinchMidY;
  }

  endPinch() {
    this.pinching = false;
    this.lastPinchDistance = 0;
    this.lastPinchMidX = 0;
    this.lastPinchMidY = 0;
  }

  getTouchPointers() {
    const pointers =
      this.scene.input.manager?.pointers ?? this.scene.input.pointers ?? [];

    return pointers.filter(
      (pointer) => pointer.isDown && pointer.pointerType === 'touch',
    );
  }

  getPointerById(pointerId) {
    if (pointerId === null) {
      return null;
    }

    const pointers =
      this.scene.input.manager?.pointers ?? this.scene.input.pointers ?? [];

    return pointers.find((pointer) => pointer.id === pointerId) ?? null;
  }

  isCommandPointer(pointer) {
    return pointer.pointerType === 'touch' || pointer.leftButtonDown();
  }

  isInteractivePointer(pointer) {
    return this.isCommandPointer(pointer) || pointer.rightButtonDown();
  }

  isDoubleTap(pointer) {
    const now = this.scene.time.now;
    const wasDoubleTap =
      now - this.lastTapTime <= this.doubleTapDelay &&
      Phaser.Math.Distance.Between(
        pointer.x,
        pointer.y,
        this.lastTapX,
        this.lastTapY,
      ) <= this.doubleTapDistance;

    this.lastTapTime = now;
    this.lastTapX = pointer.x;
    this.lastTapY = pointer.y;

    return wasDoubleTap;
  }

  getPointerCanvasPoint(pointer, output = this.pointerCanvasPoint) {
    output.x = Number.isFinite(pointer?.x) ? pointer.x : this.camera.width * 0.5;
    output.y = Number.isFinite(pointer?.y) ? pointer.y : this.camera.height * 0.5;
    return output;
  }

  getWorldPointFromCanvas(
    canvasX,
    canvasY,
    zoom = this.camera.zoom,
    output = this.pointerWorldPoint,
  ) {
    return getCameraWorldPoint(this.camera, canvasX, canvasY, zoom, output);
  }

  getPointerWorldPoint(pointer, output = this.pointerWorldPoint) {
    const canvasPoint = this.getPointerCanvasPoint(pointer, this.pointerCanvasPoint);
    return this.getWorldPointFromCanvas(
      canvasPoint.x,
      canvasPoint.y,
      this.camera.zoom,
      output,
    );
  }

  zoomTo(
    zoom,
    screenX = this.camera.width * 0.5,
    screenY = this.camera.height * 0.5,
    anchorX = screenX,
    anchorY = screenY,
  ) {
    const source = this._activeZoomDebugSource ?? 'direct';
    this._activeZoomDebugSource = null;
    const nextZoom = this.clampZoom(zoom);
    const prevZoom = this.camera.zoom;
    if (nextZoom === prevZoom) {
      return;
    }

    const beforeCamera = describeCameraView(
      this.camera,
      this.scene?.projection,
    );

    const anchorWorldPoint = this.getWorldPointFromCanvas(
      anchorX,
      anchorY,
      prevZoom,
      this.pointerWorldPoint,
    );
    const anchorWorldX = anchorWorldPoint.x;
    const anchorWorldY = anchorWorldPoint.y;

    this.camera.setZoom(nextZoom);
    const nextScroll = getCameraScrollForWorldPoint(
      this.camera,
      anchorWorldX,
      anchorWorldY,
      screenX,
      screenY,
      nextZoom,
      this.pointerCanvasPoint,
    );
    setCameraScroll(this.camera, nextScroll.x, nextScroll.y);

    this.clampCamera();

    if (this._shouldLogZoomEvent(source)) {
      debugLog('INPUT-ZOOM', 'Applied zoomTo', {
        source,
        requestedZoom: zoom,
        previousZoom: prevZoom,
        nextZoom,
        screenPoint: {
          x: screenX,
          y: screenY,
        },
        anchorCanvasPoint: {
          x: anchorX,
          y: anchorY,
        },
        anchorWorldPoint: {
          x: anchorWorldX,
          y: anchorWorldY,
        },
        beforeCamera,
        afterCamera: describeCameraView(this.camera, this.scene?.projection),
      });
    }
  }

  clampZoom(zoom) {
    return Phaser.Math.Clamp(zoom, this.minZoom, this.maxZoom);
  }

  setDragLocked(locked) {
    this.dragLocked = Boolean(locked);
  }

  setZoomLimits(minZoom, maxZoom = this.maxZoom) {
    const before = {
      minZoom: this.minZoom,
      maxZoom: this.maxZoom,
      camera: describeCameraView(this.camera, this.scene?.projection),
    };

    this.minZoom = minZoom;
    this.maxZoom = Math.max(maxZoom, minZoom);
    this._activeZoomDebugSource = 'zoom-limits';
    this.zoomTo(this.clampZoom(this.camera.zoom));

    debugLog('INPUT-ZOOM-LIMITS', 'Updated zoom limits', {
      before,
      after: {
        minZoom: this.minZoom,
        maxZoom: this.maxZoom,
        camera: describeCameraView(this.camera, this.scene?.projection),
      },
      zoomLocked: this.zoomLocked,
      dragLocked: this.dragLocked,
    });
  }

  resolveScrollBounds() {
    const cameraBounds = this.camera?._bounds ?? this.camera?.bounds ?? null;

    if (
      this.camera?.useBounds &&
      Number.isFinite(cameraBounds?.width) &&
      Number.isFinite(cameraBounds?.height)
    ) {
      return cameraBounds;
    }

    if (Number.isFinite(this.worldWidth) && Number.isFinite(this.worldHeight)) {
      return {
        x: 0,
        y: 0,
        width: Math.max(this.worldWidth, 0),
        height: Math.max(this.worldHeight, 0),
      };
    }

    return null;
  }

  clampCamera() {
    const bounds = this.resolveScrollBounds();

    if (!bounds) {
      return;
    }

    const beforeScrollX = this.camera.scrollX;
    const beforeScrollY = this.camera.scrollY;
    const metrics = getCameraViewportMetrics(this.camera);
    const visibleRect = getCameraVisibleWorldRect(this.camera, metrics.zoom);
    const bx = Number(bounds.x) || 0;
    const by = Number(bounds.y) || 0;
    const bw = Number(bounds.width) || 0;
    const bh = Number(bounds.height) || 0;
    let nextVisibleLeft;
    let nextVisibleTop;

    if (bw > visibleRect.width) {
      nextVisibleLeft = Phaser.Math.Clamp(
        visibleRect.left,
        bx,
        bx + bw - visibleRect.width,
      );
    } else {
      nextVisibleLeft = bx + (bw - visibleRect.width) * 0.5;
    }

    if (bh > visibleRect.height) {
      nextVisibleTop = Phaser.Math.Clamp(
        visibleRect.top,
        by,
        by + bh - visibleRect.height,
      );
    } else {
      nextVisibleTop = by + (bh - visibleRect.height) * 0.5;
    }

    const nextScroll = getCameraScrollForVisibleWorldOrigin(
      this.camera,
      nextVisibleLeft,
      nextVisibleTop,
      metrics.zoom,
      this.pointerCanvasPoint,
    );
    setCameraScroll(this.camera, nextScroll.x, nextScroll.y);

    if (
      Math.abs(this.camera.scrollX - beforeScrollX) > 0.001
      || Math.abs(this.camera.scrollY - beforeScrollY) > 0.001
    ) {
      debugLog('INPUT-CLAMP', 'Clamped camera scroll to world bounds', {
        bounds,
        zoom: metrics.zoom,
        before: {
          scrollX: beforeScrollX,
          scrollY: beforeScrollY,
        },
        after: describeCameraView(this.camera, this.scene?.projection),
      });
    }
  }

  isCommandSteeringActive() {
    return this.commandPointerId !== null && this.commandSteering;
  }

  _shouldLogZoomEvent(source) {
    if (source === 'zoom-limits' || source === 'direct' || source === 'double-tap') {
      return true;
    }

    const now = Number(this.scene?.time?.now);
    const timestamp = Number.isFinite(now) ? now : Date.now();

    if (timestamp - this._lastZoomDebugAt >= 250) {
      this._lastZoomDebugAt = timestamp;
      return true;
    }

    return false;
  }

  update() {}

  destroy() {
    if (!this.scene) {
      return;
    }

    this.scene.input.off('pointerdown', this.handlePointerDown, this);
    this.scene.input.off('pointermove', this.handlePointerMove, this);
    this.scene.input.off('pointerup', this.handlePointerUp, this);
    this.scene.input.off('pointerupoutside', this.handlePointerUp, this);
    this.scene.input.off('wheel', this.handleWheel, this);

    this.endDrag();
    this.endCommand(null, false);
    this.pinching = false;
    this.commandPointerId = null;
    this.commandSteering = false;
    this.scene = null;
    this.camera = null;
  }
}
