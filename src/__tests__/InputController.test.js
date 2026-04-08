import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Math: {
      Clamp: (v, min, max) => Math.min(Math.max(v, min), max),
      Distance: { Between: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay) },
      Vector2: class { constructor(x = 0, y = 0) { this.x = x; this.y = y; } },
    },
    Scene: class {
      constructor() {
        this.time = { now: 0 };
        this.input = {
          on: () => {},
          off: () => {},
          manager: { pointers: [] },
          pointers: [],
        };
      }
    },
  },
}));

import InputController from '../core/InputController.js';

const makeCamera = (scrollX = 0, scrollY = 0, width = 1024, height = 768, zoom = 1) => ({
  scrollX, scrollY, width, height, zoom,
  x: 0, y: 0,
  useBounds: false,
  get displayWidth() { return this.width / this.zoom; },
  get displayHeight() { return this.height / this.zoom; },
  setZoom(z) { this.zoom = z; },
  setScroll(x, y) { this.scrollX = x; this.scrollY = y; },
});

const makeScene = (camera) => ({
  time: { now: 0 },
  cameras: { main: camera },
  input: {
    on: () => {},
    off: () => {},
    manager: { pointers: [] },
    pointers: [],
  },
});

const makeInputController = (opts = {}) => {
  const camera = opts.camera ?? makeCamera();
  const scene = makeScene(camera);
  return new InputController(scene, {
    camera,
    worldWidth: opts.worldWidth ?? 4096,
    worldHeight: opts.worldHeight ?? 2048,
    minZoom: opts.minZoom ?? 0.25,
    maxZoom: opts.maxZoom ?? 10,
    ...opts.extra,
  });
};

