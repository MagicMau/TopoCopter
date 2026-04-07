const DEFAULT_OPTIONS = Object.freeze({
  simplifyTolerance: 0.02,
  normalizeLongitude: true,
  geometryType: 'polygon',
  clipBounds: null,
});

const DEFAULT_BOUNDS = Object.freeze({
  west: -180,
  south: -90,
  east: 180,
  north: 90,
  width: 360,
  height: 180,
  centerLon: 0,
  centerLat: 0,
});

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function nearlyEqual(a, b, epsilon = 1e-9) {
  return Math.abs(a - b) <= epsilon;
}

function normalizeLongitude(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  let normalized = value;

  while (normalized < -180) {
    normalized += 360;
  }

  while (normalized > 180) {
    normalized -= 360;
  }

  return normalized;
}

function normalizeClipBounds(bounds) {
  if (!bounds || typeof bounds !== 'object') {
    return null;
  }

  const west = Number(bounds.west);
  const south = Number(bounds.south);
  const east = Number(bounds.east);
  const north = Number(bounds.north);

  if (![west, south, east, north].every(Number.isFinite)) {
    return null;
  }

  return {
    west: Math.min(west, east),
    south: Math.min(south, north),
    east: Math.max(west, east),
    north: Math.max(south, north),
  };
}

function clampLatitude(value) {
  return clamp(Number.isFinite(value) ? value : 0, -90, 90);
}

function squaredDistance(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;

  return dx * dx + dy * dy;
}

function pointToSegmentDistanceSquared(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return squaredDistance(px, py, ax, ay);
  }

  const t = clamp(((px - ax) * dx + (py - ay) * dy) / lengthSquared, 0, 1);
  const projectedX = ax + dx * t;
  const projectedY = ay + dy * t;

  return squaredDistance(px, py, projectedX, projectedY);
}

function createBoundsAccumulator() {
  return {
    west: Infinity,
    south: Infinity,
    east: -Infinity,
    north: -Infinity,
  };
}

function finalizeBounds(bounds) {
  if (!Number.isFinite(bounds.west)) {
    return { ...DEFAULT_BOUNDS };
  }

  return {
    west: bounds.west,
    south: bounds.south,
    east: bounds.east,
    north: bounds.north,
    width: bounds.east - bounds.west,
    height: bounds.north - bounds.south,
    centerLon: (bounds.west + bounds.east) * 0.5,
    centerLat: (bounds.south + bounds.north) * 0.5,
  };
}

function createStats() {
  return {
    featureCount: 0,
    supportedFeatureCount: 0,
    polygonCount: 0,
    lineCount: 0,
    sourceVertexCount: 0,
    vertexCount: 0,
  };
}

function mergeStats(target, source) {
  if (!source) {
    return target;
  }

  target.featureCount += source.featureCount ?? 0;
  target.supportedFeatureCount += source.supportedFeatureCount ?? 0;
  target.polygonCount += source.polygonCount ?? 0;
  target.lineCount += source.lineCount ?? 0;
  target.sourceVertexCount += source.sourceVertexCount ?? 0;
  target.vertexCount += source.vertexCount ?? 0;

  return target;
}

function dedupeFlatPoints(points, closePath) {
  if (!Array.isArray(points) || points.length === 0) {
    return [];
  }

  const deduped = [points[0], points[1]];

  for (let index = 2; index < points.length; index += 2) {
    const lon = points[index];
    const lat = points[index + 1];
    const previousLon = deduped[deduped.length - 2];
    const previousLat = deduped[deduped.length - 1];

    if (nearlyEqual(lon, previousLon) && nearlyEqual(lat, previousLat)) {
      continue;
    }

    deduped.push(lon, lat);
  }

  if (
    closePath &&
    deduped.length >= 6 &&
    nearlyEqual(deduped[0], deduped[deduped.length - 2]) &&
    nearlyEqual(deduped[1], deduped[deduped.length - 1])
  ) {
    deduped.length -= 2;
  }

  return deduped;
}

function clipSegmentToBounds(ax, ay, bx, by, bounds) {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;

  const clip = (p, q) => {
    if (Math.abs(p) <= 1e-9) {
      return q >= 0;
    }

    const ratio = q / p;

    if (p < 0) {
      if (ratio > t1) {
        return false;
      }
      if (ratio > t0) {
        t0 = ratio;
      }
      return true;
    }

    if (ratio < t0) {
      return false;
    }
    if (ratio < t1) {
      t1 = ratio;
    }
    return true;
  };

  if (
    !clip(-dx, ax - bounds.west) ||
    !clip(dx, bounds.east - ax) ||
    !clip(-dy, ay - bounds.south) ||
    !clip(dy, bounds.north - ay)
  ) {
    return null;
  }

  return [
    ax + dx * t0,
    ay + dy * t0,
    ax + dx * t1,
    ay + dy * t1,
  ];
}

