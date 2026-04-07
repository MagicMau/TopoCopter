import { TARGET_GEOMETRY_DEFINITIONS } from '../data/targetGeometryDefinitions.js';
import { QUIZ_TARGET_STYLE } from '../ui/styles.js';

const CITY_IDS = new Set(['cities']);
const COUNTRY_IDS = new Set(['countries']);
const WATER_IDS = new Set(['water']);
const AREA_IDS = new Set(['areas']);
const LAKE_TARGET_IDS = new Set(['water-lake-geneva', 'water-ijsselmeer']);
const RIVER_TARGET_IDS = new Set(['water-rhine', 'water-danube']);

const DEFAULT_LINE_BUFFER_PX = 18;

const toFiniteNumber = (value, fallback = 0) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

function cloneGeometry(geometry) {
  return geometry ? JSON.parse(JSON.stringify(geometry)) : null;
}

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

  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    previous = index, index += 1
  ) {
    const current = ring[index];
    const prior = ring[previous];
    const currentLon = toFiniteNumber(current?.[0]);
    const currentLat = toFiniteNumber(current?.[1]);
    const priorLon = toFiniteNumber(prior?.[0]);
    const priorLat = toFiniteNumber(prior?.[1]);
    const intersects =
      ((currentLat > lat) !== (priorLat > lat)) &&
      (lon <
        ((priorLon - currentLon) * (lat - currentLat)) /
          ((priorLat - currentLat) || 1e-9) +
          currentLon);

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

export function geometryContainsPoint(geometry, lon, lat) {
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

function distanceSqToSegment(pointX, pointY, startX, startY, endX, endY) {
  const dx = endX - startX;
  const dy = endY - startY;

  if (dx === 0 && dy === 0) {
    const offsetX = pointX - startX;
    const offsetY = pointY - startY;
    return offsetX * offsetX + offsetY * offsetY;
  }

  const t = Math.max(
    0,
    Math.min(1, ((pointX - startX) * dx + (pointY - startY) * dy) / (dx * dx + dy * dy)),
  );
  const projectedX = startX + dx * t;
  const projectedY = startY + dy * t;
  const offsetX = pointX - projectedX;
  const offsetY = pointY - projectedY;

  return offsetX * offsetX + offsetY * offsetY;
}

function distanceSqToRing(ring, pointX, pointY) {
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
        pointX,
        pointY,
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

  const polygons =
    geometry.type === 'MultiPolygon'
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

  const lines =
    geometry.type === 'MultiLineString'
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

function pointInProjectedRing(x, y, ring) {
  if (!ring || ring.length < 6) {
    return false;
  }

  let inside = false;

  for (
    let index = 0, previous = ring.length - 2;
    index < ring.length;
    previous = index, index += 2
  ) {
    const currentX = ring[index];
    const currentY = ring[index + 1];
    const previousX = ring[previous];
    const previousY = ring[previous + 1];
    const intersects =
      ((currentY > y) !== (previousY > y)) &&
      (x <
        ((previousX - currentX) * (y - currentY)) /
          ((previousY - currentY) || 1e-9) +
          currentX);

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function projectRing(ring, projectFn, minimumCoordinatePairs = 3) {
  if (!Array.isArray(ring)) {
    return null;
  }

  const projected = [];

  ring.forEach((coordinate) => {
    const lon = Number(coordinate?.[0]);
    const lat = Number(coordinate?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return;
    }

    const point = projectFn(lat, lon);
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return;
    }

    projected.push(point.x, point.y);
  });

  return projected.length >= minimumCoordinatePairs * 2 ? projected : null;
}

function extendBounds(bounds, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return bounds;
  }

  if (!bounds) {
    return {
      minX: x,
      maxX: x,
      minY: y,
      maxY: y,
      centerX: x,
      centerY: y,
    };
  }

  const nextBounds = {
    minX: Math.min(bounds.minX, x),
    maxX: Math.max(bounds.maxX, x),
    minY: Math.min(bounds.minY, y),
    maxY: Math.max(bounds.maxY, y),
  };
  nextBounds.centerX = (nextBounds.minX + nextBounds.maxX) * 0.5;
  nextBounds.centerY = (nextBounds.minY + nextBounds.maxY) * 0.5;
  return nextBounds;
}

function mergeBounds(bounds, nextBounds) {
  if (!nextBounds) {
    return bounds;
  }

  let merged = bounds ?? null;
  merged = extendBounds(merged, nextBounds.minX, nextBounds.minY);
  merged = extendBounds(merged, nextBounds.maxX, nextBounds.maxY);
  return merged;
}

function getBoundsFromProjectedPaths(paths) {
  let bounds = null;

  paths.forEach((path) => {
    for (let index = 0; index < path.length; index += 2) {
      bounds = extendBounds(bounds, path[index], path[index + 1]);
    }
  });

  return bounds;
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

function buildCircleGeometry(target, screenRadiusPx) {
  return {
    kind: 'circle',
    center: {
      lat: Number(target?.lat),
      lon: Number(target?.lon),
    },
    screenRadiusPx,
  };
}

export function resolveTargetGeometry(target, datasets = {}) {
  const category = String(target?.category ?? '').toLowerCase();
  const targetId = String(target?.id ?? '').toLowerCase();
  const lon = Number(target?.lon);
  const lat = Number(target?.lat);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return buildCircleGeometry(target, QUIZ_TARGET_STYLE.REVEAL_AREA_RADIUS);
  }

  const manualGeometry = TARGET_GEOMETRY_DEFINITIONS[targetId];
  if (manualGeometry) {
    return {
      kind:
        manualGeometry.type === 'LineString' || manualGeometry.type === 'MultiLineString'
          ? 'line'
          : 'polygon',
      geometry: cloneGeometry(manualGeometry),
      screenBufferPx: DEFAULT_LINE_BUFFER_PX,
    };
  }

  if (CITY_IDS.has(category)) {
    return buildCircleGeometry(target, QUIZ_TARGET_STYLE.REVEAL_CITY_RADIUS);
  }

  if (COUNTRY_IDS.has(category)) {
    const geometry = findContainingOrNearestPolygonGeometry(datasets.worldGeoJson, lon, lat);
    return geometry
      ? { kind: 'polygon', geometry: cloneGeometry(geometry) }
      : buildCircleGeometry(target, QUIZ_TARGET_STYLE.REVEAL_AREA_RADIUS);
  }

  if (WATER_IDS.has(category)) {
    if (RIVER_TARGET_IDS.has(targetId)) {
      const geometry = findNearestLineGeometry(datasets.riversGeoJson, lon, lat);
      return geometry
        ? {
            kind: 'line',
            geometry: cloneGeometry(geometry),
            screenBufferPx: DEFAULT_LINE_BUFFER_PX,
          }
        : buildCircleGeometry(target, QUIZ_TARGET_STYLE.REVEAL_WATER_RADIUS);
    }

    if (LAKE_TARGET_IDS.has(targetId)) {
      const geometry = findContainingOrNearestPolygonGeometry(datasets.lakesGeoJson, lon, lat);
      return geometry
        ? { kind: 'polygon', geometry: cloneGeometry(geometry) }
        : buildCircleGeometry(target, QUIZ_TARGET_STYLE.REVEAL_WATER_RADIUS);
    }

    return buildCircleGeometry(target, QUIZ_TARGET_STYLE.REVEAL_WATER_RADIUS);
  }

  if (AREA_IDS.has(category)) {
    return buildCircleGeometry(target, QUIZ_TARGET_STYLE.REVEAL_AREA_RADIUS);
  }

  return buildCircleGeometry(target, QUIZ_TARGET_STYLE.REVEAL_AREA_RADIUS);
}

export function resolveProjectedTargetGeometry(target, projectFn, datasets = {}) {
  const geometry = resolveTargetGeometry(target, datasets);

  if (geometry.kind === 'circle') {
    const point = projectFn(geometry.center.lat, geometry.center.lon);
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return null;
    }

    return {
      kind: 'circle',
      centerX: point.x,
      centerY: point.y,
      screenRadiusPx: geometry.screenRadiusPx,
      bounds: {
        minX: point.x,
        maxX: point.x,
        minY: point.y,
        maxY: point.y,
        centerX: point.x,
        centerY: point.y,
      },
    };
  }

  if (geometry.kind === 'line') {
    const sourceLines =
      geometry.geometry.type === 'MultiLineString'
        ? geometry.geometry.coordinates ?? []
        : [geometry.geometry.coordinates];
    const lines = sourceLines
      .map((line) => projectRing(line, projectFn, 2))
      .filter(Boolean);

    if (lines.length === 0) {
      return null;
    }

    return {
      kind: 'line',
      lines,
      screenBufferPx: geometry.screenBufferPx ?? DEFAULT_LINE_BUFFER_PX,
      bounds: getBoundsFromProjectedPaths(lines),
    };
  }

  const sourcePolygons =
    geometry.geometry.type === 'MultiPolygon'
      ? geometry.geometry.coordinates ?? []
      : [geometry.geometry.coordinates];
  const polygons = sourcePolygons
    .map((polygon) =>
      (polygon ?? [])
        .map((ring) => projectRing(ring, projectFn))
        .filter(Boolean))
    .filter((rings) => rings.length > 0);

  if (polygons.length === 0) {
    return null;
  }

  const bounds = polygons.reduce(
    (aggregate, polygon) => mergeBounds(aggregate, getBoundsFromProjectedPaths(polygon)),
    null,
  );

  return {
    kind: 'polygon',
    polygons,
    bounds,
  };
}

export function containsProjectedPoint(geometry, pointX, pointY, zoom = 1) {
  if (!geometry) {
    return false;
  }

  if (geometry.kind === 'circle') {
    const radius = geometry.screenRadiusPx / Math.max(zoom, 0.0001);
    const dx = pointX - geometry.centerX;
    const dy = pointY - geometry.centerY;
    return dx * dx + dy * dy <= radius * radius;
  }

  if (geometry.kind === 'line') {
    const threshold = (geometry.screenBufferPx ?? DEFAULT_LINE_BUFFER_PX) / Math.max(zoom, 0.0001);
    const thresholdSq = threshold * threshold;
    return geometry.lines.some((line) => {
      for (let index = 2; index < line.length; index += 2) {
        const distanceSq = distanceSqToSegment(
          pointX,
          pointY,
          line[index - 2],
          line[index - 1],
          line[index],
          line[index + 1],
        );
        if (distanceSq <= thresholdSq) {
          return true;
        }
      }
      return false;
    });
  }

  return geometry.polygons.some((polygon) => {
    const [outerRing, ...holes] = polygon;
    if (!pointInProjectedRing(pointX, pointY, outerRing)) {
      return false;
    }

    return !holes.some((hole) => pointInProjectedRing(pointX, pointY, hole));
  });
}

export function computeProjectedTargetBounds(targets, projectFn, datasets = {}) {
  return (targets ?? []).reduce((bounds, target) => {
    const geometry = resolveProjectedTargetGeometry(target, projectFn, datasets);
    return mergeBounds(bounds, geometry?.bounds ?? null);
  }, null);
}
