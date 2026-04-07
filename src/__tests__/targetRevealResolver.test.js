import { describe, expect, it } from 'vitest';
import {
  findContainingOrNearestPolygonGeometry,
  findNearestLineGeometry,
  resolveTargetRevealGeometry,
} from '../quiz/targetRevealResolver.js';

const worldGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ]],
      },
      properties: {},
    },
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [20, 20],
          [30, 20],
          [30, 30],
          [20, 30],
          [20, 20],
        ]],
      },
      properties: {},
    },
  ],
};

const lakesGeoJson = {
  type: 'GeometryCollection',
  geometries: [
    {
      type: 'Polygon',
      coordinates: [[
        [40, 40],
        [50, 40],
        [50, 50],
        [40, 50],
        [40, 40],
      ]],
    },
  ],
};

const riversGeoJson = {
  type: 'GeometryCollection',
  geometries: [
    {
      type: 'MultiLineString',
      coordinates: [
        [
          [60, 60],
          [80, 80],
        ],
      ],
    },
  ],
};

describe('targetRevealResolver helpers', () => {
  it('finds the polygon containing a point', () => {
    const geometry = findContainingOrNearestPolygonGeometry(worldGeoJson, 5, 5);
    expect(geometry).toMatchObject({ type: 'Polygon' });
    expect(geometry.coordinates[0][0]).toEqual([0, 0]);
  });

  it('falls back to the nearest polygon when the point is outside all polygons', () => {
    const geometry = findContainingOrNearestPolygonGeometry(worldGeoJson, 32, 28);
    expect(geometry.coordinates[0][0]).toEqual([20, 20]);
  });

  it('finds the nearest river line geometry', () => {
    const geometry = findNearestLineGeometry(riversGeoJson, 62, 59);
    expect(geometry).toMatchObject({ type: 'MultiLineString' });
  });
});

describe('resolveTargetRevealGeometry', () => {
  const datasets = { worldGeoJson, lakesGeoJson, riversGeoJson };

  it('returns polygon geometry for country targets', () => {
    const reveal = resolveTargetRevealGeometry(
      { id: 'country-demo', category: 'countries', lat: 5, lon: 5 },
      datasets,
    );

    expect(reveal).toMatchObject({ kind: 'polygon' });
    expect(reveal.geometry.type).toBe('Polygon');
  });

  it('returns line geometry for river targets', () => {
    const reveal = resolveTargetRevealGeometry(
      { id: 'water-rhine', category: 'water', lat: 61, lon: 61 },
      datasets,
    );

    expect(reveal).toMatchObject({ kind: 'line' });
    expect(reveal.geometry.type).toBe('MultiLineString');
  });

  it('returns polygon geometry for lake targets', () => {
    const reveal = resolveTargetRevealGeometry(
      { id: 'water-lake-geneva', category: 'water', lat: 45, lon: 45 },
      datasets,
    );

    expect(reveal).toMatchObject({ kind: 'polygon' });
    expect(reveal.geometry.type).toBe('Polygon');
  });

  it('falls back to a circle for city targets', () => {
    const reveal = resolveTargetRevealGeometry(
      { id: 'city-demo', category: 'cities', lat: 1, lon: 1 },
      datasets,
    );

    expect(reveal).toMatchObject({
      kind: 'circle',
      screenRadiusPx: 18,
    });
  });

  it('falls back to a circle for seas without source geometry', () => {
    const reveal = resolveTargetRevealGeometry(
      { id: 'water-north-sea', category: 'water', lat: 56, lon: 3.5 },
      datasets,
    );

    expect(reveal).toMatchObject({
      kind: 'circle',
      screenRadiusPx: 30,
    });
  });
});
