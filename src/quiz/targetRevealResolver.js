import {
  findContainingOrNearestPolygonGeometry,
  findNearestLineGeometry,
  geometryContainsPoint,
  resolveTargetGeometry,
} from './targetGeometry.js';

/**
 * Walk GeoJSON coordinates recursively and invoke `callback(lon, lat)` for every position.
 * Handles all geometry coordinate nesting levels.
 */
function walkCoordinates(coords, callback) {
  if (!Array.isArray(coords) || coords.length === 0) return;
  if (typeof coords[0] === 'number') {
    callback(Number(coords[0]), Number(coords[1]));
  } else {
    for (const nested of coords) {
      walkCoordinates(nested, callback);
    }
  }
}

/**
 * Compute the axis-aligned bounding box (in geographic degrees) of a GeoJSON geometry.
 * Returns `{ minLon, maxLon, minLat, maxLat }` or `null` when the geometry has no
 * finite coordinates.
 *
 * @param {object} geometry
 * @returns {{ minLon:number, maxLon:number, minLat:number, maxLat:number } | null}
 */
export function computeGeometryBbox(geometry) {
  if (!geometry?.coordinates) return null;

  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let count = 0;

  walkCoordinates(geometry.coordinates, (lon, lat) => {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    count += 1;
  });

  return count > 0 ? { minLon, maxLon, minLat, maxLat } : null;
}

/**
 * Like `computeGeometryBbox`, but clamps the result so that it extends at most
 * `maxDeltaDeg` degrees from the given centroid in each direction.
 *
 * @param {object} geometry
 * @param {number} centerLon
 * @param {number} centerLat
 * @param {number} [maxDeltaDeg=15]
 * @returns {{ minLon:number, maxLon:number, minLat:number, maxLat:number } | null}
 */
export function computeGeometryBboxClamped(geometry, centerLon, centerLat, maxDeltaDeg = 15) {
  const bbox = computeGeometryBbox(geometry);
  if (!bbox) return null;
  return {
    minLon: Math.max(bbox.minLon, centerLon - maxDeltaDeg),
    maxLon: Math.min(bbox.maxLon, centerLon + maxDeltaDeg),
    minLat: Math.max(bbox.minLat, centerLat - maxDeltaDeg),
    maxLat: Math.min(bbox.maxLat, centerLat + maxDeltaDeg),
  };
}

export {
  findContainingOrNearestPolygonGeometry,
  findNearestLineGeometry,
  geometryContainsPoint,
};

export function resolveTargetRevealGeometry(target, datasets = {}) {
  const resolved = resolveTargetGeometry(target, datasets);
  if (resolved.kind === 'circle') {
    return {
      kind: 'circle',
      screenRadiusPx: resolved.screenRadiusPx,
    };
  }

  return {
    kind: resolved.kind,
    geometry: resolved.geometry,
  };
}
