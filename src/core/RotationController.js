const DEFAULT_CONFIG = Object.freeze({
  turnSpeed: Math.PI * 4,
  velocityThreshold: 10,
});

const TAU = Math.PI * 2;

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

const normalizeAngle = (angle) => {
  let normalizedAngle = angle % TAU;

  if (normalizedAngle <= -Math.PI) {
    normalizedAngle += TAU;
  } else if (normalizedAngle > Math.PI) {
    normalizedAngle -= TAU;
  }

  return normalizedAngle;
};

const readRotation = (gameObject) => {
  if (Number.isFinite(gameObject?.rotation)) {
    return gameObject.rotation;
  }

  if (Number.isFinite(gameObject?.angle)) {
    return (gameObject.angle * Math.PI) / 180;
  }

  return 0;
};

const applyRotation = (gameObject, heading) => {
  if (!gameObject) {
    return;
  }

  if (typeof gameObject.setRotation === 'function') {
    gameObject.setRotation(heading);
    return;
  }

  gameObject.rotation = heading;
};

export default class RotationController {
  constructor(config = {}) {
    this.turnSpeed = clampMin(
      config.turnSpeed,
      0,
      DEFAULT_CONFIG.turnSpeed,
    );
    this.velocityThreshold = clampMin(
      config.velocityThreshold,
      0,
      DEFAULT_CONFIG.velocityThreshold,
    );
    this.heading = 0;
    this.initialized = false;
  }

  update(gameObject, velocity, delta) {
    if (!this.initialized) {
      this.heading = normalizeAngle(readRotation(gameObject));
      this.initialized = true;
    }

    const vx = toFiniteNumber(velocity?.x, 0);
    const vy = toFiniteNumber(velocity?.y, 0);
    const thresholdSquared = this.velocityThreshold * this.velocityThreshold;
    const speedSquared = vx * vx + vy * vy;

    if (speedSquared < thresholdSquared) {
      applyRotation(gameObject, this.heading);
      return this.heading;
    }

    const targetHeading = Math.atan2(vy, vx);
    const dt = Math.max(toFiniteNumber(delta, 0), 0) / 1000;
    const maxTurn = this.turnSpeed * dt;

    if (dt <= 0 || !Number.isFinite(maxTurn) || maxTurn <= 0) {
      this.heading = normalizeAngle(targetHeading);
    } else {
      const deltaHeading = normalizeAngle(targetHeading - this.heading);
      this.heading =
        Math.abs(deltaHeading) <= maxTurn
          ? normalizeAngle(targetHeading)
          : normalizeAngle(this.heading + Math.sign(deltaHeading) * maxTurn);
    }

    applyRotation(gameObject, this.heading);
    return this.heading;
  }

  getHeading() {
    return this.heading;
  }
}
