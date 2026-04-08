import { describe, it, expect } from 'vitest';
import { targetsOverlap, avoidConsecutiveOverlaps } from '../quiz/overlapUtils.js';

// Simple linear projection: x = lon * 100, y = lat * 100
const projectFn = (lat, lon) => ({ x: lon * 100, y: lat * 100 });

// The worldGeoJson fixture below defines a single polygon covering
// lon 20–30, lat 60–66 (Finland-ish).
const worldGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [20, 60], [30, 60], [30, 66], [20, 66], [20, 60],
        ]],
      },
      properties: {},
    },
  ],
};

// A country target whose polygon is resolved from worldGeoJson above.
// Projected bounds: minX=2000, maxX=3000, minY=6000, maxY=6600.
const countryFinland = {
  id: 'country-finland',
  name: 'Finland',
  category: 'countries',
  lat: 63,
  lon: 25,
};

// A city inside Finland's bounding box (lon 20–30, lat 60–66).
const cityHelsinki = {
  id: 'city-helsinki',
  name: 'Helsinki',
  category: 'cities',
  lat: 60,
  lon: 25,
};

// A city clearly outside Finland's bounding box.
const cityAmsterdam = {
  id: 'city-amsterdam',
  name: 'Amsterdam',
  category: 'cities',
  lat: 52.37,
  lon: 4.90,
};

// The North Sea has a manual polygon definition covering roughly
// lon -7.3 to 8.8, lat 50.7 to 61.6.
const northSea = {
  id: 'water-north-sea',
  name: 'North Sea',
  category: 'water',
  lat: 56,
  lon: 3.5,
};

describe('targetsOverlap', () => {
  it('returns false when projectFn is not provided', () => {
    // Without a projection function the helper cannot resolve bounds.
    // It should fail gracefully and return false.
    expect(targetsOverlap(countryFinland, cityHelsinki, null, { worldGeoJson })).toBe(false);
  });

  it('returns true for a target with itself (identical bounding box)', () => {
    expect(targetsOverlap(countryFinland, countryFinland, projectFn, { worldGeoJson })).toBe(true);
  });

  it('returns true when a city centre lies inside a country bounding box', () => {
    // Helsinki (lon=25, lat=60) is inside Finland's bbox [20–30 lon, 60–66 lat].
    expect(targetsOverlap(countryFinland, cityHelsinki, projectFn, { worldGeoJson })).toBe(true);
  });

  it('returns false when targets are geographically separated', () => {
    // Amsterdam is outside Finland's bbox.
    expect(targetsOverlap(countryFinland, cityAmsterdam, projectFn, { worldGeoJson })).toBe(false);
  });

  it('returns false when two city points are at different locations', () => {
    expect(targetsOverlap(cityHelsinki, cityAmsterdam, projectFn)).toBe(false);
  });

  it('returns true for two distinct targets sharing the same manual polygon (North Sea vs itself)', () => {
    expect(targetsOverlap(northSea, northSea, projectFn)).toBe(true);
  });

  it('returns false for targets with non-overlapping manual polygons', () => {
    // North Sea polygon is roughly lon -7 to 9 — clearly separate from Finland bbox lon 20-30.
    expect(targetsOverlap(northSea, countryFinland, projectFn, { worldGeoJson })).toBe(false);
  });
});

describe('avoidConsecutiveOverlaps', () => {
  it('is a no-op for a sequence of length < 2', () => {
    const seq = [countryFinland];
    const result = avoidConsecutiveOverlaps(seq, projectFn, { worldGeoJson });
    expect(result).toBe(seq);
    expect(result).toHaveLength(1);
  });

  it('is a no-op when no overlap exists in the sequence', () => {
    const seq = [cityAmsterdam, countryFinland];
    const before = [...seq];
    avoidConsecutiveOverlaps(seq, projectFn, { worldGeoJson });
    expect(seq.map((t) => t.id)).toEqual(before.map((t) => t.id));
  });

  it('swaps an overlapping consecutive pair with a later non-overlapping item', () => {
    // Finland → Helsinki overlaps → Amsterdam should be swapped in.
    // Sequence: [Finland, Helsinki, Amsterdam]
    // After fix: [Finland, Amsterdam, Helsinki]  (Amsterdam doesn't overlap Finland)
    const seq = [countryFinland, cityHelsinki, cityAmsterdam];
    avoidConsecutiveOverlaps(seq, projectFn, { worldGeoJson });
    expect(seq[0].id).toBe('country-finland');
    expect(seq[1].id).toBe('city-amsterdam'); // moved in
    expect(seq[2].id).toBe('city-helsinki');  // pushed back
  });

  it('returns the same array reference (mutates in place)', () => {
    const seq = [countryFinland, cityHelsinki, cityAmsterdam];
    const result = avoidConsecutiveOverlaps(seq, projectFn, { worldGeoJson });
    expect(result).toBe(seq);
  });

  it('skips overlap avoidance when projectFn is null', () => {
    const seq = [countryFinland, cityHelsinki, cityAmsterdam];
    const before = [...seq];
    avoidConsecutiveOverlaps(seq, null, { worldGeoJson });
    expect(seq.map((t) => t.id)).toEqual(before.map((t) => t.id));
  });

  it('chooses the furthest item when all remaining candidates overlap', () => {
    // Construct a scenario where both candidates after index 0 overlap with index 0.
    // We use two Helsinki variants at slightly different coords to avoid same-point,
    // but both well within Finland's bbox.
    const helsinki2 = { id: 'city-helsinki-2', name: 'Helsinki 2', category: 'cities', lat: 62, lon: 22 };
    const helsinki3 = { id: 'city-helsinki-3', name: 'Helsinki 3', category: 'cities', lat: 65, lon: 28 };
    // Both helsinki2 and helsinki3 are inside Finland bbox → all overlap Finland.
    // helsinki3 is further from Finland centre (25, 63) than helsinki2 (22, 62)?
    // distanceSq from Finland(lon=25,lat=63): to helsinki2(22,62) = 9+1=10, to helsinki3(28,65) = 9+4=13
    // So helsinki3 should be picked as the least-bad first swap.
    const seq = [countryFinland, helsinki2, helsinki3];
    avoidConsecutiveOverlaps(seq, projectFn, { worldGeoJson });
    // All overlap Finland so the furthest (helsinki3) is placed at index 1.
    expect(seq[0].id).toBe('country-finland');
    expect(seq[1].id).toBe('city-helsinki-3');
  });
});