// ─── clampCamera ──────────────────────────────────────────────────────────────
describe('InputController.clampCamera', () => {
  describe('correct world-unit formula at various zoom levels', () => {
    it('does not clamp when scroll is in bounds at zoom=1', () => {
      const cam = makeCamera(500, 200, 1024, 768, 1);
      const ic = makeInputController({ camera: cam });
      cam.scrollX = 500;
      cam.scrollY = 200;
      ic.clampCamera();
      expect(cam.scrollX).toBeCloseTo(500);
      expect(cam.scrollY).toBeCloseTo(200);
    });

    it('clamps to left boundary at zoom=1', () => {
      const cam = makeCamera(-100, 0, 1024, 768, 1);
      const ic = makeInputController({ camera: cam });
      ic.clampCamera();
      expect(cam.scrollX).toBeCloseTo(0);
    });

    it('clamps to right boundary at zoom=1', () => {
      // At zoom=1 the camera scroll aligns with the visible world left edge.
      const cam = makeCamera(9999, 0, 1024, 768, 1);
      const ic = makeInputController({ camera: cam });
      ic.clampCamera();
      expect(cam.scrollX).toBeCloseTo(3072);
    });

    it('clamps to correct right boundary at zoom=4', () => {
      // viewWidth = 1024/4 = 256; maxScrollX = 4096 - 512 - 128 = 3456
      const cam = makeCamera(9999, 0, 1024, 768, 4);
      const ic = makeInputController({ camera: cam });
      ic.clampCamera();
      expect(cam.scrollX).toBeCloseTo(3456);
    });

    it('allows scroll up to right boundary at zoom=4', () => {
      const cam = makeCamera(3456, 0, 1024, 768, 4);
      const ic = makeInputController({ camera: cam });
      ic.clampCamera();
      expect(cam.scrollX).toBeCloseTo(3456);
    });

    it('centers world when view is wider than world (zoom-out past fit)', () => {
      // The visible rect is centred while the Phaser scroll stays at 0.
      const cam = makeCamera(0, 0, 1024, 768, 0.25);
      const ic = makeInputController({ camera: cam, worldWidth: 1024, worldHeight: 768 });
      ic.clampCamera();
      expect(cam.scrollX).toBeCloseTo(0);
    });
  });

  describe('getWorldPointFromCanvas formula', () => {
    it('returns world center at screen center when camera is centered on target', () => {
      const cam = makeCamera(1488, 616, 1024, 768, 4);
      const scene = makeScene(cam);
      const ic = new InputController(scene, {
        camera: cam, worldWidth: 4096, worldHeight: 2048,
        minZoom: 0.25, maxZoom: 10,
      });
      const pt = ic.getWorldPointFromCanvas(512, 384, 4);
      expect(pt.x).toBeCloseTo(2000);
      expect(pt.y).toBeCloseTo(1000);
    });

    it('returns correct world position for off-centre click at zoom=2', () => {
      // At zoom=2 the visible world top-left is shifted from the raw scroll.
      const cam = makeCamera(500, 300, 1024, 768, 2);
      const scene = makeScene(cam);
      const ic = new InputController(scene, {
        camera: cam, worldWidth: 4096, worldHeight: 2048,
        minZoom: 0.25, maxZoom: 10,
      });
      const pt = ic.getWorldPointFromCanvas(0, 0, 2);
      expect(pt.x).toBeCloseTo(756);
      expect(pt.y).toBeCloseTo(492);
    });
  });

  describe('getZoomAnchor callback', () => {
    it('uses mouse position when no getZoomAnchor provided', () => {
      // Handled via handleWheel internals; just verify option is stored
      const cam = makeCamera(0, 0, 1024, 768, 1);
      const scene = makeScene(cam);
      const ic = new InputController(scene, {
        camera: cam, worldWidth: 4096, worldHeight: 2048,
        minZoom: 0.25, maxZoom: 10,
      });
      expect(ic.getZoomAnchor).toBeNull();
    });

    it('stores provided getZoomAnchor callback', () => {
      const anchor = () => ({ x: 512, y: 384 });
      const cam = makeCamera(0, 0, 1024, 768, 1);
      const scene = makeScene(cam);
      const ic = new InputController(scene, {
        camera: cam, worldWidth: 4096, worldHeight: 2048,
        minZoom: 0.25, maxZoom: 10,
        getZoomAnchor: anchor,
      });
      expect(ic.getZoomAnchor).toBe(anchor);
    });

    it('allows wheel zoom to use separate screen and anchor positions', () => {
      const cam = makeCamera(0, 0, 1024, 768, 1);
      const ic = makeInputController({
        camera: cam,
        extra: {
          getZoomAnchor: () => ({
            screenX: 512,
            screenY: 384,
            anchorX: 240,
            anchorY: 180,
          }),
        },
      });
      ic.zoomTo = vi.fn();

      ic.handleWheel(
        { x: 200, y: 300, event: { preventDefault: vi.fn() } },
        null,
        0,
        -100,
        0,
        { preventDefault: vi.fn() },
      );

      expect(ic.zoomTo).toHaveBeenCalledWith(expect.any(Number), 512, 384, 240, 180);
    });

    it('applies getZoomAnchor to pinch zoom as well', () => {
      const cam = makeCamera(0, 0, 1024, 768, 1);
      const ic = makeInputController({
        camera: cam,
        extra: {
          getZoomAnchor: () => ({
            screenX: 512,
            screenY: 384,
            anchorX: 256,
            anchorY: 192,
          }),
        },
      });
      ic.zoomTo = vi.fn();
      ic.lastPinchDistance = 100;
      ic.lastPinchMidX = 300;
      ic.lastPinchMidY = 250;

      ic.updatePinch(
        { x: 200, y: 250, id: 1, isDown: true, pointerType: 'touch' },
        { x: 420, y: 250, id: 2, isDown: true, pointerType: 'touch' },
      );

      expect(ic.zoomTo).toHaveBeenCalledWith(expect.any(Number), 512, 384, 256, 192);
    });
  });
});

// ─── zoomLocked / dragLocked ──────────────────────────────────────────────────

