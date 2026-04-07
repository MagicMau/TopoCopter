import Phaser from 'phaser';
import MovementController from '../core/MovementController.js';
import RotationController from '../core/RotationController.js';

const DEFAULT_SIZE = Object.freeze({
  width: 80,
  height: 80,
});

const DEFAULT_COLORS = Object.freeze({
  body: 0x1f2937,
  cabin: 0x60a5fa,
  skid: 0xf8fafc,
  rotor: 0x0f172a,
  tail: 0x334155,
});

const DEFAULT_MOVEMENT_CONFIG = Object.freeze({
  maxSpeed: 260,
  acceleration: 720,
  decelerationRadius: 180,
  stopThreshold: 10,
});

const DEFAULT_ROTATION_CONFIG = Object.freeze({
  turnSpeed: Math.PI * 4,
  velocityThreshold: 10,
});

const DEFAULT_MOVEMENT_EVENT_THRESHOLD = 4;
const GENERATED_TEXTURE_PREFIX = 'helicopter-generated';

const toFiniteNumber = (value, fallback) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

const asOptionsObject = (value) =>
  value && typeof value === 'object' ? value : {};

const normalizeSize = (options = {}) => {
  const sizeOption = options.size;
  const width =
    Number(sizeOption) > 0
      ? Number(sizeOption)
      : toFiniteNumber(
          options.width ?? sizeOption?.width,
          DEFAULT_SIZE.width,
        );
  const height =
    Number(sizeOption) > 0
      ? Math.max(Number(sizeOption) * 0.45, 18)
      : toFiniteNumber(
          options.height ?? sizeOption?.height,
          DEFAULT_SIZE.height,
        );

  return {
    width: Math.max(width, 24),
    height: Math.max(height, 14),
  };
};

const normalizeColor = (value, fallback) =>
  Number.isInteger(value) ? value : fallback;

const textureKeyFor = (scene, options, width, height) => {
  if (typeof options.texture === 'string' && options.texture.length > 0) {
    return options.texture;
  }

  const colors = {
    body: normalizeColor(options.colors?.body, DEFAULT_COLORS.body),
    cabin: normalizeColor(options.colors?.cabin, DEFAULT_COLORS.cabin),
    skid: normalizeColor(options.colors?.skid, DEFAULT_COLORS.skid),
    rotor: normalizeColor(options.colors?.rotor, DEFAULT_COLORS.rotor),
    tail: normalizeColor(options.colors?.tail, DEFAULT_COLORS.tail),
  };
  const key = [
    GENERATED_TEXTURE_PREFIX,
    Math.round(width),
    Math.round(height),
    colors.body.toString(16),
    colors.cabin.toString(16),
    colors.skid.toString(16),
    colors.rotor.toString(16),
    colors.tail.toString(16),
  ].join('-');

  if (!scene.textures.exists(key)) {
    const graphics = scene.make.graphics({ add: false });
    const textureWidth = Math.max(24, Math.round(width));
    const textureHeight = Math.max(14, Math.round(height));
    graphics.clear();

    const cx = textureWidth * 0.54;   // fuselage center x (shifted right, more room for tail left)
    const cy = textureHeight * 0.5;   // fuselage center y
    const bladeRadius = textureWidth * 0.39;

    // Tail boom (thin horizontal rect extending left from fuselage)
    graphics.fillStyle(colors.tail, 1);
    graphics.fillRect(
      textureWidth * 0.04,
      cy - textureHeight * 0.055,
      textureWidth * 0.37,
      textureHeight * 0.11,
    );

    // Tail rotor (vertical line at far left end of tail boom)
    graphics.lineStyle(Math.max(textureHeight * 0.07, 2), colors.rotor, 0.95);
    graphics.beginPath();
    graphics.moveTo(textureWidth * 0.08, cy - textureHeight * 0.18);
    graphics.lineTo(textureWidth * 0.08, cy + textureHeight * 0.18);
    graphics.strokePath();

    // Fuselage (filled ellipse, slightly elongated horizontally, centered)
    graphics.fillStyle(colors.body, 1);
    graphics.fillEllipse(cx, cy, textureWidth * 0.40, textureHeight * 0.40);

    // Cockpit bubble (bright ellipse on front/right side — forward direction indicator)
    graphics.fillStyle(colors.cabin, 1);
    graphics.fillEllipse(
      cx + textureWidth * 0.10,
      cy,
      textureWidth * 0.20,
      textureHeight * 0.24,
    );

    // Landing skids (two thin lines parallel to fuselage)
    graphics.lineStyle(Math.max(textureHeight * 0.045, 1.5), colors.skid, 0.9);
    graphics.beginPath();
    graphics.moveTo(textureWidth * 0.28, cy - textureHeight * 0.24);
    graphics.lineTo(cx + textureWidth * 0.11, cy - textureHeight * 0.24);
    graphics.moveTo(textureWidth * 0.28, cy + textureHeight * 0.24);
    graphics.lineTo(cx + textureWidth * 0.11, cy + textureHeight * 0.24);
    graphics.strokePath();

    // Main rotor blades (large cross on top)
    graphics.lineStyle(Math.max(textureHeight * 0.055, 2), colors.rotor, 0.88);
    graphics.beginPath();
    graphics.moveTo(cx - bladeRadius, cy);
    graphics.lineTo(cx + bladeRadius, cy);
    graphics.moveTo(cx, cy - bladeRadius);
    graphics.lineTo(cx, cy + bladeRadius);
    graphics.strokePath();

    // Main rotor disc outline (faint circle)
    graphics.lineStyle(1, colors.rotor, 0.20);
    graphics.strokeCircle(cx, cy, bladeRadius);

    graphics.generateTexture(key, textureWidth, textureHeight);
    graphics.destroy();
  }

  return key;
};

