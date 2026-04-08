import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  computeProjectedTargetBounds,
  containsProjectedPoint,
  geometryContainsPoint,
  resolveProjectedTargetGeometry,
  resolveTargetGeometry,
} from '../quiz/targetGeometry.js';

const projectFn = (lat, lon) => ({ x: lon * 100, y: lat * 100 });

const worldGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [20, 60],
          [30, 60],
          [30, 66],
          [20, 66],
          [20, 60],
        ]],
      },
      properties: {},
    },
  ],
};

const riversGeoJson = {
  type: 'GeometryCollection',
  geometries: [
    {
      type: 'LineString',
      coordinates: [
        [4, 50],
        [8, 54],
      ],
    },
  ],
};

const realWorldGeoJson = JSON.parse(
  readFileSync(new URL('../data/world.geojson', import.meta.url), 'utf8'),
);

describe('resolveTargetGeometry', () => {
  it('uses manual polygons for seas', () => {
    const geometry = resolveTargetGeometry({
      id: 'water-north-sea',
      category: 'water',
      lat: 56,
      lon: 3.5,
    });

    expect(geometry.kind).toBe('polygon');
    expect(geometry.geometry.type).toBe('Polygon');
  });

  it('resolves country polygons from the world geometry dataset', () => {
    const geometry = resolveTargetGeometry(
      { id: 'country-finland', category: 'countries', lat: 63, lon: 25 },
      { worldGeoJson },
    );

    expect(geometry.kind).toBe('polygon');
    expect(geometry.geometry.type).toBe('Polygon');
  });

  it('clips the Atlantic Ocean away from Iceland and Ireland', () => {
    const geometry = resolveTargetGeometry(
      { id: 'water-atlantic-ocean', category: 'water', lat: 62.5, lon: -20 },
      { worldGeoJson: realWorldGeoJson },
    );

    expect(geometry.kind).toBe('polygon');
    expect(geometryContainsPoint(geometry.geometry, -20, 62.5)).toBe(true);
    expect(geometryContainsPoint(geometry.geometry, -19.0208, 64.9631)).toBe(false);
    expect(geometryContainsPoint(geometry.geometry, -8.2439, 53.4129)).toBe(false);
  });

  it('clips the North Sea away from nearby countries', () => {
    const geometry = resolveTargetGeometry(
      { id: 'water-north-sea', category: 'water', lat: 56, lon: 3.5 },
      { worldGeoJson: realWorldGeoJson },
    );

    expect(geometry.kind).toBe('polygon');
    expect(geometryContainsPoint(geometry.geometry, 3.5, 56)).toBe(true);
    expect(geometryContainsPoint(geometry.geometry, 5.2913, 52.1326)).toBe(false);
    expect(geometryContainsPoint(geometry.geometry, 9.5018, 56.2639)).toBe(false);
  });

  it('clips the Baltic Sea away from adjacent land', () => {
    const geometry = resolveTargetGeometry(
      { id: 'water-baltic-sea', category: 'water', lat: 58.5, lon: 18 },
      { worldGeoJson: realWorldGeoJson },
    );

    expect(geometry.kind).toBe('polygon');
    expect(geometryContainsPoint(geometry.geometry, 18, 58.5)).toBe(true);
    expect(geometryContainsPoint(geometry.geometry, 25.0136, 58.5953)).toBe(false);
    expect(geometryContainsPoint(geometry.geometry, 25.7482, 61.9241)).toBe(false);
  });
});

describe('resolveProjectedTargetGeometry', () => {
  it('projects polygon targets to world-space bounds', () => {
    const geometry = resolveProjectedTargetGeometry(
      { id: 'country-finland', category: 'countries', lat: 63, lon: 25 },
      projectFn,
      { worldGeoJson },
    );

    expect(geometry.kind).toBe('polygon');
    expect(geometry.bounds).toEqual({
      minX: 2000,
      maxX: 3000,
      minY: 6000,
      maxY: 6600,
      centerX: 2500,
      centerY: 6300,
    });
  });

  it('projects line targets and preserves their hit buffer', () => {
    const geometry = resolveProjectedTargetGeometry(
      { id: 'water-rhine', category: 'water', lat: 52, lon: 6 },
      projectFn,
      { riversGeoJson },
    );

    expect(geometry.kind).toBe('line');
    expect(geometry.lines).toHaveLength(1);
    expect(geometry.screenBufferPx).toBeGreaterThan(0);
  });
});

describe('containsProjectedPoint', () => {
  it('detects whether a point lies inside a projected polygon', () => {
    const geometry = resolveProjectedTargetGeometry(
      { id: 'water-north-sea', category: 'water', lat: 56, lon: 3.5 },
      projectFn,
    );

    expect(containsProjectedPoint(geometry, 0, 5600, 1)).toBe(true);
    expect(containsProjectedPoint(geometry, 2000, 5600, 1)).toBe(false);
  });

  it('uses the configured screen buffer for projected line targets', () => {
    const geometry = resolveProjectedTargetGeometry(
      { id: 'water-rhine', category: 'water', lat: 52, lon: 6 },
      projectFn,
      { riversGeoJson },
    );

    expect(containsProjectedPoint(geometry, 600, 5205, 1)).toBe(true);
    expect(containsProjectedPoint(geometry, 2000, 5205, 1)).toBe(false);
  });
});

describe('computeProjectedTargetBounds', () => {
  it('merges bounds across projected targets', () => {
    const bounds = computeProjectedTargetBounds(
      [
        { id: 'country-finland', category: 'countries', lat: 63, lon: 25 },
        { id: 'city-helsinki', category: 'cities', lat: 60, lon: 24.9 },
      ],
      projectFn,
      { worldGeoJson },
    );

    expect(bounds).toEqual({
      minX: 2000,
      maxX: 3000,
      minY: 6000,
      maxY: 6600,
      centerX: 2500,
      centerY: 6300,
    });
  });
});
