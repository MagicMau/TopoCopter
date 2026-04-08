import polygonClipping from 'polygon-clipping';
import { TARGET_GEOMETRY_DEFINITIONS } from '../data/targetGeometryDefinitions.js';
import { QUIZ_TARGET_STYLE } from '../ui/styles.js';

const CITY_IDS = new Set(['cities']);
const COUNTRY_IDS = new Set(['countries']);
const WATER_IDS = new Set(['water']);
const AREA_IDS = new Set(['areas']);
const LAKE_TARGET_IDS = new Set(['water-lake-geneva', 'water-ijsselmeer']);
const RIVER_TARGET_IDS = new Set(['water-rhine', 'water-danube']);

const DEFAULT_LINE_BUFFER_PX = 18;
const POLYGON_GEOMETRY_ENTRY_CACHE = new WeakMap();
const MANUAL_GEOMETRY_RESOLUTION_CACHE = new WeakMap();

const toFiniteNumber = (value, fallback = 0) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

function cloneGeometry(geometry) {
  return geometry ? JSON.parse(JSON.stringify(geometry)) : null;
}

function getCachedManualGeometry(manualGeometry, worldGeoJson) {
  if (!manualGeometry || typeof manualGeometry !== 'object') {
    return null;
  }

  const cacheEntry = MANUAL_GEOMETRY_RESOLUTION_CACHE.get(manualGeometry);
  if (!cacheEntry) {
    return null;
  }

  const cachedGeometry = worldGeoJson
    ? cacheEntry.withWorld.get(worldGeoJson) ?? null
    : cacheEntry.withoutWorld;
  return cloneGeometry(cachedGeometry);
}

function setCachedManualGeometry(manualGeometry, worldGeoJson, geometry) {
  if (!manualGeometry || typeof manualGeometry !== 'object' || !geometry) {
    return;
  }

  let cacheEntry = MANUAL_GEOMETRY_RESOLUTION_CACHE.get(manualGeometry);
  if (!cacheEntry) {
    cacheEntry = {
      withWorld: new WeakMap(),
      withoutWorld: null,
    };
    MANUAL_GEOMETRY_RESOLUTION_CACHE.set(manualGeometry, cacheEntry);
  }

  const cachedGeometry = cloneGeometry(geometry);
  if (worldGeoJson) {
    cacheEntry.withWorld.set(worldGeoJson, cachedGeometry);
    return;
  }

  cacheEntry.withoutWorld = cachedGeometry;
}

function closeCoordinateRing(ring) {
  if (!Array.isArray(ring) || ring.length === 0) {
    return [];
  }

  const closedRing = ring
    .map((coordinate) => [Number(coordinate?.[0]), Number(coordinate?.[1])])
    .filter((coordinate) =>
      Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1]));

  if (closedRing.length === 0) {
    return [];
  }

  const first = closedRing[0];
  const last = closedRing[closedRing.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) {
    return closedRing;
  }

  return [...closedRing, first];
}

function getOpenRing(ring) {
  const closedRing = closeCoordinateRing(ring);
  return closedRing.length > 1 ? closedRing.slice(0, -1) : [];
}

function computeRingSignedArea(ring) {
  const openRing = getOpenRing(ring);
  if (openRing.length < 3) {
    return 0;
  }

  let area = 0;
  for (let index = 0; index < openRing.length; index += 1) {
    const current = openRing[index];
    const next = openRing[(index + 1) % openRing.length];
    area += current[0] * next[1] - next[0] * current[1];
  }

  return area * 0.5;
}

function orientRing(ring, clockwise) {
  const closedRing = closeCoordinateRing(ring);
  if (closedRing.length < 4) {
    return closedRing;
  }

  const isClockwise = computeRingSignedArea(closedRing) < 0;
  if (isClockwise === clockwise) {
    return closedRing;
  }

  return closeCoordinateRing(closedRing.slice(0, -1).reverse());
}

function normalizePolygonCoordinates(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return [];
  }

  return coordinates
    .map((ring, index) => {
      const closedRing = closeCoordinateRing(ring);
      if (closedRing.length < 4 || Math.abs(computeRingSignedArea(closedRing)) <= 1e-6) {
        return null;
      }

      return orientRing(closedRing, index !== 0);
    })
    .filter(Boolean);
}

function geometryToMultiPolygonCoordinates(geometry) {
  return extractPolygonCoordinateSets(geometry)
    .map((polygon) => normalizePolygonCoordinates(polygon))
    .filter((polygon) => polygon.length > 0 && polygon[0]?.length >= 4);
}

function multiPolygonCoordinatesToGeometry(multiPolygonCoordinates) {
  const polygons = (multiPolygonCoordinates ?? [])
    .map((polygon) => normalizePolygonCoordinates(polygon))
    .filter((polygon) => polygon.length > 0 && polygon[0]?.length >= 4);

  if (polygons.length === 0) {
    return null;
  }

  return polygons.length === 1
    ? { type: 'Polygon', coordinates: polygons[0] }
    : { type: 'MultiPolygon', coordinates: polygons };
}

