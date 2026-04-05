import Phaser from 'phaser';
import worldGeoJsonUrl from '../data/world.geojson?url';
import worldReliefUrl from '../data/world-relief.jpg?url';
import markersUrl from '../data/markers.json?url';
import worldMajorLakesUrl from '../data/world-major-lakes.geojson?url';
import worldMajorRiversUrl from '../data/world-major-rivers.geojson?url';
import targetsUrl from '../data/targets.json?url';
import levelsUrl from '../data/levels.json?url';
import quizSetsUrl from '../data/quiz-sets.json?url';
import { DETAIL_LAYER_DEFINITIONS } from '../data/detailLayers.js';
import { MAP_STYLE, OVERLAY_STYLE, PALETTE } from '../ui/styles.js';

export const DATA_CACHE_KEYS = Object.freeze({
  WORLD_GEOJSON: 'world-geojson',
  WORLD_RELIEF: 'world-relief',
  MARKERS: 'city-markers',
  WORLD_MAJOR_LAKES: 'world-major-lakes',
  WORLD_MAJOR_RIVERS: 'world-major-rivers',
  QUIZ_TARGETS: 'quiz-targets',
  QUIZ_LEVELS: 'quiz-levels',
  QUIZ_SETS: 'quiz-sets',
});

export const PHYSICAL_LAYER_DEFINITIONS = Object.freeze([
  {
    id: DATA_CACHE_KEYS.WORLD_MAJOR_LAKES,
    cacheKey: DATA_CACHE_KEYS.WORLD_MAJOR_LAKES,
    label: 'Major lakes',
    url: worldMajorLakesUrl,
    geometryType: 'polygon',
    layerGroup: 'hydro-fill',
    renderMode: 'fill',
    simplifyTolerance: MAP_STYLE.HYDRO_FILL_GEOJSON_SIMPLIFY_TOLERANCE,
    minZoomMultiplier: MAP_STYLE.HYDRO_FILL_START_MULTIPLIER,
  },
  {
    id: DATA_CACHE_KEYS.WORLD_MAJOR_RIVERS,
    cacheKey: DATA_CACHE_KEYS.WORLD_MAJOR_RIVERS,
    label: 'Major rivers',
    url: worldMajorRiversUrl,
    geometryType: 'line',
    layerGroup: 'hydro-line',
    renderMode: 'stroke',
    simplifyTolerance: MAP_STYLE.HYDRO_LINE_GEOJSON_SIMPLIFY_TOLERANCE,
    minZoomMultiplier: MAP_STYLE.HYDRO_LINE_START_MULTIPLIER,
  },
]);

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload() {
    this.cameras.main.setBackgroundColor(PALETTE.water);

    const { width, height } = this.scale;
    const loadingText = this.add
      .text(width * 0.5, height * 0.5, 'Kaart laden…', {
        fontFamily: OVERLAY_STYLE.FONT_FAMILY,
        fontSize: OVERLAY_STYLE.FONT_SIZE,
        color: PALETTE.overlayText,
        backgroundColor: PALETTE.overlayBackground,
        align: 'center',
        padding: { x: 12, y: 8 },
      })
      .setOrigin(0.5);

    this.load.json(DATA_CACHE_KEYS.WORLD_GEOJSON, worldGeoJsonUrl);
    [...DETAIL_LAYER_DEFINITIONS, ...PHYSICAL_LAYER_DEFINITIONS].forEach((layer) => {
      this.load.json(layer.cacheKey, layer.url);
    });
    this.load.json(DATA_CACHE_KEYS.MARKERS, markersUrl);
    this.load.json(DATA_CACHE_KEYS.QUIZ_TARGETS, targetsUrl);
    this.load.json(DATA_CACHE_KEYS.QUIZ_LEVELS, levelsUrl);
    this.load.json(DATA_CACHE_KEYS.QUIZ_SETS, quizSetsUrl);
    this.load.image(DATA_CACHE_KEYS.WORLD_RELIEF, worldReliefUrl);

    this.load.on(Phaser.Loader.Events.PROGRESS, (value) => {
      loadingText.setText(`Kaart laden… ${Math.round(value * 100)}%`);
    });
  }

  create() {
    this.scene.start('QuizSelectionScene');
  }
}
