import {
  getCameraScrollForVisibleWorldOrigin,
  getCameraScrollForWorldCenter,
  getCameraViewportMetrics,
  setCameraScroll,
} from './cameraMath.js';

const DEFAULT_OPTIONS = Object.freeze({
  followLag: 0.18,
  maxCatchUpSpeed: Number.POSITIVE_INFINITY,
});

const toFiniteNumber = (value, fallback) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

const clamp = (value, minimum, maximum) =>
  Math.min(Math.max(value, minimum), maximum);

const resolveWorldDimension = (camera, explicitDimension, axis) => {
  if (Number.isFinite(explicitDimension)) {
    return Math.max(explicitDimension, 0);
  }

  const bounds = camera?._bounds ?? camera?.bounds ?? null;
  if (Number.isFinite(bounds?.[axis])) {
    return Math.max(bounds[axis], 0);
  }

  return Number.POSITIVE_INFINITY;
};

const resolveScrollBounds = (camera, worldWidth, worldHeight) => {
  const cameraBounds = camera?._bounds ?? camera?.bounds ?? null;

  if (
    camera?.useBounds &&
    Number.isFinite(cameraBounds?.width) &&
    Number.isFinite(cameraBounds?.height)
  ) {
    return {
      x: toFiniteNumber(cameraBounds.x, 0),
      y: toFiniteNumber(cameraBounds.y, 0),
      width: Math.max(toFiniteNumber(cameraBounds.width, 0), 0),
      height: Math.max(toFiniteNumber(cameraBounds.height, 0), 0),
    };
  }

  if (Number.isFinite(worldWidth) && Number.isFinite(worldHeight)) {
    return {
      x: 0,
      y: 0,
      width: Math.max(worldWidth, 0),
      height: Math.max(worldHeight, 0),
    };
  }

  return null;
};

const resolveTargetPosition = (target, output) => {
  if (!target) {
    return null;
  }

  if (Number.isFinite(target?.body?.center?.x) && Number.isFinite(target?.body?.center?.y)) {
    output.x = target.body.center.x;
    output.y = target.body.center.y;
    return output;
  }

  if (typeof target.getCenter === 'function') {
    const center = target.getCenter(output) ?? output;
    if (Number.isFinite(center?.x) && Number.isFinite(center?.y)) {
      output.x = center.x;
      output.y = center.y;
      return output;
    }
  }

  if (Number.isFinite(target?.x) && Number.isFinite(target?.y)) {
    output.x = target.x;
    output.y = target.y;
    return output;
  }

  if (typeof target.getPosition === 'function') {
    const position = target.getPosition();
    if (Number.isFinite(position?.x) && Number.isFinite(position?.y)) {
      output.x = position.x;
      output.y = position.y;
      return output;
    }
  }

  return null;
};

export default class CameraController {
  constructor(camera, target, options = {}) {
    this.camera = camera;
    this.target = target ?? null;
    this.getTargetPosition =
      typeof options.getTargetPosition === 'function'
        ? options.getTargetPosition
        : null;
    this.followLag = Math.max(
      0,
      toFiniteNumber(options.followLag, DEFAULT_OPTIONS.followLag),
    );
    const maxCatchUpSpeed = toFiniteNumber(
      options.maxCatchUpSpeed,
      DEFAULT_OPTIONS.maxCatchUpSpeed,
    );
    this.maxCatchUpSpeed =
      maxCatchUpSpeed > 0 ? maxCatchUpSpeed : Number.POSITIVE_INFINITY;
    this.worldWidth = resolveWorldDimension(
      camera,
      options.worldWidth,
      'width',
    );
    this.worldHeight = resolveWorldDimension(
      camera,
      options.worldHeight,
      'height',
    );
    this.deadzoneWidth = Math.max(toFiniteNumber(options.deadzoneWidth, 0), 0);
    this.deadzoneHeight = Math.max(toFiniteNumber(options.deadzoneHeight, 0), 0);
    this.enabled = true;
    this.paused = false;
    this.targetPosition = { x: 0, y: 0 };
    this.desiredScroll = { x: 0, y: 0 };
    this.clampedScroll = { x: 0, y: 0 };
  }

  setTarget(target) {
    this.target = target ?? null;
    return this;
  }

  setEnabled(enabled = true) {
    this.enabled = Boolean(enabled);
    return this;
  }

  setPaused(paused = true) {
    this.paused = Boolean(paused);
    return this;
  }

  pause() {
    return this.setPaused(true);
  }

  resume() {
    return this.setPaused(false);
  }

  snapToTarget() {
    if (!this.enabled || !this.resolveDesiredScroll()) {
      return;
    }

    setCameraScroll(this.camera, this.desiredScroll.x, this.desiredScroll.y);
  }

