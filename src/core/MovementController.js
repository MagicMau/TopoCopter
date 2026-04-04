const DEFAULT_CONFIG = Object.freeze({
  maxSpeed: 260,
  acceleration: 720,
  decelerationRadius: 180,
  stopThreshold: 10,
});

const EPSILON = 0.0001;

const toFiniteNumber = (value, fallback) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

const clampMin = (value, minimum, fallback) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.max(numericValue, minimum)
    : fallback;
};

const resolveBodyCenterX = (body) => {
  if (Number.isFinite(body?.center?.x)) {
    return body.center.x;
  }

  if (Number.isFinite(body?.gameObject?.x)) {
    return body.gameObject.x;
  }

  if (Number.isFinite(body?.x)) {
    const halfWidth = Number.isFinite(body?.halfWidth)
      ? body.halfWidth
      : Number.isFinite(body?.width)
        ? body.width * 0.5
        : 0;

    return body.x + halfWidth;
  }

  return 0;
};

const resolveBodyCenterY = (body) => {
  if (Number.isFinite(body?.center?.y)) {
    return body.center.y;
  }

  if (Number.isFinite(body?.gameObject?.y)) {
    return body.gameObject.y;
  }

  if (Number.isFinite(body?.y)) {
    const halfHeight = Number.isFinite(body?.halfHeight)
      ? body.halfHeight
      : Number.isFinite(body?.height)
        ? body.height * 0.5
        : 0;

    return body.y + halfHeight;
  }

  return 0;
};

const resolveBodyHalfWidth = (body) => {
  if (Number.isFinite(body?.halfWidth)) {
    return body.halfWidth;
  }

  if (Number.isFinite(body?.width)) {
    return body.width * 0.5;
  }

  return 0;
};

const resolveBodyHalfHeight = (body) => {
  if (Number.isFinite(body?.halfHeight)) {
    return body.halfHeight;
  }

  if (Number.isFinite(body?.height)) {
    return body.height * 0.5;
  }

  return 0;
};

const setBodyVelocity = (body, x, y) => {
  if (!body) {
    return;
  }

  if (typeof body.setVelocity === 'function') {
    body.setVelocity(x, y);
    return;
  }

  if (!body.velocity) {
    body.velocity = { x: 0, y: 0 };
  }

  body.velocity.x = x;
  body.velocity.y = y;
};

const stopBody = (body) => {
  if (!body) {
    return;
  }

  if (typeof body.stop === 'function') {
    body.stop();

    if (body.velocity) {
      body.velocity.x = 0;
      body.velocity.y = 0;
    }

    return;
  }

  setBodyVelocity(body, 0, 0);
};

const snapBodyTo = (body, x, y) => {
  if (!body) {
    return;
  }

  const gameObject = body.gameObject;

  if (gameObject) {
    if (typeof gameObject.setPosition === 'function') {
      gameObject.setPosition(x, y);
    } else {
      gameObject.x = x;
      gameObject.y = y;
    }
  }

  if (typeof body.updateFromGameObject === 'function') {
    body.updateFromGameObject();
  } else {
    const halfWidth = resolveBodyHalfWidth(body);
    const halfHeight = resolveBodyHalfHeight(body);

    body.x = x - halfWidth;
    body.y = y - halfHeight;

    if (body.center) {
      body.center.x = x;
      body.center.y = y;
    }
  }

  stopBody(body);
};

const moveVelocityTowards = (
  body,
  currentVx,
  currentVy,
  targetVx,
  targetVy,
  maxDelta,
) => {
  const deltaVx = targetVx - currentVx;
  const deltaVy = targetVy - currentVy;
  const deltaMagnitude = Math.hypot(deltaVx, deltaVy);

  if (!Number.isFinite(maxDelta) || maxDelta <= 0 || deltaMagnitude <= maxDelta) {
    setBodyVelocity(body, targetVx, targetVy);
    return;
  }

  const scale = maxDelta / deltaMagnitude;
  setBodyVelocity(
    body,
    currentVx + deltaVx * scale,
    currentVy + deltaVy * scale,
  );
};