function clipPolylineToBounds(points, bounds) {
  if (!Array.isArray(points) || points.length < 4 || !bounds) {
    return [];
  }

  const segments = [];
  let current = [];

  for (let index = 2; index < points.length; index += 2) {
    const clipped = clipSegmentToBounds(
      points[index - 2],
      points[index - 1],
      points[index],
      points[index + 1],
      bounds,
    );

    if (!clipped) {
      if (current.length >= 4) {
        segments.push(dedupeFlatPoints(current, false));
      }
      current = [];
      continue;
    }

    const [startLon, startLat, endLon, endLat] = clipped;

    if (current.length === 0) {
      current = [startLon, startLat, endLon, endLat];
      continue;
    }

    const lastLon = current[current.length - 2];
    const lastLat = current[current.length - 1];

    if (!nearlyEqual(lastLon, startLon) || !nearlyEqual(lastLat, startLat)) {
      if (current.length >= 4) {
        segments.push(dedupeFlatPoints(current, false));
      }
      current = [startLon, startLat, endLon, endLat];
      continue;
    }

    if (!nearlyEqual(lastLon, endLon) || !nearlyEqual(lastLat, endLat)) {
      current.push(endLon, endLat);
    }
  }

  if (current.length >= 4) {
    segments.push(dedupeFlatPoints(current, false));
  }

  return segments.filter((segment) => segment.length >= 4);
}

function clipPolygonWithEdge(points, isInside, intersect) {
  if (!Array.isArray(points) || points.length === 0) {
    return [];
  }

  const output = [];
  let previous = points[points.length - 1];

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const previousInside = isInside(previous);
    const currentInside = isInside(current);

    if (currentInside) {
      if (!previousInside) {
        output.push(intersect(previous, current));
      }
      output.push(current);
    } else if (previousInside) {
      output.push(intersect(previous, current));
    }

    previous = current;
  }

  return output;
}

function clipPolygonToBounds(points, bounds) {
  if (!Array.isArray(points) || points.length < 6 || !bounds) {
    return null;
  }

  let clipped = [];

  for (let index = 0; index < points.length; index += 2) {
    clipped.push([points[index], points[index + 1]]);
  }

  clipped = clipPolygonWithEdge(
    clipped,
    ([lon]) => lon >= bounds.west,
    ([startLon, startLat], [endLon, endLat]) => {
      const deltaLon = endLon - startLon;
      const ratio = Math.abs(deltaLon) <= 1e-9 ? 0 : (bounds.west - startLon) / deltaLon;
      return [bounds.west, startLat + (endLat - startLat) * ratio];
    },
  );
  clipped = clipPolygonWithEdge(
    clipped,
    ([lon]) => lon <= bounds.east,
    ([startLon, startLat], [endLon, endLat]) => {
      const deltaLon = endLon - startLon;
      const ratio = Math.abs(deltaLon) <= 1e-9 ? 0 : (bounds.east - startLon) / deltaLon;
      return [bounds.east, startLat + (endLat - startLat) * ratio];
    },
  );
  clipped = clipPolygonWithEdge(
    clipped,
    ([, lat]) => lat >= bounds.south,
    ([startLon, startLat], [endLon, endLat]) => {
      const deltaLat = endLat - startLat;
      const ratio = Math.abs(deltaLat) <= 1e-9 ? 0 : (bounds.south - startLat) / deltaLat;
      return [startLon + (endLon - startLon) * ratio, bounds.south];
    },
  );
  clipped = clipPolygonWithEdge(
    clipped,
    ([, lat]) => lat <= bounds.north,
    ([startLon, startLat], [endLon, endLat]) => {
      const deltaLat = endLat - startLat;
      const ratio = Math.abs(deltaLat) <= 1e-9 ? 0 : (bounds.north - startLat) / deltaLat;
      return [startLon + (endLon - startLon) * ratio, bounds.north];
    },
  );

  if (clipped.length < 3) {
    return null;
  }

  return dedupeFlatPoints(clipped.flat(), true);
}

function parseGeoJSON(data) {
  if (typeof data === 'string') {
    return JSON.parse(data);
  }

  if (data && typeof data === 'object') {
    return data;
  }

  throw new TypeError('GeoJSON data must be an object or a JSON string.');
}

