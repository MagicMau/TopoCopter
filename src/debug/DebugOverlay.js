import { WORLD_DEPTHS } from '../ui/styles.js';
import { geometryContainsPoint, resolveProjectedTargetGeometry } from '../quiz/targetGeometry.js';
import { DATA_CACHE_KEYS } from '../scenes/PreloadScene.js';

const DEBUG_DEPTH = WORLD_DEPTHS.OVERLAY - 1;
const CITY_SCREEN_RADIUS = 6;
const DIM_COLOR = 0x0f172a;
const DIM_ALPHA = 0.35;
const OUTLINE_COLOR = 0xff8c00;
const OUTLINE_ALPHA = 0.9;
const OUTLINE_SCREEN_WIDTH = 2;
const CITY_COLOR = 0xff8c00;
const CITY_ALPHA = 0.7;

function isDebugMode() {
  try {
    if (typeof window === 'undefined') return false;
    if (new URLSearchParams(window.location.search).get('debug') === '1') return true;
    if (window.localStorage?.getItem('debug') === '1') return true;
  } catch (_) {
    // non-browser env
  }
  return false;
}

/**
 * Dim all sub-polygons in a GeoJSON geometry that do NOT contain any quiz
 * country target lat/lon.  For MultiPolygon features (e.g. France), only the
 * sub-polygon(s) that actually contain the quiz target are left undimmed;
 * distant overseas territories are dimmed as expected.
 */
function drawDimmedNonQuizPolygons(graphics, geometry, quizCountryTargets, projectFn) {
  const polygons =
    geometry.type === 'MultiPolygon'
      ? (geometry.coordinates ?? [])
      : geometry.type === 'Polygon'
        ? [geometry.coordinates]
        : [];

  for (const polygon of polygons) {
    const outerRing = polygon?.[0];
    if (!outerRing || outerRing.length < 3) continue;

    const isQuizTarget = quizCountryTargets.some((t) =>
      geometryContainsPoint({ type: 'Polygon', coordinates: polygon }, t.lon, t.lat));

    if (isQuizTarget) continue;

    const projected = [];
    for (const coord of outerRing) {
      const pt = projectFn(coord[1], coord[0]);
      if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
      projected.push(pt.x, pt.y);
    }

    if (projected.length < 6) continue;

    graphics.beginPath();
    graphics.moveTo(projected[0], projected[1]);
    for (let i = 2; i < projected.length; i += 2) {
      graphics.lineTo(projected[i], projected[i + 1]);
    }
    graphics.closePath();
    graphics.fillPath();
  }
}

export default class DebugOverlay {
  constructor(scene) {
    this._scene = scene;
    this._graphics = null;
    this._enabled = isDebugMode();

    if (!this._enabled) return;

    this._graphics = scene.add.graphics();
    this._graphics.setDepth(DEBUG_DEPTH);
    this._graphics.setScrollFactor(1);
    scene.registerWorldObject(this._graphics);
  }

  get enabled() {
    return this._enabled;
  }

  render(quizTargets) {
    if (!this._enabled || !this._graphics) return;

    const scene = this._scene;
    const graphics = this._graphics;
    graphics.clear();

    if (!quizTargets || quizTargets.length === 0) return;

    const worldGeoJson = scene.cache?.json?.get(DATA_CACHE_KEYS.WORLD_GEOJSON);
    const lakesGeoJson = scene.cache?.json?.get(DATA_CACHE_KEYS.WORLD_MAJOR_LAKES);
    const riversGeoJson = scene.cache?.json?.get(DATA_CACHE_KEYS.WORLD_MAJOR_RIVERS);
    const zoom = Math.max(scene.cameras?.main?.zoom ?? 1, 0.0001);
    const projectFn = (lat, lon) => scene.projectLatLon(lat, lon);
    const datasets = { worldGeoJson, lakesGeoJson, riversGeoJson };

    // 1. Dim non-quiz country shapes
    if (worldGeoJson) {
      const quizCountryTargets = quizTargets.filter(
        (t) => (t.category ?? '').toLowerCase() === 'countries',
      );

      graphics.fillStyle(DIM_COLOR, DIM_ALPHA);

      for (const feature of (worldGeoJson.features ?? [])) {
        const geometry = feature.geometry;
        if (!geometry) continue;

        drawDimmedNonQuizPolygons(graphics, geometry, quizCountryTargets, projectFn);
      }
    }

    // 2. Outline quiz target polygons (countries + water polygons/lines)
    graphics.lineStyle(OUTLINE_SCREEN_WIDTH / zoom, OUTLINE_COLOR, OUTLINE_ALPHA);

    for (const target of quizTargets) {
      const category = (target.category ?? '').toLowerCase();
      if (category === 'cities' || category === 'areas') continue;

      const geom = resolveProjectedTargetGeometry(target, projectFn, datasets);
      if (!geom) continue;

      if (geom.kind === 'polygon') {
        for (const polygon of geom.polygons) {
          const outer = polygon[0];
          if (!outer || outer.length < 4) continue;
          graphics.beginPath();
          graphics.moveTo(outer[0], outer[1]);
          for (let i = 2; i < outer.length; i += 2) {
            graphics.lineTo(outer[i], outer[i + 1]);
          }
          graphics.closePath();
          graphics.strokePath();
        }
      } else if (geom.kind === 'line') {
        for (const line of geom.lines) {
          if (line.length < 4) continue;
          graphics.beginPath();
          graphics.moveTo(line[0], line[1]);
          for (let i = 2; i < line.length; i += 2) {
            graphics.lineTo(line[i], line[i + 1]);
          }
          graphics.strokePath();
        }
      }
    }

    // 3. City target markers (filled circle, ~6px screen-space)
    const cityRadius = CITY_SCREEN_RADIUS / zoom;
    graphics.fillStyle(CITY_COLOR, CITY_ALPHA);

    for (const target of quizTargets) {
      const category = (target.category ?? '').toLowerCase();
      if (category !== 'cities') continue;

      const pt = projectFn(target.lat, target.lon);
      if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;

      graphics.fillCircle(pt.x, pt.y, cityRadius);
    }
  }

  destroy() {
    this._graphics?.destroy();
    this._graphics = null;
  }
}
