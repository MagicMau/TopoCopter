import { describe, it, expect } from 'vitest';
import CameraController from '../core/CameraController.js';

const makeCamera = (scrollX = 0, scrollY = 0, width = 800, height = 600, zoom = 1) => ({
  scrollX,
  scrollY,
  width,
  height,
  zoom,
  get displayWidth() { return this.width / this.zoom; },
  get displayHeight() { return this.height / this.zoom; },
  setScroll(x, y) { this.scrollX = x; this.scrollY = y; },
});

const makeTarget = (x, y) => ({ x, y });

describe('CameraController', () => {
  describe('constructor options', () => {
    it('uses default followLag of 0.18', () => {
      const cc = new CameraController(makeCamera(), makeTarget(0, 0));
      expect(cc.followLag).toBeCloseTo(0.18);
    });

    it('accepts custom followLag', () => {
      const cc = new CameraController(makeCamera(), makeTarget(0, 0), { followLag: 0.5 });
      expect(cc.followLag).toBeCloseTo(0.5);
    });

    it('clamps negative followLag to 0', () => {
      const cc = new CameraController(makeCamera(), makeTarget(0, 0), { followLag: -1 });
      expect(cc.followLag).toBe(0);
    });

    it('stores deadzoneWidth and deadzoneHeight', () => {
      const cc = new CameraController(makeCamera(), makeTarget(0, 0), { deadzoneWidth: 120, deadzoneHeight: 80 });
      expect(cc.deadzoneWidth).toBe(120);
      expect(cc.deadzoneHeight).toBe(80);
    });

    it('starts enabled and unpaused', () => {
      const cc = new CameraController(makeCamera(), makeTarget(0, 0));
      expect(cc.enabled).toBe(true);
      expect(cc.paused).toBe(false);
    });
  });

  describe('zoom-aware scroll centering (followLag=0)', () => {
    it('centers target in viewport at zoom=1', () => {
      // 800×600 camera; target at (400,300) → ideal scroll = (0,0)
      const cam = makeCamera(0, 0, 800, 600, 1);
      const cc = new CameraController(cam, makeTarget(400, 300), { followLag: 0 });
      cc.update(16);
      expect(cam.scrollX).toBeCloseTo(0);
      expect(cam.scrollY).toBeCloseTo(0);
    });

    it('adjusts scroll for zoom=2 (viewport shows smaller world area)', () => {
      // zoom=2 → camWidth in world-units = 800/2 = 400
      // idealScrollX = 400 - 800*0.5/2 = 400 - 200 = 200
      // idealScrollY = 300 - 600*0.5/2 = 300 - 150 = 150
      const cam = makeCamera(0, 0, 800, 600, 2);
      const cc = new CameraController(cam, makeTarget(400, 300), { followLag: 0 });
      cc.update(16);
      expect(cam.scrollX).toBeCloseTo(200);
      expect(cam.scrollY).toBeCloseTo(150);
    });

    it('adjusts scroll for zoom=0.5 (viewport shows larger world area)', () => {
      // idealScrollX = 400 - 800*0.5/0.5 = 400 - 800 = -400
      // idealScrollY = 300 - 600*0.5/0.5 = 300 - 600 = -300
      const cam = makeCamera(0, 0, 800, 600, 0.5);
      const cc = new CameraController(cam, makeTarget(400, 300), { followLag: 0 });
      cc.update(16);
      expect(cam.scrollX).toBeCloseTo(-400);
      expect(cam.scrollY).toBeCloseTo(-300);
    });

    it('moves camera when target changes', () => {
      const cam = makeCamera(0, 0, 800, 600, 1);
      const cc = new CameraController(cam, makeTarget(400, 300), { followLag: 0 });
      cc.update(16);
      expect(cam.scrollX).toBeCloseTo(0);

      cc.setTarget(makeTarget(800, 300));
      cc.update(16);
      expect(cam.scrollX).toBeCloseTo(400); // 800 - 400
    });
  });

  describe('deadzone behavior (followLag=0)', () => {
    it('does not scroll when target sits at viewport centre', () => {
      // Target at pixel (400,300) → screen offset (0,0) → within any deadzone
      const cam = makeCamera(0, 0, 800, 600, 1);
      const cc = new CameraController(cam, makeTarget(400, 300), {
        followLag: 0,
        deadzoneWidth: 200,
        deadzoneHeight: 150,
      });
      cc.update(16);
      expect(cam.scrollX).toBeCloseTo(0);
      expect(cam.scrollY).toBeCloseTo(0);
    });

    it('does not scroll when target is within deadzone but off-centre', () => {
      // Target at (420,310) → offsetX=20, offsetY=10; halfDZW=100, halfDZH=75 → within
      const cam = makeCamera(0, 0, 800, 600, 1);
      const cc = new CameraController(cam, makeTarget(420, 310), {
        followLag: 0,
        deadzoneWidth: 200,
        deadzoneHeight: 150,
      });
      cc.update(16);
      expect(cam.scrollX).toBeCloseTo(0);
      expect(cam.scrollY).toBeCloseTo(0);
    });

    it('scrolls right when target exits deadzone to the right', () => {
      // Target at (600, 300); offsetX = (600-0)*1 - 400 = 200; halfDZW = 50
      // 200 > 50 → desiredScrollX = 600 - (400+50)/1 = 150
      const cam = makeCamera(0, 0, 800, 600, 1);
      const cc = new CameraController(cam, makeTarget(600, 300), {
        followLag: 0,
        deadzoneWidth: 100,
        deadzoneHeight: 100,
      });
      cc.update(16);
      expect(cam.scrollX).toBeCloseTo(150);
      expect(cam.scrollY).toBeCloseTo(0); // vertical offset = 0, within deadzone
    });

    it('scrolls left when target exits deadzone to the left', () => {
      // Target at (200, 300); offsetX = (200-0)*1 - 400 = -200; halfDZW = 50
      // -200 < -50 → desiredScrollX = 200 - (400-50)/1 = -150
      const cam = makeCamera(0, 0, 800, 600, 1);
      const cc = new CameraController(cam, makeTarget(200, 300), {
        followLag: 0,
        deadzoneWidth: 100,
        deadzoneHeight: 100,
      });
      cc.update(16);
      expect(cam.scrollX).toBeCloseTo(-150);
      expect(cam.scrollY).toBeCloseTo(0);
    });

    it('scrolls down when target exits deadzone below', () => {
      // Target at (400, 500); offsetY = (500-0)*1 - 300 = 200; halfDZH = 50
      // 200 > 50 → desiredScrollY = 500 - (300+50)/1 = 150
      const cam = makeCamera(0, 0, 800, 600, 1);
      const cc = new CameraController(cam, makeTarget(400, 500), {
        followLag: 0,
        deadzoneWidth: 100,
        deadzoneHeight: 100,
      });
      cc.update(16);
      expect(cam.scrollY).toBeCloseTo(150);
      expect(cam.scrollX).toBeCloseTo(0);
    });
  });

  describe('scroll clamping with world bounds', () => {
    it('clamps scroll when world exactly matches viewport (nowhere to scroll)', () => {
      // World 800×600 = viewport → scroll locked at (0,0)
      const cam = makeCamera(0, 0, 800, 600, 1);
      const cc = new CameraController(cam, makeTarget(100_000, 100_000), {
        followLag: 0,
        worldWidth: 800,
        worldHeight: 600,
      });
      cc.update(16);
      expect(cam.scrollX).toBeCloseTo(0);
      expect(cam.scrollY).toBeCloseTo(0);
    });

    it('allows unclamped scroll within a larger world', () => {
      // World 2000×1500; target at (1500,1000)
      // idealScrollX = 1500 - 400 = 1100; bounds [0, 1200] → 1100 unclamped
      // idealScrollY = 1000 - 300 = 700; bounds [0, 900] → 700 unclamped
      const cam = makeCamera(0, 0, 800, 600, 1);
      const cc = new CameraController(cam, makeTarget(1500, 1000), {
        followLag: 0,
        worldWidth: 2000,
        worldHeight: 1500,
      });
      cc.update(16);
      expect(cam.scrollX).toBeCloseTo(1100);
      expect(cam.scrollY).toBeCloseTo(700);
    });

    it('clamps scroll to the right edge of the world', () => {
      // World 2000×1500; target far right at (10000, 750)
      // idealScrollX >> maxScrollX of 1200 → clamped to 1200
      const cam = makeCamera(0, 0, 800, 600, 1);
      const cc = new CameraController(cam, makeTarget(10_000, 750), {
        followLag: 0,
        worldWidth: 2000,
        worldHeight: 1500,
      });
      cc.update(16);
      expect(cam.scrollX).toBeCloseTo(1200);
    });
  });

  describe('follow lag', () => {
    it('with followLag > 0 does not reach target scroll in one step', () => {
      const cam = makeCamera(0, 0, 800, 600, 1);
      // Target requires scroll to (1600, 900)
      const cc = new CameraController(cam, makeTarget(2000, 1200), { followLag: 0.18 });
      cc.update(16);
      // Should be moving toward destination but not there yet
      expect(cam.scrollX).toBeGreaterThan(0);
      expect(cam.scrollX).toBeLessThan(1600);
    });

    it('with followLag=0 reaches target scroll immediately', () => {
      const cam = makeCamera(0, 0, 800, 600, 1);
      const cc = new CameraController(cam, makeTarget(2000, 1200), { followLag: 0 });
      cc.update(16);
      expect(cam.scrollX).toBeCloseTo(1600);
      expect(cam.scrollY).toBeCloseTo(900);
    });

    it('exponentially converges over multiple updates', () => {
      const cam = makeCamera(0, 0, 800, 600, 1);
      const cc = new CameraController(cam, makeTarget(2000, 1200), { followLag: 0.18 });
      let prevX = cam.scrollX;
      let prevStep = Infinity;
      for (let i = 0; i < 5; i++) {
        cc.update(16);
        const step = cam.scrollX - prevX;
        expect(step).toBeLessThan(prevStep);
        prevStep = step;
        prevX = cam.scrollX;
      }
    });
  });

  describe('enable / pause', () => {
    it('does not update scroll when disabled', () => {
      const cam = makeCamera(0, 0, 800, 600, 1);
      const cc = new CameraController(cam, makeTarget(1000, 1000), { followLag: 0 });
      cc.setEnabled(false);
      cc.update(16);
      expect(cam.scrollX).toBe(0);
      expect(cam.scrollY).toBe(0);
    });

    it('does not update scroll when paused', () => {
      const cam = makeCamera(0, 0, 800, 600, 1);
      const cc = new CameraController(cam, makeTarget(1000, 1000), { followLag: 0 });
      cc.pause();
      cc.update(16);
      expect(cam.scrollX).toBe(0);
      expect(cam.scrollY).toBe(0);
    });

    it('resumes scrolling after unpause', () => {
      const cam = makeCamera(0, 0, 800, 600, 1);
      const cc = new CameraController(cam, makeTarget(1000, 800), { followLag: 0 });
      cc.pause();
      cc.update(16);
      expect(cam.scrollX).toBe(0);
      cc.resume();
      cc.update(16);
      expect(cam.scrollX).toBeCloseTo(600);
    });
  });

  describe('snapToTarget', () => {
    it('immediately sets scroll to desired position', () => {
      const cam = makeCamera(0, 0, 800, 600, 1);
      const cc = new CameraController(cam, makeTarget(1000, 800), { followLag: 1 });
      cc.snapToTarget();
      expect(cam.scrollX).toBeCloseTo(600);
      expect(cam.scrollY).toBeCloseTo(500);
    });
  });

  describe('custom getTargetPosition', () => {
    it('uses getTargetPosition callback when provided', () => {
      const cam = makeCamera(0, 0, 800, 600, 1);
      const cc = new CameraController(cam, null, {
        followLag: 0,
        getTargetPosition: () => ({ x: 1000, y: 800 }),
      });
      cc.update(16);
      expect(cam.scrollX).toBeCloseTo(600);
      expect(cam.scrollY).toBeCloseTo(500);
    });
  });
});
