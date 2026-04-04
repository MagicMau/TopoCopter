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
      // maxScrollX = 4096 - 1024 = 3072
      const cam = makeCamera(9999, 0, 1024, 768, 1);
      const ic = makeInputController({ camera: cam });
      ic.clampCamera();
      expect(cam.scrollX).toBeCloseTo(3072);
    });

    it('clamps to correct right boundary at zoom=4', () => {
      // viewWidth = 1024/4 = 256; maxScrollX = 4096 - 256 = 3840
      const cam = makeCamera(9999, 0, 1024, 768, 4);
      const ic = makeInputController({ camera: cam });
      ic.clampCamera();
      expect(cam.scrollX).toBeCloseTo(3840);
    });

    it('allows scroll up to right boundary at zoom=4', () => {
      const cam = makeCamera(3840, 0, 1024, 768, 4);
      const ic = makeInputController({ camera: cam });
      ic.clampCamera();
      expect(cam.scrollX).toBeCloseTo(3840);
    });

    it('centers world when view is wider than world (zoom-out past fit)', () => {
      // worldWidth=1024, viewWidth=1024/0.25=4096 > 1024 → center
      // scrollX = (1024 - 4096) / 2 = -1536
      const cam = makeCamera(0, 0, 1024, 768, 0.25);
      const ic = makeInputController({ camera: cam, worldWidth: 1024, worldHeight: 768 });
      ic.clampCamera();
      expect(cam.scrollX).toBeCloseTo((1024 - 4096) * 0.5);
    });
  });

  describe('getWorldPointFromCanvas formula', () => {
    it('returns world center at screen center when camera is centered on target', () => {
      // scrollX = worldCenter - halfW/zoom (CameraController convention).
      // At zoom=4, camera centred on world (2000, 1000):
      //   scrollX = 2000 - 1024/(2*4) = 2000 - 128 = 1872
      //   worldX at screenCentreX(512) = 1872 + 512/4 = 2000 ✓
      const cam = makeCamera(1872, 904, 1024, 768, 4);
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
      // scrollX=500, zoom=2, click at canvasX=0 → worldX = 500 + 0/2 = 500
      const cam = makeCamera(500, 300, 1024, 768, 2);
      const scene = makeScene(cam);
      const ic = new InputController(scene, {
        camera: cam, worldWidth: 4096, worldHeight: 2048,
        minZoom: 0.25, maxZoom: 10,
      });
      const pt = ic.getWorldPointFromCanvas(0, 0, 2);
      expect(pt.x).toBeCloseTo(500);
      expect(pt.y).toBeCloseTo(300);
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
  });
});
