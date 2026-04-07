import { describe, it, expect } from 'vitest';
import { computeTargetBounds, computeFixedFraming } from '../core/quizFraming.js';

// Simple equirectangular-style projection for tests:
// world is 4096 × 2048, lon [-180..180] → x [0..4096], lat [90..-90] → y [0..2048]
const projectFn = (lat, lon) => ({
  x: ((lon + 180) / 360) * 4096,
  y: ((90 - lat) / 180) * 2048,
});

// ── computeTargetBounds ───────────────────────────────────────────────────────

describe('computeTargetBounds', () => {
  it('returns null for an empty array', () => {
    expect(computeTargetBounds([], projectFn)).toBeNull();
  });

  it('returns null when all targets have invalid coordinates', () => {
    const targets = [{ lat: NaN, lon: 5 }, { lat: 52, lon: undefined }];
    expect(computeTargetBounds(targets, projectFn)).toBeNull();
  });

  it('returns null when the project function returns null for all targets', () => {
    const targets = [{ lat: 52, lon: 5 }];
    expect(computeTargetBounds(targets, () => null)).toBeNull();
  });

  it('computes correct bounds for a single target', () => {
    const targets = [{ lat: 52.37, lon: 4.9 }]; // Amsterdam
    const bounds = computeTargetBounds(targets, projectFn);
    expect(bounds).not.toBeNull();
    expect(bounds.minX).toBeCloseTo(bounds.maxX, 5);
    expect(bounds.minY).toBeCloseTo(bounds.maxY, 5);
    expect(bounds.centerX).toBeCloseTo(bounds.minX, 5);
    expect(bounds.centerY).toBeCloseTo(bounds.minY, 5);
  });

  it('computes correct bounding box for multiple targets', () => {
    const targets = [
      { lat: 52, lon: 4 },  // NW
      { lat: 51, lon: 6 },  // SE
    ];
    const bounds = computeTargetBounds(targets, projectFn);
    expect(bounds).not.toBeNull();

    const xNW = projectFn(52, 4).x;
    const xSE = projectFn(51, 6).x;
    const yNW = projectFn(52, 4).y;
    const ySE = projectFn(51, 6).y;

    expect(bounds.minX).toBeCloseTo(Math.min(xNW, xSE), 5);
    expect(bounds.maxX).toBeCloseTo(Math.max(xNW, xSE), 5);
    expect(bounds.minY).toBeCloseTo(Math.min(yNW, ySE), 5);
    expect(bounds.maxY).toBeCloseTo(Math.max(yNW, ySE), 5);
    expect(bounds.centerX).toBeCloseTo((bounds.minX + bounds.maxX) * 0.5, 5);
    expect(bounds.centerY).toBeCloseTo((bounds.minY + bounds.maxY) * 0.5, 5);
  });

  it('skips targets where projectFn returns null', () => {
    const targets = [
      { lat: 52, lon: 4 },
      { lat: 51, lon: 6 },
      { lat: 0, lon: 0 }, // this one will be skipped
    ];
    let calls = 0;
    const partialProject = (lat, lon) => {
      calls += 1;
      if (lat === 0 && lon === 0) return null;
      return projectFn(lat, lon);
    };
    const bounds = computeTargetBounds(targets, partialProject);
    expect(bounds).not.toBeNull();
    // Only the two valid points should define the bounding box
    const xA = projectFn(52, 4).x;
    const xB = projectFn(51, 6).x;
    expect(bounds.minX).toBeCloseTo(Math.min(xA, xB), 5);
    expect(bounds.maxX).toBeCloseTo(Math.max(xA, xB), 5);
    expect(calls).toBe(3);
  });
});

// ── computeFixedFraming ───────────────────────────────────────────────────────

