import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Scene: class {},
  },
}));

import MapScene from '../scenes/MapScene.js';

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
