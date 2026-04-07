import { describe, it, expect, beforeEach } from 'vitest';
import Projection from '../core/Projection.js';

describe('Projection', () => {
  describe('equirectangular – full-world 360×180 canvas', () => {
    let proj;

    beforeEach(() => {
      proj = new Projection();
      proj.init(360, 180, { type: 'equirectangular' });
    });

    it('maps (lat=0, lon=0) to the centre of the canvas', () => {
      const { x, y } = proj.latLonToPoint(0, 0);
      expect(x).toBeCloseTo(180);
      expect(y).toBeCloseTo(90);
    });

    it('maps north pole (lat=90, lon=0) to top-centre', () => {
      const { x, y } = proj.latLonToPoint(90, 0);
      expect(x).toBeCloseTo(180);
      expect(y).toBeCloseTo(0);
    });

    it('maps south pole (lat=-90, lon=0) to bottom-centre', () => {
      const { x, y } = proj.latLonToPoint(-90, 0);
      expect(x).toBeCloseTo(180);
      expect(y).toBeCloseTo(180);
    });

    it('maps (lat=-90, lon=-180) to bottom-left corner', () => {
      const { x, y } = proj.latLonToPoint(-90, -180);
      expect(x).toBeCloseTo(0);
      expect(y).toBeCloseTo(180);
    });

    it('maps (lat=90, lon=180) to top-right corner', () => {
      const { x, y } = proj.latLonToPoint(90, 180);
      expect(x).toBeCloseTo(360);
      expect(y).toBeCloseTo(0);
    });

    it('northern hemisphere is above (smaller y) than southern', () => {
      const north = proj.latLonToPoint(45, 0);
      const south = proj.latLonToPoint(-45, 0);
      expect(north.y).toBeLessThan(south.y);
    });

    it('round-trips lat/lon through latLonToPoint → pointToLatLon', () => {
      const cases = [[0, 0], [45, 90], [-45, -90], [80, 170], [-80, -170], [52.37, 4.9]];
      for (const [lat, lon] of cases) {
        const { x, y } = proj.latLonToPoint(lat, lon);
        const result = proj.pointToLatLon(x, y);
        expect(result.lat).toBeCloseTo(lat, 4);
        expect(result.lon).toBeCloseTo(lon, 4);
      }
    });
  });

  describe('mercator – square 512×512 canvas', () => {
    let proj;

    beforeEach(() => {
      proj = new Projection();
      proj.init(512, 512, { type: 'mercator' });
    });

    it('maps (lat=0, lon=0) to the centre of the canvas', () => {
      const { x, y } = proj.latLonToPoint(0, 0);
      expect(x).toBeCloseTo(256, 0);
      expect(y).toBeCloseTo(256, 0);
    });

    it('northern latitudes are above (smaller y) the equator', () => {
      const equator = proj.latLonToPoint(0, 0);
      const north = proj.latLonToPoint(45, 0);
      expect(north.y).toBeLessThan(equator.y);
    });

    it('southern latitudes are below (larger y) the equator', () => {
      const equator = proj.latLonToPoint(0, 0);
      const south = proj.latLonToPoint(-45, 0);
      expect(south.y).toBeGreaterThan(equator.y);
    });

    it('is symmetric: equal latitudes north/south have the same distance from centre', () => {
      const equator = proj.latLonToPoint(0, 0);
      const north = proj.latLonToPoint(30, 0);
      const south = proj.latLonToPoint(-30, 0);
      expect(equator.y - north.y).toBeCloseTo(south.y - equator.y, 3);
    });

    it('round-trips typical coordinates', () => {
      const cases = [[0, 0], [51.5, 0], [52.37, 4.9], [-33.9, 151.2], [40.7, -74.0]];
      for (const [lat, lon] of cases) {
        const { x, y } = proj.latLonToPoint(lat, lon);
        const result = proj.pointToLatLon(x, y);
        expect(result.lat).toBeCloseTo(lat, 3);
        expect(result.lon).toBeCloseTo(lon, 3);
      }
    });

    it('clamps extreme latitudes to the mercator limit (≈85.05°)', () => {
      const { x, y } = proj.latLonToPoint(90, 0);
      const back = proj.pointToLatLon(x, y);
      expect(Math.abs(back.lat)).toBeLessThanOrEqual(85.06);
    });

    it('mercator stretches high-latitude bands more than low-latitude bands', () => {
      // This is the defining property of mercator: equal degree bands at high
      // latitudes occupy MORE pixels than equal degree bands near the equator.
      const merc = new Projection();
      merc.init(512, 512, { type: 'mercator', preserveAspect: false });
      const lowBand  = Math.abs(merc.latLonToPoint(15, 0).y - merc.latLonToPoint(0,  0).y);
      const highBand = Math.abs(merc.latLonToPoint(60, 0).y - merc.latLonToPoint(45, 0).y);
      expect(highBand).toBeGreaterThan(lowBand);
    });
  });

  describe('sub-region bounds', () => {
    it('maps the centre of Netherlands bounds to canvas centre', () => {
      const proj = new Projection();
      // Netherlands approx: 3°–7.5°E, 50.5°–53.7°N
      proj.init(400, 300, {
        type: 'equirectangular',
        bounds: { west: 3, south: 50.5, east: 7.5, north: 53.7 },
        preserveAspect: false,
      });
      // centroid of bounds
      const center = proj.latLonToPoint(52.1, 5.25);
      expect(center.x).toBeCloseTo(200, 0);
      expect(center.y).toBeCloseTo(150, 0);
    });

    it('maps western edge of bounds to x≈0', () => {
      const proj = new Projection();
      proj.init(400, 300, {
        type: 'equirectangular',
        bounds: { west: 3, south: 50.5, east: 7.5, north: 53.7 },
        preserveAspect: false,
      });
      const point = proj.latLonToPoint(52.1, 3);
      expect(point.x).toBeCloseTo(0, 0);
    });

    it('maps northern edge of bounds to y≈0', () => {
      const proj = new Projection();
      proj.init(400, 300, {
        type: 'equirectangular',
        bounds: { west: 3, south: 50.5, east: 7.5, north: 53.7 },
        preserveAspect: false,
      });
      const point = proj.latLonToPoint(53.7, 5.25);
      expect(point.y).toBeCloseTo(0, 0);
    });

    it('supports width-fit aspect preservation for cropped sub-regions', () => {
      const proj = new Projection();
      proj.init(400, 300, {
        type: 'equirectangular',
        bounds: { west: 0, south: 0, east: 100, north: 20 },
        fitMode: 'width',
      });

      expect(proj.scaleX).toBeCloseTo(proj.scaleY, 6);
      expect(proj.mapWidth).toBeCloseTo(400, 6);
      expect(proj.mapHeight).toBeCloseTo(80, 6);
      expect(proj.offsetY).toBeCloseTo(110, 6);
    });
  });

  describe('padding', () => {
    it('shifts the map inward so (lat=-90, lon=-180) is no longer at (0,0)', () => {
      const proj = new Projection();
      proj.init(360, 180, { type: 'equirectangular', padding: 20 });
      const { x, y } = proj.latLonToPoint(-90, -180);
      // Without padding it would be (0,180). With 20px padding it shifts in.
      expect(x).toBeGreaterThan(0);
      expect(y).toBeLessThan(180);
    });

    it('keeps the projection symmetrical around canvas centre with uniform padding', () => {
      const proj = new Projection();
      proj.init(360, 180, { type: 'equirectangular', padding: 20, preserveAspect: false });
      const tl = proj.latLonToPoint(90, -180);
      const br = proj.latLonToPoint(-90, 180);
      // Top-left should be at (20,20) and bottom-right at (340,160)
      expect(tl.x).toBeCloseTo(20, 1);
      expect(tl.y).toBeCloseTo(20, 1);
      expect(br.x).toBeCloseTo(340, 1);
      expect(br.y).toBeCloseTo(160, 1);
    });
  });

  describe('wrapX', () => {
    it('projects lon=360 identically to lon=0 when wrapX=true', () => {
      const proj = new Projection();
      proj.init(360, 180, { type: 'equirectangular', wrapX: true });
      const p0 = proj.latLonToPoint(0, 0);
      const p360 = proj.latLonToPoint(0, 360);
      expect(p0.x).toBeCloseTo(p360.x, 3);
    });

    it('lon=-180 maps to x=0 (left edge) and lon=180 maps to x=360 (right edge)', () => {
      const proj = new Projection();
      proj.init(360, 180, { type: 'equirectangular', wrapX: true });
      const pNeg = proj.latLonToPoint(0, -180);
      const pPos = proj.latLonToPoint(0, 180);
      // They are the same meridian but wrapX maps them to opposite edges of the canvas
      expect(pNeg.x).toBeCloseTo(0, 1);
      expect(pPos.x).toBeCloseTo(360, 1);
    });
  });

  describe('version and cacheKey', () => {
    it('starts at version 0 before init', () => {
      const proj = new Projection();
      expect(proj.version).toBe(0);
    });

    it('increments version on each init call', () => {
      const proj = new Projection();
      proj.init(100, 100);
      expect(proj.version).toBe(1);
      proj.init(200, 200);
      expect(proj.version).toBe(2);
    });

    it('cacheKey changes when canvas dimensions change', () => {
      const proj = new Projection();
      proj.init(100, 100);
      const key1 = proj.cacheKey;
      proj.init(200, 200);
      expect(proj.cacheKey).not.toBe(key1);
    });

    it('cacheKey is stable across identical inits', () => {
      const proj = new Projection();
      proj.init(100, 100, { type: 'mercator' });
      const key1 = proj.cacheKey;
      proj.init(100, 100, { type: 'mercator' });
      expect(proj.cacheKey).toBe(key1);
    });
  });

  describe('custom projection adapter via Projection.register', () => {
    it('registers and uses a custom adapter', () => {
      Projection.register('test-linear', {
        clampLat: (lat, bounds) => Math.min(Math.max(lat, bounds.south), bounds.north),
        projectY: (lat) => lat * 2, // just double the latitude
        unprojectY: (value) => value / 2,
      });

      const proj = new Projection();
      proj.init(360, 180, { type: 'test-linear' });
      expect(proj.type).toBe('test-linear');

      // round-trip
      const { x, y } = proj.latLonToPoint(45, 0);
      const back = proj.pointToLatLon(x, y);
      expect(back.lat).toBeCloseTo(45, 3);
    });

    it('throws if adapter is missing required methods', () => {
      expect(() => Projection.register('bad', { projectY: () => 0 })).toThrow(TypeError);
    });
  });

  describe('projectToArray', () => {
    it('writes into a provided Float32Array at the given offset', () => {
      const proj = new Projection();
      proj.init(360, 180, { type: 'equirectangular' });
      const buf = new Float32Array(4);
      proj.projectToArray(0, 0, buf, 2);
      expect(buf[2]).toBeCloseTo(180, 1);
      expect(buf[3]).toBeCloseTo(90, 1);
      // First two slots should be untouched
      expect(buf[0]).toBe(0);
      expect(buf[1]).toBe(0);
    });
  });
});