describe('computeFixedFraming', () => {
  it('returns null for an empty target list', () => {
    expect(computeFixedFraming([], projectFn, 800, 600)).toBeNull();
  });

  it('returns a valid framing for a single target', () => {
    const targets = [{ lat: 52, lon: 5 }];
    const result = computeFixedFraming(targets, projectFn, 800, 600);
    expect(result).not.toBeNull();
    expect(Number.isFinite(result.scrollX)).toBe(true);
    expect(Number.isFinite(result.scrollY)).toBe(true);
    expect(result.zoom).toBeGreaterThan(0);
  });

  it('returns non-zero zoom for a multi-target set', () => {
    const targets = [
      { lat: 52, lon: 4 },
      { lat: 40, lon: 15 },
    ];
    const result = computeFixedFraming(targets, projectFn, 800, 600, 0.1);
    expect(result).not.toBeNull();
    expect(result.zoom).toBeGreaterThan(0);
  });

  it('centers the framing on the bounding box centroid', () => {
    const targets = [
      { lat: 60, lon: -10 },
      { lat: 35, lon: 40 },
    ];
    const viewW = 800;
    const viewH = 600;
    const result = computeFixedFraming(targets, projectFn, viewW, viewH, 0);
    const bounds = computeTargetBounds(targets, projectFn);

    // scrollX = centerX - viewW/(2*zoom)
    expect(result.centerX).toBeCloseTo(bounds.centerX, 3);
    expect(result.centerY).toBeCloseTo(bounds.centerY, 3);
    expect(result.scrollX).toBeCloseTo(result.centerX - viewW * 0.5 / result.zoom, 3);
    expect(result.scrollY).toBeCloseTo(result.centerY - viewH * 0.5 / result.zoom, 3);
    expect(result.cameraScrollX).toBeCloseTo(result.centerX - viewW * 0.5, 3);
    expect(result.cameraScrollY).toBeCloseTo(result.centerY - viewH * 0.5, 3);
  });

  it('respects maxZoom: never exceeds the given ceiling', () => {
    const targets = [{ lat: 52, lon: 5 }];
    const result = computeFixedFraming(targets, projectFn, 800, 600, 0.1, 2.0);
    expect(result.zoom).toBeLessThanOrEqual(2.0);
  });

  it('fits all targets inside the viewport (no padding)', () => {
    const targets = [
      { lat: 55, lon: 2 },
      { lat: 45, lon: 20 },
    ];
    const viewW = 800;
    const viewH = 600;
    const result = computeFixedFraming(targets, projectFn, viewW, viewH, 0);

    // Every target's projected world point should be within the camera view
    for (const t of targets) {
      const pt = projectFn(t.lat, t.lon);
      const screenX = (pt.x - result.scrollX) * result.zoom;
      const screenY = (pt.y - result.scrollY) * result.zoom;
      expect(screenX).toBeGreaterThanOrEqual(-0.5);
      expect(screenX).toBeLessThanOrEqual(viewW + 0.5);
      expect(screenY).toBeGreaterThanOrEqual(-0.5);
      expect(screenY).toBeLessThanOrEqual(viewH + 0.5);
    }
  });

  it('zoom is smaller for a wider bounding box', () => {
    const narrow = [
      { lat: 52, lon: 4 },
      { lat: 51, lon: 6 },
    ];
    const wide = [
      { lat: 60, lon: -10 },
      { lat: 35, lon: 40 },
    ];
    const r1 = computeFixedFraming(narrow, projectFn, 800, 600, 0);
    const r2 = computeFixedFraming(wide,   projectFn, 800, 600, 0);
    expect(r1.zoom).toBeGreaterThan(r2.zoom);
  });

  it('padding increases the visible margin around targets', () => {
    const targets = [
      { lat: 52, lon: 4 },
      { lat: 45, lon: 15 },
    ];
    const noPad  = computeFixedFraming(targets, projectFn, 800, 600, 0);
    const withPad = computeFixedFraming(targets, projectFn, 800, 600, 0.2);
    // More padding → lower zoom (targets appear smaller on screen)
    expect(withPad.zoom).toBeLessThan(noPad.zoom);
  });

  it('handles a viewport larger than the bounding box gracefully', () => {
    const targets = [
      { lat: 51.5, lon: 4.8 },
      { lat: 51.6, lon: 5.0 },
    ];
    const result = computeFixedFraming(targets, projectFn, 2000, 1500, 0.1);
    expect(result).not.toBeNull();
    expect(result.zoom).toBeGreaterThan(0);
  });
});
