import { getCameraVisibleWorldRect } from './cameraMath.js';

const DISABLED_DEBUG_VALUES = new Set(['0', 'false', 'off', 'no']);
const ROUND_FACTOR = 1000;

function roundNumber(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * ROUND_FACTOR) / ROUND_FACTOR;
}

function roundLatLon(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return {
    lat: roundNumber(value.lat),
    lon: roundNumber(value.lon),
  };
}

function readDebugOverride() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const queryValue = params.get('debug');

    if (queryValue != null) {
      return queryValue;
    }

    return window.localStorage?.getItem('topocopter:debug') ?? null;
  } catch (_) {
    return null;
  }
}

function normalizeDebugValue(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function summarizePointArray(points) {
  if (!Array.isArray(points) || points.length === 0) {
    return [];
  }

  return points.map((point) => ({
    id: point?.id ?? null,
    name: point?.name ?? null,
    x: roundNumber(point?.x),
    y: roundNumber(point?.y),
  }));
}

export function isRuntimeDebugEnabled() {
  if (Boolean(import.meta.vitest) || import.meta.env?.MODE === 'test') {
    return false;
  }

  const override = readDebugOverride();
  if (override != null) {
    return !DISABLED_DEBUG_VALUES.has(normalizeDebugValue(override));
  }

  return Boolean(import.meta.env?.DEV);
}

export function debugLog(scope, message, details) {
  if (!isRuntimeDebugEnabled()) {
    return;
  }

  const prefix = `[TopoDebug:${scope}] ${message}`;

  if (details === undefined) {
    console.log(prefix);
    return;
  }

  if (
    typeof console.groupCollapsed === 'function'
    && typeof console.groupEnd === 'function'
  ) {
    console.groupCollapsed(prefix);
    console.log(details);
    console.groupEnd();
    return;
  }

  console.log(prefix, details);
}

export function getWindowMetrics() {
  if (typeof window === 'undefined') {
    return null;
  }

  const visualViewport = window.visualViewport ?? null;

  return {
    innerWidth: roundNumber(window.innerWidth),
    innerHeight: roundNumber(window.innerHeight),
    outerWidth: roundNumber(window.outerWidth),
    outerHeight: roundNumber(window.outerHeight),
    devicePixelRatio: roundNumber(window.devicePixelRatio),
    visualViewport: visualViewport
      ? {
          width: roundNumber(visualViewport.width),
          height: roundNumber(visualViewport.height),
          scale: roundNumber(visualViewport.scale),
          offsetLeft: roundNumber(visualViewport.offsetLeft),
          offsetTop: roundNumber(visualViewport.offsetTop),
          pageLeft: roundNumber(visualViewport.pageLeft),
          pageTop: roundNumber(visualViewport.pageTop),
        }
      : null,
  };
}

export function getCanvasMetrics(game) {
  const canvas = game?.canvas ?? null;

  if (!canvas) {
    return null;
  }

  return {
    bufferWidth: roundNumber(canvas.width),
    bufferHeight: roundNumber(canvas.height),
    clientWidth: roundNumber(canvas.clientWidth),
    clientHeight: roundNumber(canvas.clientHeight),
    styleWidth: canvas.style?.width ?? null,
    styleHeight: canvas.style?.height ?? null,
    parentClientWidth: roundNumber(canvas.parentElement?.clientWidth),
    parentClientHeight: roundNumber(canvas.parentElement?.clientHeight),
  };
}

export function describeProjection(projection) {
  if (!projection) {
    return null;
  }

  return {
    type: projection.type ?? null,
    width: roundNumber(projection.width),
    height: roundNumber(projection.height),
    mapWidth: roundNumber(projection.mapWidth),
    mapHeight: roundNumber(projection.mapHeight),
    offsetX: roundNumber(projection.offsetX),
    offsetY: roundNumber(projection.offsetY),
    scaleX: roundNumber(projection.scaleX),
    scaleY: roundNumber(projection.scaleY),
    bounds: projection.bounds
      ? {
          west: roundNumber(projection.bounds.west),
          south: roundNumber(projection.bounds.south),
          east: roundNumber(projection.bounds.east),
          north: roundNumber(projection.bounds.north),
        }
      : null,
  };
}

export function describeCameraView(camera, projection) {
  if (!camera) {
    return null;
  }

  const zoom = Math.max(Number(camera.zoom) || 0, 0.0001);
  const width = Number(camera.width) || 0;
  const height = Number(camera.height) || 0;
  const scrollX = Number(camera.scrollX) || 0;
  const scrollY = Number(camera.scrollY) || 0;
  const visibleRect = getCameraVisibleWorldRect(camera, zoom);

  const geo = typeof projection?.pointToLatLon === 'function'
    ? {
        topLeft: roundLatLon(projection.pointToLatLon(visibleRect.left, visibleRect.top)),
        topRight: roundLatLon(projection.pointToLatLon(visibleRect.right, visibleRect.top)),
        bottomLeft: roundLatLon(projection.pointToLatLon(visibleRect.left, visibleRect.bottom)),
        bottomRight: roundLatLon(projection.pointToLatLon(visibleRect.right, visibleRect.bottom)),
        center: roundLatLon(projection.pointToLatLon(visibleRect.centerX, visibleRect.centerY)),
      }
    : null;

  return {
    width: roundNumber(width),
    height: roundNumber(height),
    zoom: roundNumber(zoom),
    scrollX: roundNumber(scrollX),
    scrollY: roundNumber(scrollY),
    viewWidth: roundNumber(visibleRect.width),
    viewHeight: roundNumber(visibleRect.height),
    worldRect: {
      left: roundNumber(visibleRect.left),
      top: roundNumber(visibleRect.top),
      right: roundNumber(visibleRect.right),
      bottom: roundNumber(visibleRect.bottom),
      centerX: roundNumber(visibleRect.centerX),
      centerY: roundNumber(visibleRect.centerY),
    },
    geo,
  };
}

export function summarizeTargets(targets) {
  const source = Array.isArray(targets) ? targets : [];
  const validTargets = source.filter(
    (target) => Number.isFinite(target?.lat) && Number.isFinite(target?.lon),
  );

  if (validTargets.length === 0) {
    return {
      count: source.length,
      validCount: 0,
      geoBounds: null,
      sample: [],
    };
  }

  const lats = validTargets.map((target) => target.lat);
  const lons = validTargets.map((target) => target.lon);

  return {
    count: source.length,
    validCount: validTargets.length,
    geoBounds: {
      south: roundNumber(Math.min(...lats)),
      north: roundNumber(Math.max(...lats)),
      west: roundNumber(Math.min(...lons)),
      east: roundNumber(Math.max(...lons)),
    },
    sample: validTargets.slice(0, 8).map((target) => ({
      id: target.id ?? null,
      name: target.name ?? null,
      category: target.category ?? null,
      lat: roundNumber(target.lat),
      lon: roundNumber(target.lon),
    })),
  };
}

export function summarizeProjectedTargets(targets, projectFn) {
  const source = Array.isArray(targets) ? targets : [];
  const projected = [];

  if (typeof projectFn !== 'function') {
    return {
      count: source.length,
      projectedCount: 0,
      worldBounds: null,
      sample: [],
    };
  }

  source.forEach((target) => {
    if (!Number.isFinite(target?.lat) || !Number.isFinite(target?.lon)) {
      return;
    }

    const point = projectFn(target.lat, target.lon);
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return;
    }

    projected.push({
      id: target.id ?? null,
      name: target.name ?? null,
      x: point.x,
      y: point.y,
    });
  });

  if (projected.length === 0) {
    return {
      count: source.length,
      projectedCount: 0,
      worldBounds: null,
      sample: [],
    };
  }

  const xs = projected.map((point) => point.x);
  const ys = projected.map((point) => point.y);

  return {
    count: source.length,
    projectedCount: projected.length,
    worldBounds: {
      minX: roundNumber(Math.min(...xs)),
      maxX: roundNumber(Math.max(...xs)),
      minY: roundNumber(Math.min(...ys)),
      maxY: roundNumber(Math.max(...ys)),
      centerX: roundNumber((Math.min(...xs) + Math.max(...xs)) * 0.5),
      centerY: roundNumber((Math.min(...ys) + Math.max(...ys)) * 0.5),
    },
    sample: summarizePointArray(projected.slice(0, 8)),
  };
}