function normalizeRequestedGeometryTypes(value) {
  const requestedValues = Array.isArray(value)
    ? value
    : [value ?? DEFAULT_OPTIONS.geometryType];
  const allowedTypes = new Set();

  requestedValues.forEach((requestedType) => {
    switch (requestedType) {
      case 'line':
        allowedTypes.add('LineString');
        allowedTypes.add('MultiLineString');
        break;
      case 'polygon':
      default:
        allowedTypes.add('Polygon');
        allowedTypes.add('MultiPolygon');
        break;
    }
  });

  return allowedTypes;
}

function geometryMatches(geometry, allowedTypes) {
  return Boolean(geometry && allowedTypes.has(geometry.type));
}

function toFeature(geometry, properties = null) {
  return {
    type: 'Feature',
    properties,
    geometry,
  };
}

function extractFeatureLike(data, allowedTypes) {
  if (!data || typeof data !== 'object') {
    return [];
  }

  if (data.type === 'Feature') {
    const geometry = data.geometry;

    if (!geometry) {
      return [];
    }

    if (geometry.type === 'GeometryCollection') {
      return Array.isArray(geometry.geometries)
        ? geometry.geometries
          .filter((entry) => geometryMatches(entry, allowedTypes))
          .map((entry) => toFeature(entry, data.properties ?? null))
        : [];
    }

    return geometryMatches(geometry, allowedTypes) ? [data] : [];
  }

  return geometryMatches(data, allowedTypes) ? [toFeature(data)] : [];
}

function extractFeatures(data, options = {}) {
  if (!data || typeof data !== 'object') {
    return [];
  }

  const allowedTypes = normalizeRequestedGeometryTypes(
    options.geometryType ?? options.geometryTypes,
  );

  switch (data.type) {
    case 'FeatureCollection':
      return Array.isArray(data.features)
        ? data.features.flatMap((feature) =>
          extractFeatureLike(feature, allowedTypes),
        )
        : [];
    case 'GeometryCollection':
      return Array.isArray(data.geometries)
        ? data.geometries
          .flatMap((geometry) => extractFeatureLike(geometry, allowedTypes))
        : [];
    default:
      return extractFeatureLike(data, allowedTypes);
  }
}

function simplifyRing(points, tolerance) {
  const count = points.length / 2;

  if (count <= 3 || tolerance <= 0) {
    return points.slice();
  }

  const toleranceSquared = tolerance * tolerance;
  const simplified = [points[0], points[1]];

  for (let index = 1; index < count; index += 1) {
    const current = index * 2;
    const previous = ((index - 1 + count) % count) * 2;
    const next = ((index + 1) % count) * 2;
    const shouldKeep = pointToSegmentDistanceSquared(
      points[current],
      points[current + 1],
      points[previous],
      points[previous + 1],
      points[next],
      points[next + 1],
    ) > toleranceSquared;

    if (shouldKeep) {
      simplified.push(points[current], points[current + 1]);
    }
  }

  if (simplified.length < 6) {
    return points.slice();
  }

  const last = simplified.length - 2;

  if (nearlyEqual(simplified[0], simplified[last]) && nearlyEqual(simplified[1], simplified[last + 1])) {
    simplified.length -= 2;
  }

  return simplified.length >= 6 ? simplified : points.slice();
}

function simplifyLine(points, tolerance) {
  const count = points.length / 2;

  if (count <= 2 || tolerance <= 0) {
    return points.slice();
  }

  const toleranceSquared = tolerance * tolerance;
  const keep = new Uint8Array(count);
  const stack = [[0, count - 1]];
  keep[0] = 1;
  keep[count - 1] = 1;

  while (stack.length > 0) {
    const [startIndex, endIndex] = stack.pop();
    const startPoint = startIndex * 2;
    const endPoint = endIndex * 2;
    let maxDistance = 0;
    let splitIndex = -1;

    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const pointIndex = index * 2;
      const distance = pointToSegmentDistanceSquared(
        points[pointIndex],
        points[pointIndex + 1],
        points[startPoint],
        points[startPoint + 1],
        points[endPoint],
        points[endPoint + 1],
      );

      if (distance > maxDistance) {
        maxDistance = distance;
        splitIndex = index;
      }
    }

    if (splitIndex > startIndex && maxDistance > toleranceSquared) {
      keep[splitIndex] = 1;
      stack.push([startIndex, splitIndex], [splitIndex, endIndex]);
    }
  }

  const simplified = [];

  for (let index = 0; index < count; index += 1) {
    if (!keep[index]) {
      continue;
    }

    const pointIndex = index * 2;
    simplified.push(points[pointIndex], points[pointIndex + 1]);
  }

  return simplified.length >= 4 ? simplified : points.slice();
}

