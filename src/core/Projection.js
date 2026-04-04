const DEFAULT_WORLD_BOUNDS = Object.freeze({
  west: -180,
  south: -90,
  east: 180,
  north: 90,
});

const FULL_WORLD_WIDTH = 360;
const MAX_MERCATOR_LAT = 85.05112878;
const KEY_PRECISION = 1e6;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function toDegrees(value) {
  return (value * 180) / Math.PI;
}

function toNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizePadding(padding) {
  if (Number.isFinite(padding)) {
    const uniform = Math.max(0, padding);

    return {
      top: uniform,
      right: uniform,
      bottom: uniform,
      left: uniform,
    };
  }

  const source = padding && typeof padding === 'object' ? padding : {};
  const x = Number.isFinite(source.x) ? Math.max(0, source.x) : 0;
  const y = Number.isFinite(source.y) ? Math.max(0, source.y) : 0;

  return {
    top: Number.isFinite(source.top) ? Math.max(0, source.top) : y,
    right: Number.isFinite(source.right) ? Math.max(0, source.right) : x,
    bottom: Number.isFinite(source.bottom) ? Math.max(0, source.bottom) : y,
    left: Number.isFinite(source.left) ? Math.max(0, source.left) : x,
  };
}

function wrapLongitude(value, west, east) {
  if (!Number.isFinite(value)) {
    return west;
  }

  const span = east - west;

  if (span <= 0) {
    return west;
  }

  if (span >= FULL_WORLD_WIDTH) {
    let normalized = ((value + 180) % FULL_WORLD_WIDTH + FULL_WORLD_WIDTH) % FULL_WORLD_WIDTH - 180;

    if (normalized === -180 && value > 0) {
      normalized = 180;
    }

    return normalized;
  }

  let wrapped = value;

  while (wrapped < west) {
    wrapped += FULL_WORLD_WIDTH;
  }

  while (wrapped > east) {
    wrapped -= FULL_WORLD_WIDTH;
  }

  return clamp(wrapped, west, east);
}

function formatKeyPart(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return String(value);
  }

  return String(Math.round(value * KEY_PRECISION) / KEY_PRECISION);
}

function normalizeBounds(bounds, type) {
  const source = bounds && typeof bounds === 'object' ? bounds : DEFAULT_WORLD_BOUNDS;
  const latLimit = type === 'mercator' ? MAX_MERCATOR_LAT : 90;
  const south = clamp(toNumber(source.south, DEFAULT_WORLD_BOUNDS.south), -latLimit, latLimit);
  const north = clamp(toNumber(source.north, DEFAULT_WORLD_BOUNDS.north), -latLimit, latLimit);
  const west = toNumber(source.west, DEFAULT_WORLD_BOUNDS.west);
  const east = toNumber(source.east, DEFAULT_WORLD_BOUNDS.east);
  const normalizedSouth = Math.min(south, north);
  const normalizedNorth = Math.max(south, north);
  let normalizedWest = west;
  let normalizedEast = east;

  if (normalizedEast <= normalizedWest) {
    normalizedEast = normalizedWest + FULL_WORLD_WIDTH;
  }

  return {
    west: normalizedWest,
    south: normalizedSouth,
    east: normalizedEast,
    north: normalizedNorth,
  };
}

const PROJECTIONS = {
  equirectangular: {
    clampLat(lat, bounds) {
      return clamp(toNumber(lat), bounds.south, bounds.north);
    },
    projectY(lat) {
      return lat;
    },
    unprojectY(value) {
      return value;
    },
  },
  mercator: {
    clampLat(lat, bounds) {
      const south = Math.max(bounds.south, -MAX_MERCATOR_LAT);
      const north = Math.min(bounds.north, MAX_MERCATOR_LAT);

      return clamp(toNumber(lat), south, north);
    },
    projectY(lat) {
      const clamped = clamp(lat, -MAX_MERCATOR_LAT, MAX_MERCATOR_LAT);

      return Math.log(Math.tan(Math.PI * 0.25 + toRadians(clamped) * 0.5));
    },
    unprojectY(value) {
      return toDegrees(2 * Math.atan(Math.exp(value)) - Math.PI * 0.5);
    },
  },
};

export default class Projection {
  constructor() {
    this.type = 'equirectangular';
    this.width = 0;
    this.height = 0;
    this.padding = normalizePadding(0);
    this.bounds = { ...DEFAULT_WORLD_BOUNDS };
    this.wrapX = false;
    this.scaleX = 0;
    this.scaleY = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.mapWidth = 0;
    this.mapHeight = 0;
    this.centerLon = 0;
    this.centerLat = 0;
    this.version = 0;
    this.cacheKey = '';
    this._pointBuffer = new Float32Array(2);
    this._adapter = PROJECTIONS.equirectangular;
    this._minX = DEFAULT_WORLD_BOUNDS.west;
    this._maxX = DEFAULT_WORLD_BOUNDS.east;
    this._minY = DEFAULT_WORLD_BOUNDS.south;
    this._maxY = DEFAULT_WORLD_BOUNDS.north;
  }