const createFallbackBody = (owner, hitboxWidth, hitboxHeight) => {
  const body = {
    gameObject: owner,
    x: owner.x - hitboxWidth * 0.5,
    y: owner.y - hitboxHeight * 0.5,
    width: hitboxWidth,
    height: hitboxHeight,
    halfWidth: hitboxWidth * 0.5,
    halfHeight: hitboxHeight * 0.5,
    center: {
      x: owner.x,
      y: owner.y,
    },
    velocity: {
      x: 0,
      y: 0,
    },
    setVelocity(x, y) {
      this.velocity.x = x;
      this.velocity.y = y;
      return this;
    },
    stop() {
      this.velocity.x = 0;
      this.velocity.y = 0;
      return this;
    },
  };

  return body;
};

const syncFallbackBody = (owner, body) => {
  if (!body) {
    return;
  }

  body.center.x = owner.x;
  body.center.y = owner.y;
  body.x = owner.x - body.halfWidth;
  body.y = owner.y - body.halfHeight;
};

const buildMovementConfig = (options = {}) => {
  const movementOptions = asOptionsObject(options.movement);

  return {
    ...DEFAULT_MOVEMENT_CONFIG,
    ...movementOptions,
  maxSpeed: toFiniteNumber(
    options.maxSpeed,
    toFiniteNumber(
        movementOptions.maxSpeed,
      DEFAULT_MOVEMENT_CONFIG.maxSpeed,
    ),
  ),
  acceleration: toFiniteNumber(
    options.acceleration,
    toFiniteNumber(
        movementOptions.acceleration,
      DEFAULT_MOVEMENT_CONFIG.acceleration,
    ),
  ),
  decelerationRadius: toFiniteNumber(
    options.decelerationRadius,
    toFiniteNumber(
        movementOptions.decelerationRadius,
      DEFAULT_MOVEMENT_CONFIG.decelerationRadius,
    ),
  ),
  stopThreshold: toFiniteNumber(
    options.stopThreshold,
    toFiniteNumber(
        movementOptions.stopThreshold,
      DEFAULT_MOVEMENT_CONFIG.stopThreshold,
    ),
  ),
  };
};

const buildRotationConfig = (options = {}) => {
  const rotationOptions = asOptionsObject(options.rotation);

  return {
    ...DEFAULT_ROTATION_CONFIG,
    ...rotationOptions,
  turnSpeed: toFiniteNumber(
    options.turnSpeed,
    toFiniteNumber(
        rotationOptions.turnSpeed,
      DEFAULT_ROTATION_CONFIG.turnSpeed,
    ),
  ),
  velocityThreshold: toFiniteNumber(
    options.velocityThreshold,
    toFiniteNumber(
        rotationOptions.velocityThreshold,
      DEFAULT_ROTATION_CONFIG.velocityThreshold,
    ),
  ),
  };
};

export default class Helicopter extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, options = {}) {
    const size = normalizeSize(options);
    const textureKey = textureKeyFor(scene, options, size.width, size.height);
    super(scene, x, y, textureKey, options.frame);

    this.scene.add.existing(this);

    this.setName(options.name ?? 'helicopter');
    this.setOrigin(0.5);
    this.setDepth(toFiniteNumber(options.depth, 5));
    this.setDisplaySize(size.width, size.height);
    this._baseDisplayWidth = size.width;
    this._baseDisplayHeight = size.height;

    this.movementController = new MovementController(buildMovementConfig(options));
    this.rotationController = new RotationController(buildRotationConfig(options));
    this.movementEventThreshold = Math.max(
      0,
      toFiniteNumber(
        options.movementEventThreshold,
        DEFAULT_MOVEMENT_EVENT_THRESHOLD,
      ),
    );
    this.wasMoving = false;
    this.fallbackBody = null;

    if (scene.physics?.add?.existing) {
      scene.physics.add.existing(this);
    } else {
      this.fallbackBody = createFallbackBody(
        this,
        this.displayWidth * 0.56,
        this.displayHeight * 0.42,
      );
    }

