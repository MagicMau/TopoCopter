import { QUIZ_TARGET_STYLE } from '../ui/styles.js';

const CITY_IDS = new Set(['cities']);
const COUNTRY_IDS = new Set(['countries']);
const WATER_IDS = new Set(['water']);
const LAKE_TARGET_IDS = new Set(['water-lake-geneva', 'water-ijsselmeer']);
const RIVER_TARGET_IDS = new Set(['water-rhine', 'water-danube']);

const toFiniteNumber = (value, fallback = 0) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

function extractGeometries(source, allowedTypes) {
  if (!source) {
    return [];
  }

  if (source.type === 'FeatureCollection') {
    return (source.features ?? []).flatMap((feature) =>
      extractGeometries(feature, allowedTypes));
  }

  if (source.type === 'Feature') {
    return extractGeometries(source.geometry, allowedTypes);
  }

  if (source.type === 'GeometryCollection') {
    return (source.geometries ?? []).flatMap((geometry) =>
      extractGeometries(geometry, allowedTypes));
  }

  return allowedTypes.has(source.type) ? [source] : [];
}

function pointInRing(lon, lat, ring) {
  if (!Array.isArray(ring) || ring.length < 3) {
    return false;
  }

  let inside = false;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const current = ring[index];
    const prior = ring[previous];
    const currentLon = toFiniteNumber(current?.[0]);
    const currentLat = toFiniteNumber(current?.[1]);
    const priorLon = toFiniteNumber(prior?.[0]);
    const priorLat = toFiniteNumber(prior?.[1]);
    const intersects =
      ((currentLat > lat) !== (priorLat > lat)) &&
      (lon < ((priorLon - currentLon) * (lat - currentLat)) / ((priorLat - currentLat) || 1e-9) + currentLon);

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function polygonContainsPoint(coordinates, lon, lat) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return false;
  }

  const [outerRing, ...holes] = coordinates;
  if (!pointInRing(lon, lat, outerRing)) {
    return false;
  }

  return !holes.some((hole) => pointInRing(lon, lat, hole));
}

function geometryContainsPoint(geometry, lon, lat) {
  if (!geometry) {
    return false;
  }

  if (geometry.type === 'Polygon') {
    return polygonContainsPoint(geometry.coordinates, lon, lat);
  }

  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates ?? []).some((polygon) =>
      polygonContainsPoint(polygon, lon, lat));
  }

  return false;
}

function distanceSqToSegment(lon, lat, startLon, startLat, endLon, endLat) {
  const dx = endLon - startLon;
  const dy = endLat - startLat;

  if (dx === 0 && dy === 0) {
    const pointDx = lon - startLon;
    const pointDy = lat - startLat;
    return pointDx * pointDx + pointDy * pointDy;
  }

  const t = Math.max(
    0,
    Math.min(1, ((lon - startLon) * dx + (lat - startLat) * dy) / (dx * dx + dy * dy)),
  );
  const projectedLon = startLon + dx * t;
  const projectedLat = startLat + dy * t;
  const pointDx = lon - projectedLon;
  const pointDy = lat - projectedLat;

  return pointDx * pointDx + pointDy * pointDy;
}

function distanceSqToRing(ring, lon, lat) {
  if (!Array.isArray(ring) || ring.length < 2) {
    return Number.POSITIVE_INFINITY;
  }

  let minimumDistanceSq = Number.POSITIVE_INFINITY;

  for (let index = 1; index < ring.length; index += 1) {
    const start = ring[index - 1];
    const end = ring[index];
    minimumDistanceSq = Math.min(
      minimumDistanceSq,
      distanceSqToSegment(
        lon,
        lat,
        toFiniteNumber(start?.[0]),
        toFiniteNumber(start?.[1]),
        toFiniteNumber(end?.[0]),
        toFiniteNumber(end?.[1]),
      ),
    );
  }

  return minimumDistanceSq;
}

