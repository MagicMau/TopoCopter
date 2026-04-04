import { describe, it, expect } from 'vitest';
import MovementController from '../core/MovementController.js';

const makeBody = (cx, cy, vx = 0, vy = 0) => ({
  center: { x: cx, y: cy },
  velocity: { x: vx, y: vy },
});

describe('MovementController', () => {
  describe('constructor', () => {
    it('uses default config values', () => {
      const mc = new MovementController();
      expect(mc.maxSpeed).toBe(260);
      expect(mc.acceleration).toBe(720);
      expect(mc.decelerationRadius).toBe(180);
      expect(mc.stopThreshold).toBe(10);
    });

    it('accepts custom config', () => {
      const mc = new MovementController({ maxSpeed: 100, acceleration: 200, decelerationRadius: 50, stopThreshold: 5 });
      expect(mc.maxSpeed).toBe(100);
      expect(mc.acceleration).toBe(200);
      expect(mc.decelerationRadius).toBe(50);
      expect(mc.stopThreshold).toBe(5);
    });

    it('clamps negative values to 0', () => {
      const mc = new MovementController({ maxSpeed: -50, acceleration: -100, decelerationRadius: -20 });
      expect(mc.maxSpeed).toBe(0);
      expect(mc.acceleration).toBe(0);
      expect(mc.decelerationRadius).toBe(0);
    });

    it('ignores NaN config values and falls back to defaults', () => {
      const mc = new MovementController({ maxSpeed: NaN, acceleration: 'bad' });
      expect(mc.maxSpeed).toBe(260);
      expect(mc.acceleration).toBe(720);
    });
  });

  describe('target management', () => {
    it('initially has no target', () => {
      const mc = new MovementController();
      expect(mc.hasTarget()).toBe(false);
      expect(mc.getTarget()).toBeNull();
    });

    it('setTarget activates and stores target', () => {
      const mc = new MovementController();
      mc.setTarget(100, 200);
      expect(mc.hasTarget()).toBe(true);
      expect(mc.getTarget()).toEqual({ x: 100, y: 200 });
    });

    it('clearTarget deactivates target', () => {
      const mc = new MovementController();
      mc.setTarget(100, 200);
      mc.clearTarget();
      expect(mc.hasTarget()).toBe(false);
      expect(mc.getTarget()).toBeNull();
    });

    it('setTarget with NaN keeps previous target coords', () => {
      const mc = new MovementController();
      mc.setTarget(100, 200);
      mc.setTarget(NaN, NaN);
      expect(mc.getTarget()).toEqual({ x: 100, y: 200 });
    });

    it('setTarget returns this for chaining', () => {
      const mc = new MovementController();
      expect(mc.setTarget(1, 2)).toBe(mc);
    });

    it('clearTarget returns this for chaining', () => {
      const mc = new MovementController();
      expect(mc.clearTarget()).toBe(mc);
    });
  });

  describe('update() - no target (deceleration to rest)', () => {
    it('decelerates a moving body toward zero', () => {
      const mc = new MovementController({ acceleration: 500 });
      const body = makeBody(0, 0, 300, 0);
      mc.update(body, 16);
      expect(body.velocity.x).toBeLessThan(300);
      expect(body.velocity.x).toBeGreaterThanOrEqual(0);
    });

    it('decelerates in both axes simultaneously', () => {
      const mc = new MovementController({ acceleration: 200 });
      const body = makeBody(0, 0, 100, 100);
      mc.update(body, 16);
      expect(body.velocity.x).toBeLessThan(100);
      expect(body.velocity.y).toBeLessThan(100);
    });

    it('snaps velocity to zero when speed is within one acceleration step', () => {
      const mc = new MovementController({ acceleration: 500 });
      const body = makeBody(0, 0, 1, 0); // 1 px/s << one 16ms step of 500 acc = 8 px/s
      mc.update(body, 16);
      expect(body.velocity.x).toBe(0);
      expect(body.velocity.y).toBe(0);
    });

    it('does nothing with dt=0', () => {
      const mc = new MovementController();
      const body = makeBody(0, 0, 100, 50);
      mc.update(body, 0);
      expect(body.velocity.x).toBe(100);
      expect(body.velocity.y).toBe(50);
    });

    it('does nothing with null body', () => {
      const mc = new MovementController();
      expect(() => mc.update(null, 16)).not.toThrow();
    });
  });

  describe('update() - with target (acceleration toward target)', () => {
    it('accelerates body toward target from rest', () => {
      const mc = new MovementController({ maxSpeed: 260, acceleration: 720 });
      const body = makeBody(0, 0, 0, 0);
      mc.setTarget(1000, 0); // far away, purely horizontal
      mc.update(body, 16);
      expect(body.velocity.x).toBeGreaterThan(0);
      expect(body.velocity.y).toBeCloseTo(0, 2);
    });

    it('accelerates diagonally toward a diagonal target', () => {
      const mc = new MovementController({ maxSpeed: 260, acceleration: 1e6 });
      const body = makeBody(0, 0, 0, 0);
      mc.setTarget(1000, 1000);
      mc.update(body, 16);
      expect(body.velocity.x).toBeGreaterThan(0);
      expect(body.velocity.y).toBeGreaterThan(0);
      // Should be equal for a 45° approach
      expect(body.velocity.x).toBeCloseTo(body.velocity.y, 3);
    });

    it('does not exceed maxSpeed', () => {
      const mc = new MovementController({ maxSpeed: 100, acceleration: 1e9 });
      const body = makeBody(0, 0, 0, 0);
      mc.setTarget(10000, 0);
      mc.update(body, 16);
      const speed = Math.hypot(body.velocity.x, body.velocity.y);
      expect(speed).toBeLessThanOrEqual(100 + 0.001);
    });

    it('clears target and stops body when within stopThreshold', () => {
      const mc = new MovementController({ stopThreshold: 10 });
      const body = makeBody(995, 0, 0, 0); // 5 px from target, within 10px threshold
      mc.setTarget(1000, 0);
      mc.update(body, 16);
      expect(mc.hasTarget()).toBe(false);
      expect(body.velocity.x).toBe(0);
      expect(body.velocity.y).toBe(0);
    });

    it('decelerates inside decelerationRadius', () => {
      // Body at 80px from target, inside decelRadius=100, stopThreshold=5
      // With huge acceleration, velocity ≈ desiredSpeed
      // desiredSpeed = maxSpeed * (dist - stopThreshold) / (decelRadius - stopThreshold)
      //              = 200 * 75/95 ≈ 157.9
      const mc = new MovementController({
        maxSpeed: 200,
        acceleration: 1e9, // effectively instant velocity change
        decelerationRadius: 100,
        stopThreshold: 5,
      });
      const body = makeBody(0, 0, 0, 0);
      mc.setTarget(80, 0);
      mc.update(body, 16);
      const speed = Math.hypot(body.velocity.x, body.velocity.y);
      expect(speed).toBeLessThan(200);
      expect(speed).toBeGreaterThan(0);
      expect(speed).toBeCloseTo(157.9, 0);
    });

    it('speed outside decelerationRadius is not reduced by decel factor', () => {
      const mc = new MovementController({
        maxSpeed: 200,
        acceleration: 1e9,
        decelerationRadius: 100,
        stopThreshold: 5,
      });
      const body = makeBody(0, 0, 0, 0);
      mc.setTarget(500, 0); // well outside decelRadius
      mc.update(body, 16);
      const speed = Math.hypot(body.velocity.x, body.velocity.y);
      // Should be at maxSpeed (no deceleration factor applied)
      expect(speed).toBeCloseTo(200, 0);
    });
  });

  describe('snapOnArrival', () => {
    it('snaps body to exact target position when snapOnArrival=true and arrives', () => {
      const mc = new MovementController({ stopThreshold: 10 });
      const body = makeBody(995, 0, 0, 0);
      mc.setTarget(1000, 0, { snapOnArrival: true });
      mc.update(body, 16);
      expect(mc.hasTarget()).toBe(false);
      // Body should be snapped: body.center.x set to targetX
      expect(body.center.x).toBe(1000);
      expect(body.center.y).toBe(0);
    });
  });

  describe('body center resolution', () => {
    it('reads center from body.center when available', () => {
      const mc = new MovementController({ acceleration: 1e9 });
      const body = { center: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } };
      mc.setTarget(1000, 0);
      mc.update(body, 16);
      expect(body.velocity.x).toBeGreaterThan(0);
    });

    it('falls back to body.gameObject.x / .y', () => {
      const mc = new MovementController({ acceleration: 1e9 });
      const body = { gameObject: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } };
      mc.setTarget(1000, 0);
      mc.update(body, 16);
      expect(body.velocity.x).toBeGreaterThan(0);
    });

    it('falls back to body.x + halfWidth', () => {
      const mc = new MovementController({ acceleration: 1e9 });
      const body = { x: -16, y: -16, halfWidth: 16, halfHeight: 16, velocity: { x: 0, y: 0 } };
      mc.setTarget(1000, 0); // body center is at (0, 0)
      mc.update(body, 16);
      expect(body.velocity.x).toBeGreaterThan(0);
    });
  });
});
