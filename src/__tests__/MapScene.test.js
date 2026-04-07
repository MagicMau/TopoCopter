import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Scene: class {},
  },
}));

import MapScene from '../scenes/MapScene.js';
import { MAP_STYLE, WORLD_LAYOUT } from '../ui/styles.js';

const makeScene = (data) => {
  const scene = Object.create(MapScene.prototype);
  scene.cache = {
    json: {
      get: vi.fn().mockReturnValue(data),
    },
  };
  return scene;
};

describe('MapScene.getPreparedLayerData', () => {
  it('filters out overlapping admin regions from a detail layer', () => {
    const data = {
      type: 'FeatureCollection',
      features: [
        { properties: { admin: 'France' } },
        { properties: { admin: 'Italy' } },
        { properties: { admin: 'Germany' } },
      ],
    };
    const scene = makeScene(data);

    const result = scene.getPreparedLayerData({
      cacheKey: 'europe-admin1',
      excludeAdmins: ['France', 'Germany'],
    });

    expect(result).not.toBe(data);
    expect(result.features).toEqual([{ properties: { admin: 'Italy' } }]);
    expect(data.features).toHaveLength(3);
  });

  it('returns the original layer data when no exclusions are configured', () => {
    const data = {
      type: 'FeatureCollection',
      features: [{ properties: { admin: 'Italy' } }],
    };
    const scene = makeScene(data);

    const result = scene.getPreparedLayerData({
      cacheKey: 'europe-admin1',
    });

    expect(result).toBe(data);
  });
});

describe('MapScene bottom unavailable overlay', () => {
  it('computes a bottom overlay for cropped quiz projections', () => {
    const scene = Object.create(MapScene.prototype);
    scene.projection = {
      offsetY: 760,
      mapHeight: 528,
      width: WORLD_LAYOUT.WIDTH,
      height: WORLD_LAYOUT.HEIGHT,
    };
    scene.getGeoClipBounds = vi.fn(() => ({
      west: -26,
      south: 47,
      east: 40,
      north: 81,
    }));

    expect(scene.getBottomUnavailableOverlayBounds()).toEqual({
      x: 0,
      y: 1288,
      width: WORLD_LAYOUT.WIDTH,
      height: 760,
    });
  });

  it('skips the overlay for full-world projections', () => {
    const scene = Object.create(MapScene.prototype);
    scene.projection = {
      offsetY: 0,
      mapHeight: WORLD_LAYOUT.HEIGHT,
      width: WORLD_LAYOUT.WIDTH,
      height: WORLD_LAYOUT.HEIGHT,
    };
    scene.getGeoClipBounds = vi.fn(() => null);

    expect(scene.getBottomUnavailableOverlayBounds()).toBeNull();
  });

  it('renders the overlay as a world-space graphics layer', () => {
    const graphics = {
      clear: vi.fn(),
      setDepth: vi.fn(function (depth) {
        this.depth = depth;
        return this;
      }),
      setVisible: vi.fn(function (visible) {
        this.visible = visible;
        return this;
      }),
      fillStyle: vi.fn(),
      fillRect: vi.fn(),
    };
    const scene = Object.create(MapScene.prototype);
    scene.projection = {
      offsetY: 760,
      mapHeight: 528,
      width: WORLD_LAYOUT.WIDTH,
      height: WORLD_LAYOUT.HEIGHT,
    };
    scene.getGeoClipBounds = vi.fn(() => ({
      west: -26,
      south: 47,
      east: 40,
      north: 81,
    }));
    scene.add = {
      graphics: vi.fn(() => graphics),
    };
    scene.registerWorldObject = vi.fn((gameObject) => gameObject);

    scene.createBottomUnavailableOverlay();

    expect(scene.add.graphics).toHaveBeenCalled();
    expect(graphics.setDepth).toHaveBeenCalledWith(5.1);
    expect(graphics.clear).toHaveBeenCalled();
    expect(graphics.setVisible).toHaveBeenCalledWith(true);
    expect(graphics.fillStyle).toHaveBeenCalledWith(
      expect.any(Number),
      MAP_STYLE.UNAVAILABLE_REGION_ALPHA,
    );
    expect(graphics.fillRect).toHaveBeenCalledWith(0, 1288, WORLD_LAYOUT.WIDTH, 760);
  });
});