describe('InputController zoom and drag locking', () => {
  it('zoomLocked defaults to false', () => {
    const ic = makeInputController();
    expect(ic.zoomLocked).toBe(false);
  });

  it('dragLocked defaults to false', () => {
    const ic = makeInputController();
    expect(ic.dragLocked).toBe(false);
  });

  it('accepts zoomLocked: true from options', () => {
    const ic = makeInputController({ extra: { zoomLocked: true } });
    expect(ic.zoomLocked).toBe(true);
  });

  it('accepts dragLocked: true from options', () => {
    const ic = makeInputController({ extra: { dragLocked: true } });
    expect(ic.dragLocked).toBe(true);
  });

  describe('zoomLocked prevents wheel zoom', () => {
    it('does not change camera zoom on wheel when locked', () => {
      const cam = makeCamera(0, 0, 1024, 768, 1);
      const ic = makeInputController({ camera: cam, extra: { zoomLocked: true } });
      const fakePointer = {
        x: 512, y: 384,
        event: { preventDefault: () => {} },
      };
      // deltaY > 0 normally zooms out
      ic.handleWheel(fakePointer, null, 0, 100, 0);
      expect(cam.zoom).toBe(1); // unchanged
    });

    it('does change camera zoom on wheel when not locked', () => {
      const cam = makeCamera(0, 0, 1024, 768, 1);
      const ic = makeInputController({ camera: cam, extra: { zoomLocked: false } });
      const fakePointer = {
        x: 512, y: 384,
        event: { preventDefault: () => {} },
      };
      ic.handleWheel(fakePointer, null, 0, 100, 0);
      expect(cam.zoom).not.toBe(1); // changed
    });
  });

  describe('zoomLocked prevents pinch zoom', () => {
    it('does not change camera zoom on pinch when locked', () => {
      const cam = makeCamera(0, 0, 1024, 768, 1);
      const ic = makeInputController({ camera: cam, extra: { zoomLocked: true } });
      const pA = { x: 200, y: 300, id: 1, isDown: true, pointerType: 'touch' };
      const pB = { x: 400, y: 300, id: 2, isDown: true, pointerType: 'touch' };
      ic.beginPinch(pA, pB);
      // spread fingers → normally would zoom in
      ic.updatePinch({ ...pA, x: 100 }, { ...pB, x: 500 });
      expect(cam.zoom).toBe(1);
    });
  });

  describe('dragLocked prevents camera pan', () => {
    it('does not start a drag when locked', () => {
      const cam = makeCamera(0, 0, 1024, 768, 1);
      const ic = makeInputController({ camera: cam, extra: { dragLocked: true } });
      const pointer = { id: 1, x: 100, y: 100, isDown: true, pointerType: 'mouse' };
      ic.beginDrag(pointer);
      expect(ic.dragging).toBe(false);
    });

    it('allows drag when not locked', () => {
      const cam = makeCamera(0, 0, 1024, 768, 1);
      const ic = makeInputController({ camera: cam, extra: { dragLocked: false } });
      const pointer = { id: 1, x: 100, y: 100, isDown: true, pointerType: 'mouse' };
      ic.beginDrag(pointer);
      expect(ic.dragging).toBe(true);
    });

    it('does not move camera scroll when dragLocked and dragging was somehow started', () => {
      const cam = makeCamera(500, 500, 1024, 768, 1);
      const ic = makeInputController({ camera: cam, extra: { dragLocked: false } });

      const pointer = { id: 1, x: 100, y: 100, isDown: true, pointerType: 'mouse' };
      ic.beginDrag(pointer);
      expect(ic.dragging).toBe(true);

      // now lock drag mid-session and simulate pointer move
      ic.dragLocked = true;
      const movedPointer = { ...pointer, x: 200, y: 200 };
      ic.handlePointerMove(movedPointer);
      // scroll should not change
      expect(cam.scrollX).toBeCloseTo(500);
      expect(cam.scrollY).toBeCloseTo(500);
    });
  });

  describe('combined lock: zoom and drag both locked', () => {
    it('zoom stays the same across wheel, pinch, and beginDrag', () => {
      const cam = makeCamera(0, 0, 800, 600, 2);
      const ic = makeInputController({
        camera: cam,
        extra: { zoomLocked: true, dragLocked: true, minZoom: 2, maxZoom: 2 },
      });

      const fakePointer = { x: 400, y: 300, event: { preventDefault: () => {} } };
      ic.handleWheel(fakePointer, null, 0, 100, 0);
      expect(cam.zoom).toBe(2);

      const pA = { x: 200, y: 300, id: 1, isDown: true, pointerType: 'touch' };
      const pB = { x: 600, y: 300, id: 2, isDown: true, pointerType: 'touch' };
      ic.beginPinch(pA, pB);
      ic.updatePinch({ ...pA, x: 100 }, { ...pB, x: 700 });
      expect(cam.zoom).toBe(2);

      ic.beginDrag({ id: 3, x: 100, y: 100, isDown: true, pointerType: 'mouse' });
      expect(ic.dragging).toBe(false);
    });
  });
});