function distanceSqToPolygonGeometry(geometry, lon, lat) {
  if (!geometry) {
    return Number.POSITIVE_INFINITY;
  }

  if (geometryContainsPoint(geometry, lon, lat)) {
    return 0;
  }

  const polygons = geometry.type === 'MultiPolygon'
    ? geometry.coordinates ?? []
    : geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : [];

  let minimumDistanceSq = Number.POSITIVE_INFINITY;

  polygons.forEach((polygon) => {
    (polygon ?? []).forEach((ring) => {
      minimumDistanceSq = Math.min(minimumDistanceSq, distanceSqToRing(ring, lon, lat));
    });
  });

  return minimumDistanceSq;
}

function distanceSqToLineGeometry(geometry, lon, lat) {
  if (!geometry) {
    return Number.POSITIVE_INFINITY;
  }

  const lines = geometry.type === 'MultiLineString'
    ? geometry.coordinates ?? []
    : geometry.type === 'LineString'
      ? [geometry.coordinates]
      : [];

  let minimumDistanceSq = Number.POSITIVE_INFINITY;

  lines.forEach((line) => {
    minimumDistanceSq = Math.min(minimumDistanceSq, distanceSqToRing(line, lon, lat));
  });

  return minimumDistanceSq;
}

export function findContainingOrNearestPolygonGeometry(source, lon, lat) {
  const geometries = extractGeometries(source, new Set(['Polygon', 'MultiPolygon']));
  let bestGeometry = null;
  let bestDistanceSq = Number.POSITIVE_INFINITY;

  for (let index = 0; index < geometries.length; index += 1) {
    const geometry = geometries[index];
    const distanceSq = distanceSqToPolygonGeometry(geometry, lon, lat);

    if (distanceSq === 0) {
      return geometry;
    }

    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestGeometry = geometry;
    }
  }

  return bestGeometry;
}

export function findNearestLineGeometry(source, lon, lat) {
  const geometries = extractGeometries(source, new Set(['LineString', 'MultiLineString']));
  let bestGeometry = null;
  let bestDistanceSq = Number.POSITIVE_INFINITY;

  for (let index = 0; index < geometries.length; index += 1) {
    const geometry = geometries[index];
    const distanceSq = distanceSqToLineGeometry(geometry, lon, lat);

    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestGeometry = geometry;
    }
  }

  return bestGeometry;
}

function buildFallbackReveal(screenRadiusPx) {
  return {
    kind: 'circle',
    screenRadiusPx,
  };
}

export function resolveTargetRevealGeometry(target, datasets = {}) {
  const category = String(target?.category ?? '').toLowerCase();
  const targetId = String(target?.id ?? '').toLowerCase();
  const lon = toFiniteNumber(target?.lon, Number.NaN);
  const lat = toFiniteNumber(target?.lat, Number.NaN);

  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return buildFallbackReveal(QUIZ_TARGET_STYLE.REVEAL_AREA_RADIUS);
  }

  if (CITY_IDS.has(category)) {
    return buildFallbackReveal(QUIZ_TARGET_STYLE.REVEAL_CITY_RADIUS);
  }

  if (COUNTRY_IDS.has(category)) {
    const geometry = findContainingOrNearestPolygonGeometry(datasets.worldGeoJson, lon, lat);
    return geometry
      ? { kind: 'polygon', geometry }
      : buildFallbackReveal(QUIZ_TARGET_STYLE.REVEAL_AREA_RADIUS);
  }

  if (WATER_IDS.has(category)) {
    if (RIVER_TARGET_IDS.has(targetId)) {
      const geometry = findNearestLineGeometry(datasets.riversGeoJson, lon, lat);
      return geometry
        ? { kind: 'line', geometry }
        : buildFallbackReveal(QUIZ_TARGET_STYLE.REVEAL_WATER_RADIUS);
    }

    if (LAKE_TARGET_IDS.has(targetId)) {
      const geometry = findContainingOrNearestPolygonGeometry(datasets.lakesGeoJson, lon, lat);
      return geometry
        ? { kind: 'polygon', geometry }
        : buildFallbackReveal(QUIZ_TARGET_STYLE.REVEAL_WATER_RADIUS);
    }

    return buildFallbackReveal(QUIZ_TARGET_STYLE.REVEAL_WATER_RADIUS);
  }

  return buildFallbackReveal(QUIZ_TARGET_STYLE.REVEAL_AREA_RADIUS);
}
