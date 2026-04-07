import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Scene: class {},
  },
}));

import MapScene from '../scenes/MapScene.js';
import { MAP_STYLE, WORLD_DEPTHS, WORLD_LAYOUT } from '../ui/styles.js';

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

describe('MapScene unavailable region overlay bounds', () => {
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

  it('computes a top overlay when the map has a positive offsetY', () => {
    const scene = Object.create(MapScene.prototype);
    scene.projection = {
      offsetY: 300,
      mapHeight: 800,
      width: WORLD_LAYOUT.WIDTH,
      height: WORLD_LAYOUT.HEIGHT,
    };
    scene.getGeoClipBounds = vi.fn(() => ({
      west: -26,
      south: 47,
      east: 40,
      north: 81,
    }));

    expect(scene.getTopUnavailableOverlayBounds()).toEqual({
      x: 0,
      y: 0,
      width: WORLD_LAYOUT.WIDTH,
      height: 300,
    });
  });

  it('returns null for top overlay when offsetY is zero', () => {
    const scene = Object.create(MapScene.prototype);
    scene.projection = {
      offsetY: 0,
      mapHeight: WORLD_LAYOUT.HEIGHT,
      width: WORLD_LAYOUT.WIDTH,
      height: WORLD_LAYOUT.HEIGHT,
    };
    scene.getGeoClipBounds = vi.fn(() => ({
      west: -26,
      south: 47,
      east: 40,
      north: 81,
    }));

    expect(scene.getTopUnavailableOverlayBounds()).toBeNull();
  });

  it('skips both overlays for full-world projections', () => {
    const scene = Object.create(MapScene.prototype);
    scene.projection = {
      offsetY: 0,
      mapHeight: WORLD_LAYOUT.HEIGHT,
      width: WORLD_LAYOUT.WIDTH,
      height: WORLD_LAYOUT.HEIGHT,
    };
    scene.getGeoClipBounds = vi.fn(() => null);

    expect(scene.getBottomUnavailableOverlayBounds()).toBeNull();
    expect(scene.getTopUnavailableOverlayBounds()).toBeNull();
  });

  it('renders both top and bottom overlay bands as a single graphics layer', () => {
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
      offsetY: 300,
      mapHeight: 848,
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

    scene.createUnavailableRegionOverlay();

    expect(scene.add.graphics).toHaveBeenCalledTimes(1);
    expect(graphics.setDepth).toHaveBeenCalledWith(WORLD_DEPTHS.QUIZ_TARGET + 0.5);
    expect(graphics.clear).toHaveBeenCalled();
    expect(graphics.setVisible).toHaveBeenCalledWith(true);
    expect(graphics.fillStyle).toHaveBeenCalledWith(
      expect.any(Number),
      MAP_STYLE.UNAVAILABLE_REGION_ALPHA,
    );
    // Top band: y=0, height=offsetY=300
    expect(graphics.fillRect).toHaveBeenCalledWith(0, 0, WORLD_LAYOUT.WIDTH, 300);
    // Bottom band: y=offsetY+mapHeight=1148, height=worldHeight-1148=900
    expect(graphics.fillRect).toHaveBeenCalledWith(0, 1148, WORLD_LAYOUT.WIDTH, WORLD_LAYOUT.HEIGHT - 1148);
  });

  it('renders only the bottom band when offsetY is zero', () => {
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
      offsetY: 0,
      mapHeight: 1288,
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

    scene.createUnavailableRegionOverlay();

    expect(graphics.fillRect).toHaveBeenCalledTimes(1);
    expect(graphics.fillRect).toHaveBeenCalledWith(0, 1288, WORLD_LAYOUT.WIDTH, WORLD_LAYOUT.HEIGHT - 1288);
  });
});