function geometryToPolygonGeometries(geometry) {
  return geometryToMultiPolygonCoordinates(geometry).map((polygon) => ({
    type: 'Polygon',
    coordinates: polygon,
  }));
}

function dedupeRingPoints(ring) {
  if (!Array.isArray(ring) || ring.length === 0) {
    return [];
  }

  const deduped = [];
  ring.forEach((coordinate) => {
    const lon = Number(coordinate?.[0]);
    const lat = Number(coordinate?.[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      return;
    }

    const previous = deduped[deduped.length - 1];
    if (previous && Math.abs(previous[0] - lon) <= 1e-9 && Math.abs(previous[1] - lat) <= 1e-9) {
      return;
    }

    deduped.push([lon, lat]);
  });

  if (deduped.length > 1) {
    const first = deduped[0];
    const last = deduped[deduped.length - 1];
    if (Math.abs(first[0] - last[0]) <= 1e-9 && Math.abs(first[1] - last[1]) <= 1e-9) {
      deduped.pop();
    }
  }

  return deduped;
}

function isPointInsideClipEdge(point, edgeStart, edgeEnd, clipIsCounterClockwise) {
  const edgeX = edgeEnd[0] - edgeStart[0];
  const edgeY = edgeEnd[1] - edgeStart[1];
  const pointX = point[0] - edgeStart[0];
  const pointY = point[1] - edgeStart[1];
  const crossProduct = edgeX * pointY - edgeY * pointX;

  return clipIsCounterClockwise
    ? crossProduct >= -1e-9
    : crossProduct <= 1e-9;
}

function intersectSegmentWithEdge(start, end, edgeStart, edgeEnd) {
  const x1 = start[0];
  const y1 = start[1];
  const x2 = end[0];
  const y2 = end[1];
  const x3 = edgeStart[0];
  const y3 = edgeStart[1];
  const x4 = edgeEnd[0];
  const y4 = edgeEnd[1];
  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

  if (Math.abs(denominator) <= 1e-9) {
    return [x2, y2];
  }

  const determinantA = x1 * y2 - y1 * x2;
  const determinantB = x3 * y4 - y3 * x4;

  return [
    (determinantA * (x3 - x4) - (x1 - x2) * determinantB) / denominator,
    (determinantA * (y3 - y4) - (y1 - y2) * determinantB) / denominator,
  ];
}

function clipRingToConvexRing(subjectRing, clipRing) {
  let outputRing = getOpenRing(subjectRing);
  const clipPoints = getOpenRing(clipRing);

  if (outputRing.length < 3 || clipPoints.length < 3) {
    return null;
  }

  const clipIsCounterClockwise = computeRingSignedArea(clipPoints) >= 0;

  for (let index = 0; index < clipPoints.length; index += 1) {
    const edgeStart = clipPoints[index];
    const edgeEnd = clipPoints[(index + 1) % clipPoints.length];
    const inputRing = outputRing;
    outputRing = [];

    if (inputRing.length === 0) {
      return null;
    }

    let start = inputRing[inputRing.length - 1];
    for (const end of inputRing) {
      const endInside = isPointInsideClipEdge(
        end,
        edgeStart,
        edgeEnd,
        clipIsCounterClockwise,
      );
      const startInside = isPointInsideClipEdge(
        start,
        edgeStart,
        edgeEnd,
        clipIsCounterClockwise,
      );

      if (endInside) {
        if (!startInside) {
          outputRing.push(intersectSegmentWithEdge(start, end, edgeStart, edgeEnd));
        }
        outputRing.push(end);
      } else if (startInside) {
        outputRing.push(intersectSegmentWithEdge(start, end, edgeStart, edgeEnd));
      }

      start = end;
    }

    outputRing = dedupeRingPoints(outputRing);
  }

  if (outputRing.length < 3) {
    return null;
  }

  const clippedRing = closeCoordinateRing(outputRing);
  if (clippedRing.length < 4 || Math.abs(computeRingSignedArea(clippedRing)) <= 1e-6) {
    return null;
  }

  return clippedRing;
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

function extendCoordinateBounds(bounds, lon, lat) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return bounds;
  }

  if (!bounds) {
    return {
      minLon: lon,
      maxLon: lon,
      minLat: lat,
      maxLat: lat,
    };
  }

  return {
    minLon: Math.min(bounds.minLon, lon),
    maxLon: Math.max(bounds.maxLon, lon),
    minLat: Math.min(bounds.minLat, lat),
    maxLat: Math.max(bounds.maxLat, lat),
  };
}

function computeCoordinateBounds(geometry) {
  let bounds = null;

  extractPolygonCoordinateSets(geometry).forEach((polygon) => {
    (polygon ?? []).forEach((ring) => {
      (ring ?? []).forEach((coordinate) => {
        bounds = extendCoordinateBounds(
          bounds,
          Number(coordinate?.[0]),
          Number(coordinate?.[1]),
        );
      });
    });
  });

  return bounds;
}

