import { describe, expect, it } from 'vitest';
import MapLoader from '../core/MapLoader.js';

describe('MapLoader clipping', () => {
  it('clips polygon geometry to the requested geographic bounds', () => {
    const geoJson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-5, -5],
              [15, -5],
              [15, 15],
              [-5, 15],
              [-5, -5],
            ]],
          },
        },
      ],
    };

    const prepared = MapLoader.prepareGeoJSON(geoJson, {
      clipBounds: { west: 2, south: 3, east: 8, north: 9 },
    });

    expect(prepared.polygons).toHaveLength(1);
    expect(prepared.bounds.west).toBeCloseTo(2);
    expect(prepared.bounds.south).toBeCloseTo(3);
    expect(prepared.bounds.east).toBeCloseTo(8);
    expect(prepared.bounds.north).toBeCloseTo(9);
  });

  it('clips line geometry to the requested geographic bounds', () => {
    const geoJson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [-5, 5],
              [5, 5],
              [15, 5],
            ],
          },
        },
      ],
    };

    const prepared = MapLoader.prepareGeoJSON(geoJson, {
      geometryType: 'line',
      clipBounds: { west: 0, south: 0, east: 10, north: 10 },
    });

    expect(prepared.lines).toHaveLength(1);
    expect(prepared.bounds.west).toBeCloseTo(0);
    expect(prepared.bounds.east).toBeCloseTo(10);
    expect(prepared.bounds.south).toBeCloseTo(5);
    expect(prepared.bounds.north).toBeCloseTo(5);
  });
});