  static register(type, adapter) {
    if (
      typeof type !== 'string'
      || !adapter
      || typeof adapter.projectY !== 'function'
      || typeof adapter.unprojectY !== 'function'
      || typeof adapter.clampLat !== 'function'
    ) {
      throw new TypeError('Projection adapters must provide clampLat, projectY and unprojectY.');
    }

    PROJECTIONS[type.toLowerCase()] = adapter;
  }

  init(width, height, options = {}) {
    const requestedType = typeof options.type === 'string' ? options.type.toLowerCase() : 'equirectangular';

    this._adapter = PROJECTIONS[requestedType] || PROJECTIONS.equirectangular;
    this.type = PROJECTIONS[requestedType] ? requestedType : 'equirectangular';
    this.width = Math.max(0, toNumber(width));
    this.height = Math.max(0, toNumber(height));
    this.wrapX = options.wrapX === true;
    this.padding = normalizePadding(options.padding);
    this.bounds = normalizeBounds(options.bounds, this.type);
    this.centerLon = (this.bounds.west + this.bounds.east) * 0.5;
    this.centerLat = (this.bounds.south + this.bounds.north) * 0.5;
    this._minX = this.bounds.west;
    this._maxX = this.bounds.east;

    const southLat = this._adapter.clampLat(this.bounds.south, this.bounds);
    const northLat = this._adapter.clampLat(this.bounds.north, this.bounds);

    this._minY = this._adapter.projectY(southLat);
    this._maxY = this._adapter.projectY(northLat);

    const xSpan = Math.max(this._maxX - this._minX, Number.EPSILON);
    const ySpan = Math.max(this._maxY - this._minY, Number.EPSILON);
    const innerWidth = Math.max(0, this.width - this.padding.left - this.padding.right);
    const innerHeight = Math.max(0, this.height - this.padding.top - this.padding.bottom);
    const preserveAspect = options.preserveAspect !== false;

    if (preserveAspect) {
      const scale = innerWidth > 0 && innerHeight > 0
        ? Math.min(innerWidth / xSpan, innerHeight / ySpan)
        : 0;

      this.scaleX = scale;
      this.scaleY = scale;
      this.mapWidth = xSpan * scale;
      this.mapHeight = ySpan * scale;
      this.offsetX = this.padding.left + (innerWidth - this.mapWidth) * 0.5;
      this.offsetY = this.padding.top + (innerHeight - this.mapHeight) * 0.5;
    } else {
      this.scaleX = innerWidth / xSpan;
      this.scaleY = innerHeight / ySpan;
      this.mapWidth = innerWidth;
      this.mapHeight = innerHeight;
      this.offsetX = this.padding.left;
      this.offsetY = this.padding.top;
    }

    this.version += 1;
    this.cacheKey = [
      this.type,
      this.width,
      this.height,
      this.wrapX ? 1 : 0,
      this.bounds.west,
      this.bounds.south,
      this.bounds.east,
      this.bounds.north,
      this.scaleX,
      this.scaleY,
      this.offsetX,
      this.offsetY,
    ].map(formatKeyPart).join(':');

    return this;
  }

  latLonToPoint(lat, lon) {
    const point = this.projectToArray(lat, lon, this._pointBuffer, 0);

    return { x: point[0], y: point[1] };
  }

  pointToLatLon(x, y) {
    const localX = this.scaleX > 0 ? (toNumber(x) - this.offsetX) / this.scaleX : (this._maxX - this._minX) * 0.5;
    const localY = this.scaleY > 0 ? (toNumber(y) - this.offsetY) / this.scaleY : (this._maxY - this._minY) * 0.5;
    let lon = this._minX + localX;

    if (this.wrapX) {
      lon = wrapLongitude(lon, this._minX, this._maxX);
    } else {
      lon = clamp(lon, this._minX, this._maxX);
    }

    const projectedY = clamp(this._maxY - localY, this._minY, this._maxY);
    const lat = this._adapter.clampLat(this._adapter.unprojectY(projectedY), this.bounds);

    return { lat, lon };
  }

  projectToArray(lat, lon, target, offset = 0) {
    const output = target || this._pointBuffer;
    const safeLon = this.wrapX
      ? wrapLongitude(toNumber(lon), this._minX, this._maxX)
      : clamp(toNumber(lon), this._minX, this._maxX);
    const safeLat = this._adapter.clampLat(lat, this.bounds);
    const projectedY = this._adapter.projectY(safeLat);

    output[offset] = this.offsetX + (safeLon - this._minX) * this.scaleX;
    output[offset + 1] = this.offsetY + (this._maxY - projectedY) * this.scaleY;

    return output;
  }
}
