import { describe, expect, it } from 'vitest';
import {
  findContainingOrNearestPolygonGeometry,
  findNearestLineGeometry,
  resolveTargetRevealGeometry,
  geometryContainsPoint,
  computeGeometryBbox,
  computeGeometryBboxClamped,
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

  it('uses manual polygon geometry for seas with curated shapes', () => {
    const reveal = resolveTargetRevealGeometry(
      { id: 'water-north-sea', category: 'water', lat: 56, lon: 3.5 },
      datasets,
    );

    expect(reveal).toMatchObject({ kind: 'polygon' });
    expect(reveal.geometry.type).toBe('Polygon');
  });
});

describe('geometryContainsPoint', () => {
  const square = {
    type: 'Polygon',
    coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
  };

  it('returns true for a point inside the polygon', () => {
    expect(geometryContainsPoint(square, 5, 5)).toBe(true);
  });

  it('returns false for a point outside the polygon', () => {
    expect(geometryContainsPoint(square, 15, 5)).toBe(false);
  });

  it('returns false for null geometry', () => {
    expect(geometryContainsPoint(null, 5, 5)).toBe(false);
  });

  it('handles MultiPolygon — true when inside any sub-polygon', () => {
    const multi = {
      type: 'MultiPolygon',
      coordinates: [
        [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
        [[[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]]],
      ],
    };
    expect(geometryContainsPoint(multi, 5, 5)).toBe(true);
    expect(geometryContainsPoint(multi, 25, 25)).toBe(true);
    expect(geometryContainsPoint(multi, 15, 15)).toBe(false);
  });
});

describe('computeGeometryBbox', () => {
  it('computes bbox of a polygon', () => {
    const poly = {
      type: 'Polygon',
      coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
    };
    const bbox = computeGeometryBbox(poly);
    expect(bbox).toEqual({ minLon: 0, maxLon: 10, minLat: 0, maxLat: 10 });
  });

  it('computes bbox of a MultiPolygon', () => {
    const multi = {
      type: 'MultiPolygon',
      coordinates: [
        [[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]],
        [[[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]]],
      ],
    };
    const bbox = computeGeometryBbox(multi);
    expect(bbox).toEqual({ minLon: 0, maxLon: 30, minLat: 0, maxLat: 30 });
  });

  it('returns null for geometry without coordinates', () => {
    expect(computeGeometryBbox(null)).toBeNull();
    expect(computeGeometryBbox({})).toBeNull();
  });
});

describe('computeGeometryBboxClamped', () => {
  it('clamps bbox to maxDeltaDeg around centroid', () => {
    const largePoly = {
      type: 'Polygon',
      coordinates: [[[-100, -80], [100, -80], [100, 80], [-100, 80], [-100, -80]]],
    };
    const bbox = computeGeometryBboxClamped(largePoly, 10, 50, 15);
    expect(bbox).toEqual({ minLon: -5, maxLon: 25, minLat: 35, maxLat: 65 });
  });

  it('does not expand bbox beyond geometry extent', () => {
    const smallPoly = {
      type: 'Polygon',
      coordinates: [[[5, 45], [15, 45], [15, 55], [5, 55], [5, 45]]],
    };
    const bbox = computeGeometryBboxClamped(smallPoly, 10, 50, 15);
    expect(bbox).toEqual({ minLon: 5, maxLon: 15, minLat: 45, maxLat: 55 });
  });

  it('returns null when geometry has no coordinates', () => {
    expect(computeGeometryBboxClamped(null, 0, 0)).toBeNull();
  });
});
