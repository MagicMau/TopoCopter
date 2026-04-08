import { describe, expect, it, vi } from 'vitest';

vi.mock('../scenes/PreloadScene.js', () => ({
  DATA_CACHE_KEYS: {
    WORLD_GEOJSON: 'world-geojson',
    WORLD_MAJOR_LAKES: 'world-major-lakes',
    WORLD_MAJOR_RIVERS: 'world-major-rivers',
  },
}));

import DebugOverlay from '../debug/DebugOverlay.js';

describe('DebugOverlay', () => {
  it('creates gameplay hint graphics even without debug mode', () => {
    const createdGraphics = [];
    const scene = {
      add: {
        graphics: vi.fn(() => {
          const graphics = {
            setDepth: vi.fn(function () { return this; }),
            setScrollFactor: vi.fn(function () { return this; }),
            destroy: vi.fn(),
          };
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
});