  update(delta) {
    if (!this.enabled || this.paused) {
      return;
    }

    if (!this.resolveDesiredScroll()) {
      return;
    }

    const dt = Math.max(toFiniteNumber(delta, 0), 0) / 1000;
    if (dt <= 0 || this.followLag === 0) {
      setCameraScroll(this.camera, this.desiredScroll.x, this.desiredScroll.y);
      return;
    }

    const currentScrollX = toFiniteNumber(this.camera?.scrollX, 0);
    const currentScrollY = toFiniteNumber(this.camera?.scrollY, 0);
    let stepX =
      (this.desiredScroll.x - currentScrollX) *
      (1 - Math.exp(-dt / this.followLag));
    let stepY =
      (this.desiredScroll.y - currentScrollY) *
      (1 - Math.exp(-dt / this.followLag));

    if (Number.isFinite(this.maxCatchUpSpeed)) {
      const maxStep = this.maxCatchUpSpeed * dt;
      const stepMagnitude = Math.hypot(stepX, stepY);

      if (stepMagnitude > maxStep && stepMagnitude > 0) {
        const scale = maxStep / stepMagnitude;
        stepX *= scale;
        stepY *= scale;
      }
    }

    const nextScroll = this.clampScroll(
      currentScrollX + stepX,
      currentScrollY + stepY,
      this.clampedScroll,
    );
    setCameraScroll(this.camera, nextScroll.x, nextScroll.y);
  }

  resolveDesiredScroll() {
    if (!this.camera || !this.resolveTargetPosition(this.targetPosition)) {
      return false;
    }

    const metrics = getCameraViewportMetrics(this.camera);
    const zoom = metrics.zoom;
    const camWidth = metrics.width;
    const camHeight = metrics.height;
    const idealScroll = getCameraScrollForWorldCenter(
      this.camera,
      this.targetPosition.x,
      this.targetPosition.y,
      this.desiredScroll,
    );

    if (this.deadzoneWidth > 0 || this.deadzoneHeight > 0) {
      const currentScrollX = toFiniteNumber(this.camera.scrollX, 0);
      const currentScrollY = toFiniteNumber(this.camera.scrollY, 0);
      const offsetX =
        (this.targetPosition.x - (currentScrollX + camWidth * 0.5)) * zoom;
      const offsetY =
        (this.targetPosition.y - (currentScrollY + camHeight * 0.5)) * zoom;

      const halfDZW = this.deadzoneWidth * 0.5;
      const halfDZH = this.deadzoneHeight * 0.5;

      // Only scroll enough to keep the target within the deadzone rectangle
      let desiredScrollX = currentScrollX;
      let desiredScrollY = currentScrollY;

      if (offsetX > halfDZW) {
        desiredScrollX = this.targetPosition.x - camWidth * 0.5 - halfDZW / zoom;
      } else if (offsetX < -halfDZW) {
        desiredScrollX = this.targetPosition.x - camWidth * 0.5 + halfDZW / zoom;
      }

      if (offsetY > halfDZH) {
        desiredScrollY = this.targetPosition.y - camHeight * 0.5 - halfDZH / zoom;
      } else if (offsetY < -halfDZH) {
        desiredScrollY = this.targetPosition.y - camHeight * 0.5 + halfDZH / zoom;
      }

      this.clampScroll(desiredScrollX, desiredScrollY, this.desiredScroll, zoom);
    } else {
      this.clampScroll(idealScroll.x, idealScroll.y, this.desiredScroll, zoom);
    }

    return true;
  }

  resolveTargetPosition(output = this.targetPosition) {
    if (typeof this.getTargetPosition === 'function') {
      const position = this.getTargetPosition(output) ?? output;

      if (Number.isFinite(position?.x) && Number.isFinite(position?.y)) {
        output.x = position.x;
        output.y = position.y;
        return output;
      }
    }

    return resolveTargetPosition(this.target, output);
  }

  clampScroll(
    scrollX,
    scrollY,
    output = this.clampedScroll,
    zoom = Math.max(toFiniteNumber(this.camera?.zoom, 1), 0.0001),
  ) {
    const bounds = resolveScrollBounds(this.camera, this.worldWidth, this.worldHeight);

    if (!bounds) {
      output.x = scrollX;
      output.y = scrollY;

      return output;
    }

    const metrics = getCameraViewportMetrics(this.camera, zoom);
    const visibleOffsetX = metrics.offsetX;
    const visibleOffsetY = metrics.offsetY;
    const visibleLeft = scrollX + visibleOffsetX;
    const visibleTop = scrollY + visibleOffsetY;
    const bx = bounds.x;
    const by = bounds.y;
    const bw = bounds.width;
    const bh = bounds.height;
    const clampedVisibleLeft = bw > metrics.viewWidth
      ? clamp(visibleLeft, bx, bx + bw - metrics.viewWidth)
      : bx + (bw - metrics.viewWidth) * 0.5;
    const clampedVisibleTop = bh > metrics.viewHeight
      ? clamp(visibleTop, by, by + bh - metrics.viewHeight)
      : by + (bh - metrics.viewHeight) * 0.5;
    const clampedScroll = getCameraScrollForVisibleWorldOrigin(
      this.camera,
      clampedVisibleLeft,
      clampedVisibleTop,
      zoom,
      output,
    );

    return clampedScroll;
  }

  destroy() {
    this.enabled = false;
    this.paused = false;
    this.getTargetPosition = null;
    this.target = null;
    this.camera = null;
  }
}