function normalizePathPoints(path, options = {}, closePath = true) {
  if (!Array.isArray(path) || path.length < (closePath ? 4 : 2)) {
    return null;
  }

  const settings = { ...DEFAULT_OPTIONS, ...options };
  const minimumLength = closePath ? 6 : 4;
  const normalized = [];
  let previousLon = NaN;
  let previousLat = NaN;

  for (let index = 0; index < path.length; index += 1) {
    const coordinate = path[index];

    if (!Array.isArray(coordinate) || coordinate.length < 2) {
      continue;
    }

    let lon = Number(coordinate[0]);
    let lat = Number(coordinate[1]);

    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      continue;
    }

    if (settings.normalizeLongitude) {
      lon = normalizeLongitude(lon);
    }

    lat = clampLatitude(lat);

    if (normalized.length > 0 && nearlyEqual(lon, previousLon) && nearlyEqual(lat, previousLat)) {
      continue;
    }

    normalized.push(lon, lat);
    previousLon = lon;
    previousLat = lat;
  }

  if (normalized.length < minimumLength) {
    return null;
  }

  const last = normalized.length - 2;

  if (
    closePath &&
    nearlyEqual(normalized[0], normalized[last]) &&
    nearlyEqual(normalized[1], normalized[last + 1])
  ) {
    normalized.length -= 2;
  }

  if (normalized.length < minimumLength) {
    return null;
  }

  return normalized;
}

function finalizeNormalizedPath(points, options = {}, closePath = true) {
  const settings = { ...DEFAULT_OPTIONS, ...options };
  const minimumLength = closePath ? 6 : 4;

  if (!Array.isArray(points) || points.length < minimumLength) {
    return null;
  }

  const deduped = dedupeFlatPoints(points, closePath);

  if (deduped.length < minimumLength) {
    return null;
  }

  const simplified = settings.simplifyTolerance > 0
    ? closePath
      ? simplifyRing(deduped, settings.simplifyTolerance)
      : simplifyLine(deduped, settings.simplifyTolerance)
    : deduped;

  return simplified.length >= minimumLength
    ? Float32Array.from(simplified)
    : Float32Array.from(deduped);
}

function normalizePath(path, options = {}, closePath = true) {
  const normalized = normalizePathPoints(path, options, closePath);

  if (!normalized) {
    return null;
  }

  const clipBounds = normalizeClipBounds(options.clipBounds);
  const clipped = closePath && clipBounds
    ? clipPolygonToBounds(normalized, clipBounds)
    : normalized;

  return finalizeNormalizedPath(clipped, options, closePath);
}

function normalizeRing(ring, options = {}) {
  return normalizePath(ring, options, true);
}

function normalizeLine(line, options = {}) {
  const normalizedLines = normalizeClippedLines(line, options);
  return normalizedLines[0] ?? null;
}

function normalizeClippedLines(line, options = {}) {
  const normalized = normalizePathPoints(line, options, false);

  if (!normalized) {
    return [];
  }

  const clipBounds = normalizeClipBounds(options.clipBounds);
  const clippedSegments = clipBounds
    ? clipPolylineToBounds(normalized, clipBounds)
    : [normalized];

  return clippedSegments
    .map((segment) => finalizeNormalizedPath(segment, options, false))
    .filter(Boolean);
}

function computeBounds(paths) {
  const bounds = createBoundsAccumulator();

  if (!Array.isArray(paths)) {
    return finalizeBounds(bounds);
  }

  for (let pathIndex = 0; pathIndex < paths.length; pathIndex += 1) {
    const path = paths[pathIndex];

    if (!path) {
      continue;
    }

    for (let index = 0; index < path.length; index += 2) {
      const lon = path[index];
      const lat = path[index + 1];

      if (lon < bounds.west) {
        bounds.west = lon;
      }

      if (lon > bounds.east) {
        bounds.east = lon;
      }

      if (lat < bounds.south) {
        bounds.south = lat;
      }

      if (lat > bounds.north) {
        bounds.north = lat;
      }
    }
  }

  return finalizeBounds(bounds);
}

function isPreparedGeoJSON(data) {
  return Boolean(
    data &&
      data.type === 'PreparedGeoJSON' &&
      Array.isArray(data.polygons) &&
      Array.isArray(data.lines),
  );
}

function isPreparedGeoJSONCollection(data) {
  return Boolean(
    data &&
      data.type === 'PreparedGeoJSONCollection' &&
      Array.isArray(data.layers),
  );
}