export default class MovementController {
  constructor(config = {}) {
    this.maxSpeed = clampMin(
      config.maxSpeed,
      0,
      DEFAULT_CONFIG.maxSpeed,
    );
    this.acceleration = clampMin(
      config.acceleration,
      0,
      DEFAULT_CONFIG.acceleration,
    );
    this.decelerationRadius = clampMin(
      config.decelerationRadius,
      0,
      DEFAULT_CONFIG.decelerationRadius,
    );
    this.stopThreshold = clampMin(
      config.stopThreshold,
      EPSILON,
      DEFAULT_CONFIG.stopThreshold,
    );
    this.targetStopThreshold = this.stopThreshold;
    this.targetSnapOnArrival = false;
    this.targetX = 0;
    this.targetY = 0;
    this.targetActive = false;
  }

  setTarget(x, y, options = {}) {
    const targetOptions = options && typeof options === 'object' ? options : {};

    this.targetX = toFiniteNumber(x, this.targetX);
    this.targetY = toFiniteNumber(y, this.targetY);
    this.targetStopThreshold = clampMin(
      targetOptions.stopThreshold,
      EPSILON,
      this.stopThreshold,
    );
    this.targetSnapOnArrival = Boolean(targetOptions.snapOnArrival);
    this.targetActive = true;
    return this;
  }

  clearTarget() {
    this.targetActive = false;
    this.targetStopThreshold = this.stopThreshold;
    this.targetSnapOnArrival = false;
    return this;
  }

  hasTarget() {
    return this.targetActive;
  }

  getTarget() {
    return this.targetActive ? { x: this.targetX, y: this.targetY } : null;
  }

  completeTarget(body, snapToTarget = false) {
    if (snapToTarget) {
      snapBodyTo(body, this.targetX, this.targetY);
    } else {
      stopBody(body);
    }

    this.clearTarget();
  }

  update(body, delta) {
    if (!body) {
      return;
    }

    const dt = Math.max(toFiniteNumber(delta, 0), 0) / 1000;
    if (dt <= 0) {
      return;
    }

    const velocity = body.velocity ?? { x: 0, y: 0 };
    const currentVx = toFiniteNumber(velocity.x, 0);
    const currentVy = toFiniteNumber(velocity.y, 0);
    const maxDelta = this.acceleration > 0
      ? this.acceleration * dt
      : Number.POSITIVE_INFINITY;

    if (!this.targetActive) {
      if (Math.hypot(currentVx, currentVy) <= Math.max(maxDelta, EPSILON)) {
        setBodyVelocity(body, 0, 0);
        return;
      }

      moveVelocityTowards(body, currentVx, currentVy, 0, 0, maxDelta);
      return;
    }

    const dx = this.targetX - resolveBodyCenterX(body);
    const dy = this.targetY - resolveBodyCenterY(body);
    const distance = Math.hypot(dx, dy);
    const stopThreshold = this.targetStopThreshold;
    const snapOnArrival = this.targetSnapOnArrival;

    if (distance <= stopThreshold) {
      this.completeTarget(body, snapOnArrival);
      return;
    }

    let desiredSpeed = this.maxSpeed;
    if (
      this.decelerationRadius > stopThreshold &&
      distance < this.decelerationRadius
    ) {
      desiredSpeed *=
        (distance - stopThreshold) /
        (this.decelerationRadius - stopThreshold);
    }

    if (this.acceleration > 0) {
      const brakingSpeed = Math.sqrt(
        2 * this.acceleration * Math.max(distance - stopThreshold, 0),
      );
      desiredSpeed = Math.min(desiredSpeed, brakingSpeed);
    }

    desiredSpeed = Math.max(0, Math.min(desiredSpeed, this.maxSpeed));

    const directionScale = desiredSpeed / distance;
    const desiredVx = dx * directionScale;
    const desiredVy = dy * directionScale;

    moveVelocityTowards(
      body,
      currentVx,
      currentVy,
      desiredVx,
      desiredVy,
      maxDelta,
    );

    const nextVelocity = body.velocity ?? velocity;
    const nextSpeed = Math.hypot(
      toFiniteNumber(nextVelocity.x, 0),
      toFiniteNumber(nextVelocity.y, 0),
    );
    const nextStepDistance = nextSpeed * dt;

    if (snapOnArrival) {
      if (distance <= Math.max(stopThreshold * 1.5, nextStepDistance)) {
        this.completeTarget(body, true);
      }
      return;
    }

    if (
      distance <= stopThreshold * 1.5 &&
      nextSpeed <= Math.max(stopThreshold, maxDelta)
    ) {
      this.completeTarget(body);
    }
  }
}