function coordinateBoundsIntersect(a, b) {
  if (!a || !b) {
    return false;
  }

  return (
    a.minLon <= b.maxLon &&
    a.maxLon >= b.minLon &&
    a.minLat <= b.maxLat &&
    a.maxLat >= b.minLat
  );
}

function buildPolygonGeometryEntries(source) {
  return extractGeometries(source, new Set(['Polygon', 'MultiPolygon']))
    .flatMap((geometry) => geometryToPolygonGeometries(geometry))
    .map((geometry) => ({
      geometry,
      bounds: computeCoordinateBounds(geometry),
    }))
    .filter((entry) => entry.bounds);
}

function getPolygonGeometryEntries(source) {
  if (!source || typeof source !== 'object') {
    return [];
  }

  const cachedEntries = POLYGON_GEOMETRY_ENTRY_CACHE.get(source);
  if (cachedEntries) {
    return cachedEntries;
  }

  const entries = buildPolygonGeometryEntries(source);
  POLYGON_GEOMETRY_ENTRY_CACHE.set(source, entries);
  return entries;
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
  const geometries = getPolygonGeometryEntries(source);
  let bestGeometry = null;
  let bestDistanceSq = Number.POSITIVE_INFINITY;

  for (let index = 0; index < geometries.length; index += 1) {
    const geometry = geometries[index].geometry;
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

function extractPolygonCoordinateSets(geometry) {
  if (!geometry) {
    return [];
  }

  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates ?? [];
  }

  if (geometry.type === 'Polygon') {
    return [geometry.coordinates];
  }

  return [];
}

function dedupePolygonGeometries(geometries) {
  const seen = new Set();
  return (geometries ?? []).filter((geometry) => {
    const key = JSON.stringify(geometry?.coordinates ?? geometry);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function resolveLandClipGeometries(landClipPoints, worldGeoJson) {
  if (!Array.isArray(landClipPoints) || landClipPoints.length === 0 || !worldGeoJson) {
    return [];
  }

  const landGeometries = [];

  landClipPoints.forEach((point) => {
    const lon = Number(point?.[0]);
    const lat = Number(point?.[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      return;
    }

    const geometry = findContainingOrNearestPolygonGeometry(worldGeoJson, lon, lat);
    if (!geometry) {
      return;
    }

    landGeometries.push(geometry);
  });

  return dedupePolygonGeometries(landGeometries);
}

function findIntersectingLandGeometries(baseGeometry, worldGeoJson) {
  if (!baseGeometry || !worldGeoJson) {
    return [];
  }

  const baseBounds = computeCoordinateBounds(baseGeometry);
  if (!baseBounds) {
    return [];
  }

  return getPolygonGeometryEntries(worldGeoJson)
    .filter((entry) => coordinateBoundsIntersect(baseBounds, entry.bounds))
    .map((entry) => entry.geometry);
}

function subtractPolygonGeometries(baseGeometry, landGeometries) {
  const subject = geometryToMultiPolygonCoordinates(baseGeometry);
  const clipGeometries = dedupePolygonGeometries(landGeometries)
    .flatMap((geometry) => geometryToMultiPolygonCoordinates(geometry))
    .filter((polygon) => polygon.length > 0);

  if (subject.length === 0 || clipGeometries.length === 0) {
    return baseGeometry;
  }

  const clippedCoordinates = polygonClipping.difference(subject, ...clipGeometries);
  return multiPolygonCoordinatesToGeometry(clippedCoordinates) ?? baseGeometry;
}

function resolveManualGeometry(manualGeometry, datasets = {}) {
  const cachedGeometry = getCachedManualGeometry(manualGeometry, datasets.worldGeoJson);
  if (cachedGeometry) {
    return cachedGeometry;
  }

  const baseGeometry = cloneGeometry({
    type: manualGeometry?.type,
    coordinates: manualGeometry?.coordinates,
  });

  if (
    !baseGeometry ||
    (baseGeometry.type !== 'Polygon' && baseGeometry.type !== 'MultiPolygon')
  ) {
    return baseGeometry;
  }

  const landGeometries = dedupePolygonGeometries([
    ...(manualGeometry.excludeLand
      ? findIntersectingLandGeometries(baseGeometry, datasets.worldGeoJson)
      : []),
    ...resolveLandClipGeometries(manualGeometry.landClipPoints, datasets.worldGeoJson),
  ]);
  const resolvedGeometry = landGeometries.length > 0
    ? subtractPolygonGeometries(baseGeometry, landGeometries)
    : baseGeometry;

  setCachedManualGeometry(
    manualGeometry,
    datasets.worldGeoJson,
    resolvedGeometry,
  );
  return cloneGeometry(resolvedGeometry);
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
    const resolvedManualGeometry = resolveManualGeometry(manualGeometry, datasets);
    return {
      kind:
        resolvedManualGeometry.type === 'LineString' ||
        resolvedManualGeometry.type === 'MultiLineString'
          ? 'line'
          : 'polygon',
      geometry: resolvedManualGeometry,
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