function prepareGeoJSON(data, options = {}) {
  const geometryType = options.geometryType === 'line' ? 'line' : 'polygon';

  if (isPreparedGeoJSON(data) && data.geometryType === geometryType) {
    return data;
  }

  const source = parseGeoJSON(data);
  const features = extractFeatures(source, { geometryType });
  const polygons = [];
  const lines = [];
  let supportedFeatureCount = 0;
  let sourceVertexCount = 0;
  let vertexCount = 0;

  for (let featureIndex = 0; featureIndex < features.length; featureIndex += 1) {
    const feature = features[featureIndex];
    const geometry = feature && feature.type === 'Feature' ? feature.geometry : feature;

    if (!geometry) {
      continue;
    }

    if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
      supportedFeatureCount += 1;

      const polygonsToProcess =
        geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;

      if (!Array.isArray(polygonsToProcess)) {
        continue;
      }

      for (let polygonIndex = 0; polygonIndex < polygonsToProcess.length; polygonIndex += 1) {
        const polygonRings = polygonsToProcess[polygonIndex];
        const outerRing = Array.isArray(polygonRings) ? polygonRings[0] : null;

        if (!Array.isArray(outerRing)) {
          continue;
        }

        sourceVertexCount += outerRing.length;

        const normalizedRing = normalizeRing(outerRing, options);

        if (!normalizedRing) {
          continue;
        }

        polygons.push(normalizedRing);
        vertexCount += normalizedRing.length / 2;
      }

      continue;
    }

    if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') {
      supportedFeatureCount += 1;

      const linesToProcess =
        geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;

      if (!Array.isArray(linesToProcess)) {
        continue;
      }

      for (let lineIndex = 0; lineIndex < linesToProcess.length; lineIndex += 1) {
        const line = linesToProcess[lineIndex];

        if (!Array.isArray(line)) {
          continue;
        }

        sourceVertexCount += line.length;

        const normalizedLines = normalizeClippedLines(line, options);

        if (normalizedLines.length === 0) {
          continue;
        }

        normalizedLines.forEach((normalizedLine) => {
          lines.push(normalizedLine);
          vertexCount += normalizedLine.length / 2;
        });
      }
    }
  }

  return {
    type: 'PreparedGeoJSON',
    geometryType,
    polygons,
    lines,
    bounds: computeBounds(geometryType === 'line' ? lines : polygons),
    stats: {
      ...createStats(),
      featureCount: features.length,
      supportedFeatureCount,
      polygonCount: polygons.length,
      lineCount: lines.length,
      sourceVertexCount,
      vertexCount,
    },
    options: {
      simplifyTolerance: Number.isFinite(options.simplifyTolerance)
        ? options.simplifyTolerance
        : DEFAULT_OPTIONS.simplifyTolerance,
      normalizeLongitude: options.normalizeLongitude !== false,
      geometryType,
    },
  };
}

function prepareGeoJSONCollection(layers = []) {
  if (isPreparedGeoJSONCollection(layers)) {
    return layers;
  }

  const preparedLayers = Array.isArray(layers)
    ? layers
      .filter((layer) => layer && layer.data)
      .map((layer, index) => ({
        id: layer.id ?? layer.key ?? `layer-${index}`,
        label: layer.label ?? null,
        minZoom: Number.isFinite(layer.minZoom) ? layer.minZoom : null,
        maxZoom: Number.isFinite(layer.maxZoom) ? layer.maxZoom : null,
        style: layer.style ?? null,
        geometryType: layer.geometryType === 'line' ? 'line' : 'polygon',
        layerGroup: layer.layerGroup ?? null,
        renderMode: layer.renderMode ?? null,
        data: prepareGeoJSON(layer.data, {
          ...layer.options,
          geometryType: layer.geometryType,
        }),
      }))
    : [];
  const stats = createStats();

  for (let index = 0; index < preparedLayers.length; index += 1) {
    mergeStats(stats, preparedLayers[index].data?.stats);
  }

  return {
    type: 'PreparedGeoJSONCollection',
    layers: preparedLayers,
    stats,
  };
}

const MapLoader = {
  parseGeoJSON,
  extractFeatures,
  normalizeRing,
  normalizeLine,
  normalizeClippedLines,
  clipPolygonToBounds,
  clipPolylineToBounds,
  simplifyRing,
  simplifyLine,
  computeBounds,
  isPreparedGeoJSON,
  isPreparedGeoJSONCollection,
  prepareGeoJSON,
  prepareGeoJSONCollection,
};

export default MapLoader;
