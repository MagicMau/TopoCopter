import MapLoader from './MapLoader.js';

const DEFAULT_STYLES = Object.freeze({
  fillColor: 0xd8d8d8,
  fillAlpha: 1,
  renderFill: true,
  borderColor: 0x444444,
  borderAlpha: 1,
  borderWidth: 1,
  renderStroke: true,
  pathType: 'polygon',
  closePath: true,
});

function formatKeyPart(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return String(value);
  }

  return String(Math.round(value * 1e6) / 1e6);
}

function buildProjectionKey(projection) {
  if (projection && typeof projection.cacheKey === 'string' && projection.cacheKey.length > 0) {
    return projection.cacheKey;
  }

  const bounds = projection && projection.bounds ? projection.bounds : {};

  return [
    projection && projection.type,
    projection && projection.width,
    projection && projection.height,
    projection && projection.scaleX,
    projection && projection.scaleY,
    projection && projection.offsetX,
    projection && projection.offsetY,
    bounds.west,
    bounds.south,
    bounds.east,
    bounds.north,
  ].map(formatKeyPart).join(':');
}

export default class MapRenderer {
  constructor(options = {}) {
    const styles = { ...DEFAULT_STYLES, ...options };

    this.fillColor = styles.fillColor;
    this.fillAlpha = styles.fillAlpha;
    this.renderFill = styles.renderFill !== false;
    this.borderColor = styles.borderColor;
    this.borderAlpha = styles.borderAlpha;
    this.borderWidth = styles.borderWidth;
    this.renderStroke = styles.renderStroke !== false;
    this.pathType = styles.pathType === 'line' ? 'line' : 'polygon';
    this.closePath =
      typeof styles.closePath === 'boolean'
        ? styles.closePath
        : this.pathType !== 'line';
    this.data = null;
    this.bounds = null;
    this.stats = {
      featureCount: 0,
      supportedFeatureCount: 0,
      polygonCount: 0,
      lineCount: 0,
      sourceVertexCount: 0,
      vertexCount: 0,
    };
    this.polygons = [];
    this.lines = [];
    this.paths = [];
    this.projectedPaths = [];
    this._projectionCacheKey = '';
  }

  loadGeoJSON(data, options = {}) {
    const prepared = MapLoader.prepareGeoJSON(data, {
      ...options,
      geometryType: options.geometryType ?? this.pathType,
    });
    const pathType = (options.geometryType ?? prepared.geometryType ?? this.pathType) === 'line'
      ? 'line'
      : 'polygon';

    this.data = prepared;
    this.bounds = prepared.bounds;
    this.stats = prepared.stats;
    this.pathType = pathType;
    this.closePath =
      typeof options.closePath === 'boolean'
        ? options.closePath
        : this.pathType !== 'line';
    this.polygons = prepared.polygons ?? [];
    this.lines = prepared.lines ?? [];
    this.paths = this.pathType === 'line' ? this.lines : this.polygons;
    this.projectedPaths = new Array(this.paths.length);
    this._projectionCacheKey = '';

    return this;
  }

  render(graphics, projection, options = {}) {
    if (!graphics) {
      return this;
    }

    if (options.clear !== false && typeof graphics.clear === 'function') {
      graphics.clear();
    }

    if (!projection || this.paths.length === 0) {
      return this;
    }

    this._ensureProjectedPaths(projection);

    const renderFill =
      typeof options.renderFill === 'boolean' ? options.renderFill : this.renderFill;
    const fillColor = options.fillColor ?? this.fillColor;
    const fillAlpha = options.fillAlpha ?? this.fillAlpha;
    const renderStroke =
      typeof options.renderStroke === 'boolean'
        ? options.renderStroke
        : this.renderStroke;
    const borderColor = options.borderColor ?? this.borderColor;
    const borderAlpha = options.borderAlpha ?? this.borderAlpha;
    const borderWidth = options.borderWidth ?? this.borderWidth;

    if (
      renderFill &&
      this.closePath &&
      fillAlpha > 0 &&
      typeof graphics.fillStyle === 'function'
    ) {
      graphics.fillStyle(fillColor, fillAlpha);
      if (typeof graphics.beginPath === 'function') {
        graphics.beginPath();
      }

      for (let index = 0; index < this.projectedPaths.length; index += 1) {
        this._tracePath(graphics, this.projectedPaths[index]);
      }

      if (typeof graphics.fillPath === 'function') {
        graphics.fillPath();
      }
    }

    if (
      renderStroke &&
      borderWidth > 0 &&
      borderAlpha > 0 &&
      typeof graphics.lineStyle === 'function'
    ) {
      graphics.lineStyle(borderWidth, borderColor, borderAlpha);
      if (typeof graphics.beginPath === 'function') {
        graphics.beginPath();
      }

      for (let index = 0; index < this.projectedPaths.length; index += 1) {
        this._tracePath(graphics, this.projectedPaths[index]);
      }

      if (typeof graphics.strokePath === 'function') {
        graphics.strokePath();
      }
    }

    return this;
  }

  _ensureProjectedPaths(projection) {
    const projectionKey = buildProjectionKey(projection);

    if (
      projectionKey === this._projectionCacheKey &&
      this.projectedPaths.length === this.paths.length
    ) {
      return;
    }

    for (let pathIndex = 0; pathIndex < this.paths.length; pathIndex += 1) {
      const path = this.paths[pathIndex];
      let projected = this.projectedPaths[pathIndex];

      if (!projected || projected.length !== path.length) {
        projected = new Float32Array(path.length);
      }

      for (let sourceIndex = 0; sourceIndex < path.length; sourceIndex += 2) {
        if (typeof projection.projectToArray === 'function') {
          projection.projectToArray(
            path[sourceIndex + 1],
            path[sourceIndex],
            projected,
            sourceIndex,
          );
        } else {
          const point = projection.latLonToPoint(
            path[sourceIndex + 1],
            path[sourceIndex],
          );

          projected[sourceIndex] = point.x;
          projected[sourceIndex + 1] = point.y;
        }
      }

      this.projectedPaths[pathIndex] = projected;
    }

    this.projectedPaths.length = this.paths.length;
    this._projectionCacheKey = projectionKey;
  }

  _tracePath(graphics, path) {
    const minimumLength = this.closePath ? 6 : 4;

    if (!path || path.length < minimumLength) {
      return;
    }

    graphics.moveTo(path[0], path[1]);

    for (let index = 2; index < path.length; index += 2) {
      graphics.lineTo(path[index], path[index + 1]);
    }

    if (this.closePath && typeof graphics.closePath === 'function') {
      graphics.closePath();
    }
  }
}