    const activeBody = this.getActiveBody();
    if (activeBody) {
      const hitboxWidth = Math.max(this.displayWidth * 0.56, 16);
      const hitboxHeight = Math.max(this.displayHeight * 0.42, 10);

      // Store the desired constant physics hitbox dimensions so setVisualScale can
      // keep them stable regardless of the visual sprite scale.
      this._physicsWidth = hitboxWidth;
      this._physicsHeight = hitboxHeight;

      if (typeof activeBody.setAllowGravity === 'function') {
        activeBody.setAllowGravity(false);
      }

      if (typeof activeBody.setMaxVelocity === 'function') {
        activeBody.setMaxVelocity(
          this.movementController.maxSpeed,
          this.movementController.maxSpeed,
        );
      }

      if (typeof activeBody.setDrag === 'function') {
        activeBody.setDrag(0, 0);
      }

      if (typeof activeBody.setDamping === 'function') {
        activeBody.setDamping(false);
      }

      if (typeof activeBody.setSize === 'function') {
        activeBody.setSize(hitboxWidth, hitboxHeight, true);
      }

      if (typeof activeBody.setCollideWorldBounds === 'function') {
        activeBody.setCollideWorldBounds(true);
      }

      if (activeBody === this.fallbackBody) {
        activeBody.width = hitboxWidth;
        activeBody.height = hitboxHeight;
        activeBody.halfWidth = hitboxWidth * 0.5;
        activeBody.halfHeight = hitboxHeight * 0.5;
        syncFallbackBody(this, activeBody);
      }
    }

    const initialHeading = toFiniteNumber(
      options.initialHeading ?? options.heading,
      typeof options.rotation === 'number' ? options.rotation : this.rotation,
    );
    this.setRotation(initialHeading);
    this.rotationController.heading = initialHeading;
    this.rotationController.initialized = true;
  }

  setTarget(x, y, options = {}) {
    this.movementController.setTarget(x, y, options);
    this.emit('targetchange', this.movementController.getTarget());
    return this;
  }

  setVisualScale(scale) {
    const absScale = Math.max(Math.abs(toFiniteNumber(scale, 1)), 0.0001);
    this.setScale?.(absScale);

    // Resize the physics body source dimensions so the actual hitbox stays at the
    // original constant size in world-units regardless of the visual scale.  Without
    // this, Phaser's updateBounds() resizes the hitbox every tick when scaleX changes,
    // shifting the body position and altering collision behaviour.
    const body = this.body;
    if (body && typeof body.setSize === 'function' && this._physicsWidth && this._physicsHeight) {
      body.setSize(this._physicsWidth / absScale, this._physicsHeight / absScale, true);
    }

    return this;
  }

  clearTarget() {
    const hadTarget = this.movementController.hasTarget();
    this.movementController.clearTarget();

    if (hadTarget) {
      this.emit('targetchange', null);
    }

    return this;
  }

  update(delta) {
    const activeBody = this.getActiveBody();
    if (!activeBody) {
      return;
    }

    const hadTarget = this.movementController.hasTarget();
    this.movementController.update(activeBody, delta);

    if (activeBody === this.fallbackBody) {
      const dt = Math.max(toFiniteNumber(delta, 0), 0) / 1000;
      this.x += toFiniteNumber(activeBody.velocity.x, 0) * dt;
      this.y += toFiniteNumber(activeBody.velocity.y, 0) * dt;
      syncFallbackBody(this, activeBody);
    }

    this.rotationController.update(this, activeBody.velocity, delta);

    if (hadTarget && !this.movementController.hasTarget()) {
      this.emit('targetchange', null);
    }

    const velocity = activeBody.velocity ?? { x: 0, y: 0 };
    const isMoving =
      velocity.x * velocity.x + velocity.y * velocity.y >=
      this.movementEventThreshold * this.movementEventThreshold;

    if (isMoving && !this.wasMoving) {
      this.emit('moving', {
        position: this.getPosition(),
        velocity: this.getVelocity(),
        target: this.movementController.getTarget(),
      });
    } else if (!isMoving && this.wasMoving) {
      this.emit('stopped', {
        position: this.getPosition(),
      });
    }

    this.wasMoving = isMoving;
  }

  getPosition() {
    const activeBody = this.getActiveBody();

    if (Number.isFinite(activeBody?.center?.x) && Number.isFinite(activeBody?.center?.y)) {
      return {
        x: activeBody.center.x,
        y: activeBody.center.y,
      };
    }

    return {
      x: this.x,
      y: this.y,
    };
  }

  getVelocity() {
    const velocity = this.getActiveBody()?.velocity;

    return {
      x: toFiniteNumber(velocity?.x, 0),
      y: toFiniteNumber(velocity?.y, 0),
    };
  }

  getBaseDisplaySize() {
    return {
      width: this._baseDisplayWidth,
      height: this._baseDisplayHeight,
    };
  }

  getActiveBody() {
    return this.body ?? this.fallbackBody;
  }
}
