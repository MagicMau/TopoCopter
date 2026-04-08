import { describe, expect, it, vi } from 'vitest';

vi.mock('../scenes/PreloadScene.js', () => ({
  DATA_CACHE_KEYS: {
    WORLD_GEOJSON: 'world-geojson',
    WORLD_MAJOR_LAKES: 'world-major-lakes',
    WORLD_MAJOR_RIVERS: 'world-major-rivers',
  },
}));

import DebugOverlay from '../debug/DebugOverlay.js';

function createGraphicsMock() {
  return {
    setDepth: vi.fn(function () { return this; }),
    setScrollFactor: vi.fn(function () { return this; }),
    destroy: vi.fn(),
    clear: vi.fn(),
    fillStyle: vi.fn(function () { return this; }),
    lineStyle: vi.fn(function () { return this; }),
    beginPath: vi.fn(function () { return this; }),
    moveTo: vi.fn(function () { return this; }),
    lineTo: vi.fn(function () { return this; }),
    closePath: vi.fn(function () { return this; }),
    fillPath: vi.fn(function () { return this; }),
    strokePath: vi.fn(function () { return this; }),
    fillCircle: vi.fn(function () { return this; }),
    strokeCircle: vi.fn(function () { return this; }),
  };
}

describe('DebugOverlay', () => {
  it('creates gameplay hint graphics even without debug mode', () => {
    const createdGraphics = [];
    const scene = {
      add: {
        graphics: vi.fn(() => {
          const graphics = createGraphicsMock();
          createdGraphics.push(graphics);
          return graphics;
        }),
      },
      registerWorldObject: vi.fn((gameObject) => gameObject),
    };

    const overlay = new DebugOverlay(scene);

    expect(overlay.enabled).toBe(true);
    expect(scene.add.graphics).toHaveBeenCalledTimes(2);
    expect(scene.registerWorldObject).toHaveBeenCalledTimes(2);
  });

  it('dims non-target country polygons and uses dark-green hint markers', () => {
    const createdGraphics = [];
    const worldGeoJson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'MultiPolygon',
            coordinates: [
              [[
                [0, 0],
                [10, 0],
                [10, 10],
                [0, 10],
                [0, 0],
              ]],
              [[
                [20, 20],
                [30, 20],
                [30, 30],
                [20, 30],
                [20, 20],
              ]],
            ],
          },
          properties: {},
        },
      ],
    };
    const scene = {
      add: {
        graphics: vi.fn(() => {
          const graphics = createGraphicsMock();
          createdGraphics.push(graphics);
          return graphics;
        }),
      },
      registerWorldObject: vi.fn((gameObject) => gameObject),
      cache: {
        json: {
          get: vi.fn((key) => (key === 'world-geojson' ? worldGeoJson : undefined)),
        },
      },
      cameras: {
        main: {
          zoom: 1,
        },
      },
      projectLatLon: vi.fn((lat, lon) => ({ x: lon * 10, y: lat * 10 })),
    };

    const overlay = new DebugOverlay(scene);
    overlay.render([
      { id: 'country-demo', category: 'countries', lat: 5, lon: 5 },
      { id: 'city-demo', category: 'cities', lat: 15, lon: 15 },
    ]);

    const [dimGraphics, hintGraphics] = createdGraphics;
    expect(dimGraphics.fillStyle).toHaveBeenCalledWith(0x0f172a, 0.35);
    expect(dimGraphics.fillPath).toHaveBeenCalledTimes(1);
    expect(hintGraphics.lineStyle).toHaveBeenCalledWith(2, 0x2f6b3d, 0.85);
    expect(hintGraphics.strokePath).toHaveBeenCalledTimes(1);
    expect(hintGraphics.fillStyle).toHaveBeenCalledWith(0x2f6b3d, 0.65);
    expect(hintGraphics.fillCircle).toHaveBeenCalledWith(150, 150, 6);
    expect(hintGraphics.strokeCircle).toHaveBeenCalledWith(150, 150, 6);
  });
});
