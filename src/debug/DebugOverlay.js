import { WORLD_DEPTHS } from '../ui/styles.js';
import { geometryContainsPoint, resolveProjectedTargetGeometry } from '../quiz/targetGeometry.js';
import { DATA_CACHE_KEYS } from '../scenes/PreloadScene.js';

const DIM_DEPTH = WORLD_DEPTHS.DETAIL_MAP + 0.1;
const HINT_DEPTH = WORLD_DEPTHS.QUIZ_TARGET - 0.1;
const CITY_SCREEN_RADIUS = 6;
const DIM_COLOR = 0x0f172a;
const DIM_ALPHA = 0.35;
const OUTLINE_COLOR = 0x2f6b3d;
const OUTLINE_ALPHA = 0.85;
const OUTLINE_SCREEN_WIDTH = 2;
const CITY_COLOR = OUTLINE_COLOR;
const CITY_ALPHA = 0.65;

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

    const isQuizTarget = quizCountryTargets.some((target) =>
      geometryContainsPoint({ type: 'Polygon', coordinates: polygon }, target.lon, target.lat));

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

function traceProjectedRing(graphics, ring) {
  if (!ring || ring.length < 6) {
    return false;
  }

  graphics.beginPath();
  graphics.moveTo(ring[0], ring[1]);
  for (let i = 2; i < ring.length; i += 2) {
    graphics.lineTo(ring[i], ring[i + 1]);
  }
  graphics.closePath();
  return true;
}

export default class DebugOverlay {
  constructor(scene) {
    this._scene = scene;
    this._enabled = true;
    this._dimGraphics = scene.add.graphics();
    this._hintGraphics = scene.add.graphics();

    this._dimGraphics.setDepth(DIM_DEPTH);
    this._dimGraphics.setScrollFactor(1);
    this._hintGraphics.setDepth(HINT_DEPTH);
    this._hintGraphics.setScrollFactor(1);

    scene.registerWorldObject(this._dimGraphics);
    scene.registerWorldObject(this._hintGraphics);
  }

  get enabled() {
    return this._enabled;
  }

  render(quizTargets) {
    const dimGraphics = this._dimGraphics;
    const hintGraphics = this._hintGraphics;
    dimGraphics?.clear();
    hintGraphics?.clear();

    if (!quizTargets || quizTargets.length === 0) return;

    const scene = this._scene;
    const worldGeoJson = scene.cache?.json?.get(DATA_CACHE_KEYS.WORLD_GEOJSON);
    const lakesGeoJson = scene.cache?.json?.get(DATA_CACHE_KEYS.WORLD_MAJOR_LAKES);
    const riversGeoJson = scene.cache?.json?.get(DATA_CACHE_KEYS.WORLD_MAJOR_RIVERS);
    const zoom = Math.max(scene.cameras?.main?.zoom ?? 1, 0.0001);
    const projectFn = (lat, lon) => scene.projectLatLon(lat, lon);
    const datasets = { worldGeoJson, lakesGeoJson, riversGeoJson };

    if (worldGeoJson && dimGraphics) {
      const quizCountryTargets = quizTargets.filter(
        (target) => (target.category ?? '').toLowerCase() === 'countries',
      );

      dimGraphics.fillStyle(DIM_COLOR, DIM_ALPHA);

      for (const feature of (worldGeoJson.features ?? [])) {
        const geometry = feature.geometry;
        if (!geometry) continue;

        drawDimmedNonQuizPolygons(dimGraphics, geometry, quizCountryTargets, projectFn);
      }
    }

    if (!hintGraphics) {
      return;
    }

    hintGraphics.lineStyle(OUTLINE_SCREEN_WIDTH / zoom, OUTLINE_COLOR, OUTLINE_ALPHA);

    for (const target of quizTargets) {
      const category = (target.category ?? '').toLowerCase();
      if (category === 'cities' || category === 'areas') continue;

      const geom = resolveProjectedTargetGeometry(target, projectFn, datasets);
      if (!geom) continue;

      if (geom.kind === 'polygon') {
        for (const polygon of geom.polygons) {
          for (const ring of polygon) {
            if (!traceProjectedRing(hintGraphics, ring)) continue;
            hintGraphics.strokePath();
          }
        }
      } else if (geom.kind === 'line') {
        for (const line of geom.lines) {
          if (!traceProjectedRing(hintGraphics, line)) continue;
          hintGraphics.strokePath();
        }
      }
    }

    const cityRadius = CITY_SCREEN_RADIUS / zoom;
    hintGraphics.fillStyle(CITY_COLOR, CITY_ALPHA);

    for (const target of quizTargets) {
      const category = (target.category ?? '').toLowerCase();
      if (category !== 'cities') continue;

      const pt = projectFn(target.lat, target.lon);
      if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;

      hintGraphics.fillCircle(pt.x, pt.y, cityRadius);
      hintGraphics.strokeCircle(pt.x, pt.y, cityRadius);
    }
  }

  destroy() {
    this._dimGraphics?.destroy();
    this._hintGraphics?.destroy();
    this._dimGraphics = null;
    this._hintGraphics = null;
  }
}
