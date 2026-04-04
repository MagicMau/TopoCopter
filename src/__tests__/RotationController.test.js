import { describe, it, expect } from 'vitest';
import RotationController from '../core/RotationController.js';

const makeObj = (rotation = 0) => {
  const obj = { rotation, _applied: null };
  obj.setRotation = (r) => { obj._applied = r; obj.rotation = r; };
  return obj;
};

const makeObjNoSetRotation = (rotation = 0) => ({ rotation });

const makeObjAngle = (angleDeg) => ({ angle: angleDeg });

describe('RotationController', () => {
  describe('constructor', () => {
    it('uses default config values', () => {
      const rc = new RotationController();
      expect(rc.turnSpeed).toBeCloseTo(Math.PI * 4);
      expect(rc.velocityThreshold).toBe(10);
      expect(rc.heading).toBe(0);
      expect(rc.initialized).toBe(false);
    });

    it('accepts custom config', () => {
      const rc = new RotationController({ turnSpeed: Math.PI, velocityThreshold: 5 });
      expect(rc.turnSpeed).toBeCloseTo(Math.PI);
      expect(rc.velocityThreshold).toBe(5);
    });

    it('clamps negative turnSpeed and velocityThreshold to 0', () => {
      const rc = new RotationController({ turnSpeed: -10, velocityThreshold: -5 });
      expect(rc.turnSpeed).toBe(0);
      expect(rc.velocityThreshold).toBe(0);
    });

    it('ignores NaN values and falls back to defaults', () => {
      const rc = new RotationController({ turnSpeed: NaN, velocityThreshold: 'bad' });
      expect(rc.turnSpeed).toBeCloseTo(Math.PI * 4);
      expect(rc.velocityThreshold).toBe(10);
    });
  });

  describe('initialization from gameObject', () => {
    it('reads rotation from gameObject.rotation on first update', () => {
      const rc = new RotationController();
      const obj = makeObj(1.2);
      rc.update(obj, { x: 0, y: 0 }, 16);
      expect(rc.initialized).toBe(true);
      expect(rc.getHeading()).toBeCloseTo(1.2);
    });

    it('reads rotation from gameObject.angle when .rotation is absent', () => {
      const rc = new RotationController();
      const obj = makeObjAngle(90); // 90° = π/2
      rc.update(obj, { x: 0, y: 0 }, 16);
      expect(rc.getHeading()).toBeCloseTo(Math.PI / 2);
    });

    it('defaults to 0 when gameObject has no rotation or angle', () => {
      const rc = new RotationController();
      rc.update({}, { x: 0, y: 0 }, 16);
      expect(rc.getHeading()).toBe(0);
    });

    it('normalizes large rotation angle (5π → π) on init', () => {
      const rc = new RotationController();
      const obj = makeObj(5 * Math.PI); // 5π % 2π = π; π > π is false → π
      rc.update(obj, { x: 0, y: 0 }, 16);
      expect(rc.getHeading()).toBeCloseTo(Math.PI);
    });

    it('normalizes exactly -π to +π on init', () => {
      // normalizeAngle(-π): -π <= -π → add 2π → +π
      const rc = new RotationController();
      const obj = makeObj(-Math.PI);
      rc.update(obj, { x: 0, y: 0 }, 16);
      expect(rc.getHeading()).toBeCloseTo(Math.PI);
    });

    it('normalizes just-above-π to just-below -π on init', () => {
      // normalizeAngle(π + 0.001): > π → subtract 2π → ≈ -π + 0.001
      const rc = new RotationController();
      const obj = makeObj(Math.PI + 0.001);
      rc.update(obj, { x: 0, y: 0 }, 16);
      expect(rc.getHeading()).toBeCloseTo(-Math.PI + 0.001, 4);
    });
  });

  describe('heading hold below velocity threshold', () => {
    it('holds current heading when speed is below threshold (default 10)', () => {
      const rc = new RotationController({ velocityThreshold: 10 });
      const obj = makeObj(0.5);
      rc.update(obj, { x: 0, y: 0 }, 16); // init
      const held = rc.getHeading();
      rc.update(obj, { x: 5, y: 0 }, 16); // speed=5 < threshold=10
      expect(rc.getHeading()).toBeCloseTo(held);
    });

    it('applies the held heading to gameObject via setRotation', () => {
      const rc = new RotationController({ velocityThreshold: 10 });
      const obj = makeObj(1.0);
      rc.update(obj, { x: 0, y: 0 }, 16); // init at 1.0
      obj._applied = null;
      rc.update(obj, { x: 3, y: 0 }, 16); // speed=3 < threshold
      expect(obj._applied).toBeCloseTo(1.0);
    });

    it('applies heading via rotation property when setRotation is absent', () => {
      const rc = new RotationController({ velocityThreshold: 10 });
      const obj = makeObjNoSetRotation(0.7);
      rc.update(obj, { x: 0, y: 0 }, 16); // init at 0.7
      obj.rotation = 999; // reset to verify overwrite
      rc.update(obj, { x: 2, y: 0 }, 16); // speed < threshold
      expect(obj.rotation).toBeCloseTo(0.7);
    });

    it('returns current heading when below threshold', () => {
      const rc = new RotationController({ velocityThreshold: 10 });
      const obj = makeObj(1.3);
      rc.update(obj, { x: 0, y: 0 }, 16);
      const returned = rc.update(obj, { x: 1, y: 0 }, 16);
      expect(returned).toBeCloseTo(1.3);
    });
  });

  describe('rotation toward target heading', () => {
    it('advances heading toward target by at most maxTurn per step', () => {
      // turnSpeed = π rad/s; dt = 100ms → maxTurn = 0.1π ≈ 0.314 rad
      const rc = new RotationController({ turnSpeed: Math.PI, velocityThreshold: 0 });
      const obj = makeObj(0);
      rc.update(obj, { x: 0, y: 0 }, 16); // init at 0
      // Target heading: atan2(0, 1) = 0, but let's aim at 1.0 rad by going (cos1, sin1)
      const targetAngle = 1.0;
      const vx = Math.cos(targetAngle) * 100;
      const vy = Math.sin(targetAngle) * 100;
      const maxTurn = Math.PI * (100 / 1000); // 100ms
      rc.update(obj, { x: vx, y: vy }, 100);
      expect(Math.abs(rc.getHeading())).toBeLessThanOrEqual(maxTurn + 1e-9);
    });

    it('snaps to target heading when delta is within one maxTurn step', () => {
      // Very large turnSpeed, small delta heading
      const rc = new RotationController({ turnSpeed: Math.PI * 100, velocityThreshold: 0 });
      const obj = makeObj(0);
      rc.update(obj, { x: 0, y: 0 }, 16); // init at 0
      const targetAngle = 0.05; // tiny delta
      const vx = Math.cos(targetAngle) * 100;
      const vy = Math.sin(targetAngle) * 100;
      rc.update(obj, { x: vx, y: vy }, 16);
      expect(rc.getHeading()).toBeCloseTo(targetAngle, 5);
    });

    it('snaps immediately to target heading when dt=0', () => {
      const rc = new RotationController({ turnSpeed: 1, velocityThreshold: 0 });
      const obj = makeObj(0);
      rc.update(obj, { x: 0, y: 0 }, 16); // init at 0
      const targetAngle = 1.5;
      const vx = Math.cos(targetAngle) * 100;
      const vy = Math.sin(targetAngle) * 100;
      rc.update(obj, { x: vx, y: vy }, 0); // dt=0
      expect(rc.getHeading()).toBeCloseTo(targetAngle, 5);
    });

    it('takes shortest path CCW when crossing the ±π boundary', () => {
      // From 150° (5π/6) to -150° (-5π/6): short path is 60° CCW (through ±180°)
      const rc = new RotationController({ turnSpeed: Math.PI, velocityThreshold: 0 });
      const obj = makeObj((5 * Math.PI) / 6);
      rc.update(obj, { x: 0, y: 0 }, 16); // init at 5π/6
      // Velocity pointing at -5π/6
      const vx = Math.cos((-5 * Math.PI) / 6) * 100;
      const vy = Math.sin((-5 * Math.PI) / 6) * 100;
      const prevHeading = rc.getHeading();
      rc.update(obj, { x: vx, y: vy }, 16);
      // deltaHeading ≈ +π/3 (CCW) → heading should increase toward π
      expect(rc.getHeading()).toBeGreaterThan(prevHeading);
    });

    it('eventually reaches target via shortest path', () => {
      // Same scenario but with enough steps to arrive
      const rc = new RotationController({ turnSpeed: Math.PI * 20, velocityThreshold: 0 });
      const obj = makeObj((5 * Math.PI) / 6);
      rc.update(obj, { x: 0, y: 0 }, 16); // init
      const vx = Math.cos((-5 * Math.PI) / 6) * 100;
      const vy = Math.sin((-5 * Math.PI) / 6) * 100;
      for (let i = 0; i < 20; i++) {
        rc.update(obj, { x: vx, y: vy }, 16);
      }
      expect(rc.getHeading()).toBeCloseTo((-5 * Math.PI) / 6, 3);
    });

    it('takes shortest path CW when target is slightly behind in the negative direction', () => {
      // From 0.5 rad to -0.5 rad: short path is 1 rad CW (negative direction)
      const rc = new RotationController({ turnSpeed: Math.PI * 10, velocityThreshold: 0 });
      const obj = makeObj(0.5);
      rc.update(obj, { x: 0, y: 0 }, 16); // init at 0.5
      const targetAngle = -0.5;
      const vx = Math.cos(targetAngle) * 100;
      const vy = Math.sin(targetAngle) * 100;
      rc.update(obj, { x: vx, y: vy }, 16);
      // Should have moved toward -0.5 (decreased from 0.5)
      expect(rc.getHeading()).toBeLessThan(0.5);
    });

    it('handles null gameObject without throwing', () => {
      const rc = new RotationController();
      rc.initialized = true;
      expect(() => rc.update(null, { x: 100, y: 0 }, 16)).not.toThrow();
    });
  });

  describe('getHeading()', () => {
    it('returns 0 before any update', () => {
      const rc = new RotationController();
      expect(rc.getHeading()).toBe(0);
    });

    it('returns the current heading after an update', () => {
      const rc = new RotationController({ velocityThreshold: 0 });
      const obj = makeObj(0);
      rc.update(obj, { x: 0, y: 0 }, 16); // init at 0
      const vx = Math.cos(0.8) * 100;
      const vy = Math.sin(0.8) * 100;
      rc.update(obj, { x: vx, y: vy }, 16);
      expect(rc.getHeading()).toBe(rc.heading);
    });
  });
});
