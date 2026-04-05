import Phaser from 'phaser';
import Projection from '../core/Projection.js';
import MapLoader from '../core/MapLoader.js';
import MapRenderer from '../core/MapRenderer.js';
import InputController from '../core/InputController.js';
import { DETAIL_LAYER_DEFINITIONS } from '../data/detailLayers.js';
import { DATA_CACHE_KEYS, PHYSICAL_LAYER_DEFINITIONS } from './PreloadScene.js';
import {
  CAMERA_LIMITS,
  MARKER_STYLE,
  MAP_STYLE,
  OVERLAY_STYLE,
  PALETTE,
  UI_COPY,
  WORLD_DEPTHS,
  WORLD_LAYOUT,
} from '../ui/styles.js';

export default class MapScene extends Phaser.Scene {
  constructor(sceneKey = 'MapScene') {
    super(sceneKey);

    this.worldDisplayObjects = [];
    this.uiDisplayObjects = [];
    this.markers = [];
    this.markerDots = [];
    this.lastCameraZoom = 1;
    this.baseMapMinZoom = 1;
    this.detailLayerRenderers = [];
    this.hydroFillLayerRenderers = [];
    this.hydroLineLayerRenderers = [];
  }

  create() {
    const camera = this.cameras.main;
    camera.setBackgroundColor(PALETTE.water);
    camera.setBounds(0, 0, WORLD_LAYOUT.WIDTH, WORLD_LAYOUT.HEIGHT);
    // Disable Phaser's built-in scroll clamping: its formula mixes pixel-units with world-units
    // and gives wrong bounds at zoom != 1. We handle clamping with the correct formula instead.
    camera.useBounds = false;

    this.worldDisplayObjects = [];
    this.uiDisplayObjects = [];
    this.markers = [];
    this.markerDots = [];
    this.detailLayerRenderers = [];
    this.hydroFillLayerRenderers = [];
    this.hydroLineLayerRenderers = [];
    this.projection = new Projection().init(
      WORLD_LAYOUT.WIDTH,
      WORLD_LAYOUT.HEIGHT,
      {
        type: 'equirectangular',
        wrapX: false,
      },
    );

    this.reliefImage = this.createReliefLayer();

    this.mapGraphics = this.registerWorldObject(
      this.add.graphics().setDepth(WORLD_DEPTHS.MAP),
    );
    this.hydroFillGraphics = this.registerWorldObject(
      this.add.graphics().setDepth(WORLD_DEPTHS.HYDRO_FILL),
    );
    this.hydroLineGraphics = this.registerWorldObject(
      this.add.graphics().setDepth(WORLD_DEPTHS.HYDRO_LINE),
    );
    this.mapBorderGraphics = this.registerWorldObject(
      this.add.graphics().setDepth(WORLD_DEPTHS.MAP_BORDER),
    );
    this.detailMapGraphics = this.registerWorldObject(
      this.add.graphics().setDepth(WORLD_DEPTHS.DETAIL_MAP),
    );

    this.renderWorldMap();
    this.renderMarkers();
    this.createWorldContent();

    const minZoom = this.getMinZoom();
    const maxZoom = this.getMaxZoom(minZoom);
    const sceneFocus = this.getInitialCameraFocus();
    const initialFocus = this.clampWorldPoint(sceneFocus?.x, sceneFocus?.y);

    this.baseMapMinZoom = minZoom;
    camera.setZoom(minZoom);
    // Use the correct scroll formula: scrollX = worldX - viewHalfWidth/zoom (world at screen left)
    // camera.centerOn() ignores zoom and gives wrong scroll at zoom != 1.
    camera.scrollX = initialFocus.x - camera.width * 0.5 / minZoom;
    camera.scrollY = initialFocus.y - camera.height * 0.5 / minZoom;
    this.lastCameraZoom = camera.zoom;

    this.inputController = new InputController(
      this,
      this.getInputControllerOptions({
        camera,
        worldWidth: WORLD_LAYOUT.WIDTH,
        worldHeight: WORLD_LAYOUT.HEIGHT,
        minZoom,
        maxZoom,
      }),
    );

    this.createSceneSystems();
    this.syncZoomResponsiveElements();
    this.createOverlay();
    this.createUICamera();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
  }

  createWorldContent() {}

  createSceneSystems() {}

  destroySceneSystems() {}

  getInputControllerOptions(baseOptions) {
    return baseOptions;
  }

  getOverlayText() {
    return UI_COPY.MAP_CONTROLS ?? UI_COPY.CONTROLS;
  }

  getInitialCameraFocus() {
    return {
      x: WORLD_LAYOUT.WIDTH * 0.5,
      y: WORLD_LAYOUT.HEIGHT * 0.5,
    };
  }

  registerWorldObject(gameObject) {
    if (!gameObject) {
      return gameObject;
    }

    this.worldDisplayObjects.push(gameObject);
    this.uiCamera?.ignore(gameObject);

    return gameObject;
  }

  registerUiObject(gameObject) {
    if (!gameObject) {
      return gameObject;
    }

    this.uiDisplayObjects.push(gameObject);
    gameObject.setScrollFactor(0);
    this.cameras.main.ignore(gameObject);

    return gameObject;
  }

  createReliefLayer() {
    if (!this.textures.exists(DATA_CACHE_KEYS.WORLD_RELIEF)) {
      return null;
    }

    return this.registerWorldObject(
      this.add
        .image(
          this.projection.offsetX,
          this.projection.offsetY,
          DATA_CACHE_KEYS.WORLD_RELIEF,
        )
        .setOrigin(0, 0)
        .setDisplaySize(this.projection.mapWidth, this.projection.mapHeight)
        .setAlpha(MAP_STYLE.RELIEF_ALPHA)
        .setTint(PALETTE.reliefTint)
        .setDepth(WORLD_DEPTHS.RELIEF),
    );
  }

  renderWorldMap() {
    const rawGeoJson = this.cache.json.get(DATA_CACHE_KEYS.WORLD_GEOJSON);

    if (!rawGeoJson) {
      return;
    }

    const preparedLayers = MapLoader.prepareGeoJSONCollection([
      {
        id: DATA_CACHE_KEYS.WORLD_GEOJSON,
        geometryType: 'polygon',
        data: rawGeoJson,
        options: {
          simplifyTolerance: MAP_STYLE.GEOJSON_SIMPLIFY_TOLERANCE,
        },
      },
      ...DETAIL_LAYER_DEFINITIONS.map((layer) => ({
        id: layer.id,
        label: layer.label,
        geometryType: 'polygon',
        layerGroup: 'detail',
        renderMode: 'stroke',
        data: this.getPreparedLayerData(layer),
        style: {
          minZoomMultiplier: layer.minZoomMultiplier,
          maxZoomMultiplier: layer.maxZoomMultiplier ?? null,
        },
        options: {
          simplifyTolerance:
            layer.simplifyTolerance ??
            MAP_STYLE.DETAIL_GEOJSON_SIMPLIFY_TOLERANCE,
        },
      })),
      ...PHYSICAL_LAYER_DEFINITIONS.map((layer) => ({
        id: layer.id,
        label: layer.label,
        geometryType: layer.geometryType,
        layerGroup: layer.layerGroup,
        renderMode: layer.renderMode,
        data: this.cache.json.get(layer.cacheKey),
        style: {
          minZoomMultiplier: layer.minZoomMultiplier,
          maxZoomMultiplier: layer.maxZoomMultiplier ?? null,
        },
        options: {
          simplifyTolerance: layer.simplifyTolerance,
        },
      })),
    ]);
    const worldLayer = preparedLayers.layers.find(
      (layer) => layer.id === DATA_CACHE_KEYS.WORLD_GEOJSON,
    );

    if (!worldLayer?.data) {
      return;
    }

    this.mapRenderer = new MapRenderer({
      renderStroke: false,
    });
    this.mapRenderer.loadGeoJSON(worldLayer.data);

    this.mapBorderRenderer = new MapRenderer({
      renderFill: false,
    });
    this.mapBorderRenderer.loadGeoJSON(worldLayer.data);

    this.detailLayerRenderers = this.createLayerRenderers(
      preparedLayers.layers.filter(
        (layer) =>
          layer.layerGroup === 'detail' && layer.data?.polygons?.length > 0,
      ),
    );
    this.hydroFillLayerRenderers = this.createLayerRenderers(
      preparedLayers.layers.filter(
        (layer) =>
          layer.layerGroup === 'hydro-fill' && layer.data?.polygons?.length > 0,
      ),
    );
    this.hydroLineLayerRenderers = this.createLayerRenderers(
      preparedLayers.layers.filter(
        (layer) =>
          layer.layerGroup === 'hydro-line' && layer.data?.lines?.length > 0,
      ),
    );

    if (this.hydroFillGraphics) {
      this.hydroFillGraphics.clear();
      this.hydroFillGraphics.setVisible(this.hydroFillLayerRenderers.length > 0);
    }

    if (this.hydroLineGraphics) {
      this.hydroLineGraphics.clear();
      this.hydroLineGraphics.setVisible(this.hydroLineLayerRenderers.length > 0);
    }

    if (this.detailMapGraphics) {
      this.detailMapGraphics.clear();
      this.detailMapGraphics.setVisible(this.detailLayerRenderers.length > 0);
    }
  }

  getPreparedLayerData(layer) {
    const data = this.cache.json.get(layer.cacheKey);
    const excludedAdmins = Array.isArray(layer?.excludeAdmins) ? layer.excludeAdmins : [];

    if (!data || excludedAdmins.length === 0 || !Array.isArray(data.features)) {
      return data;
    }

    const excludedAdminSet = new Set(excludedAdmins);
    const filteredFeatures = data.features.filter(
      (feature) => !excludedAdminSet.has(feature?.properties?.admin),
    );

    return filteredFeatures.length === data.features.length
      ? data
      : { ...data, features: filteredFeatures };
  }

  createLayerRenderers(layers) {
    return layers.map((layer) => {
      const renderer = new MapRenderer({
        pathType: layer.geometryType,
        renderFill: layer.renderMode === 'fill',
        renderStroke: layer.renderMode !== 'fill',
      });
      renderer.loadGeoJSON(layer.data, {
        geometryType: layer.geometryType,
      });

      return {
        ...layer,
        renderer,
      };
    });
  }

  renderMarkers() {
    const markerData = this.cache.json.get(DATA_CACHE_KEYS.MARKERS);
    const markers = this.normalizeMarkers(markerData)
      .map((marker) => {
        const point = this.projectLatLon(marker.lat, marker.lon);

        return point ? { ...marker, x: point.x, y: point.y } : null;
      })
      .filter(Boolean);

    this.markers = markers;
    this.markerDots = markers
      .map((marker) => this.createMarker(marker))
      .filter(Boolean);
  }

  projectLatLon(lat, lon) {
    const point = this.projection.latLonToPoint(lat, lon);
    const x = Array.isArray(point) ? point[0] : point?.x;
    const y = Array.isArray(point) ? point[1] : point?.y;

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    return { x, y };
  }

  getMarkerCentroid() {
    if (!this.markers?.length) {
      return null;
    }

    let totalX = 0;
    let totalY = 0;

    this.markers.forEach((marker) => {
      totalX += marker.x;
      totalY += marker.y;
    });

    return {
      x: totalX / this.markers.length,
      y: totalY / this.markers.length,
    };
  }

  createMarker(marker) {
    if (!Number.isFinite(marker.x) || !Number.isFinite(marker.y)) {
      return null;
    }

    return this.registerWorldObject(
      this.add
        .circle(
          marker.x,
          marker.y,
          MARKER_STYLE.RADIUS,
          PALETTE.marker,
          MARKER_STYLE.ALPHA,
        )
        .setDepth(MARKER_STYLE.DEPTH ?? WORLD_DEPTHS.MARKER)
        .setStrokeStyle(MARKER_STYLE.STROKE_WIDTH, PALETTE.markerRing, 1)
        .setData('name', marker.name),
    );
  }

  normalizeMarkers(data) {
    const markerList = Array.isArray(data)
      ? data
      : Array.isArray(data?.markers)
        ? data.markers
        : Array.isArray(data?.cities)
          ? data.cities
          : [];

    return markerList
      .map((marker) => ({
        name: marker.name ?? 'marker',
        lat: Number(marker.lat),
        lon: Number(marker.lon),
      }))
      .filter(
        (marker) =>
          Number.isFinite(marker.lat) && Number.isFinite(marker.lon),
      );
  }

  createOverlay() {
    const overlayText = this.getOverlayText();

    if (!overlayText) {
      return;
    }

    this.overlayText = this.registerUiObject(
      this.add
        .text(0, 0, overlayText, {
          fontFamily: OVERLAY_STYLE.FONT_FAMILY,
          fontSize: OVERLAY_STYLE.FONT_SIZE,
          color: PALETTE.overlayText,
          backgroundColor: PALETTE.overlayBackground,
          lineSpacing: OVERLAY_STYLE.LINE_SPACING,
          padding: { x: 12, y: 8 },
        })
        .setDepth(WORLD_DEPTHS.OVERLAY),
    );

    this.layoutOverlay();
  }

  createUICamera() {
    this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.uiCamera.setScroll(0, 0);
    this.uiCamera.setRoundPixels(true);
    if (this.worldDisplayObjects.length > 0) {
      this.uiCamera.ignore(this.worldDisplayObjects);
    }
  }

  layoutOverlay() {
    if (!this.overlayText) {
      return;
    }

    const maxWidth = Math.min(
      OVERLAY_STYLE.MAX_WIDTH,
      Math.max(180, this.scale.width - OVERLAY_STYLE.PADDING * 2),
    );

    this.overlayText.setWordWrapWidth(maxWidth, true);
    this.overlayText.setPosition(OVERLAY_STYLE.PADDING, OVERLAY_STYLE.PADDING);
  }

  syncMarkerScale() {
    if (!this.markerDots?.length) {
      return;
    }

    const zoom = Math.max(this.cameras.main.zoom, 0.0001);
    const markerScale = Phaser.Math.Clamp(
      1 / zoom,
      MARKER_STYLE.MIN_SCALE,
      MARKER_STYLE.MAX_SCALE,
    );

    this.markerDots.forEach((marker) => marker.setScale(markerScale));
  }

  lerpColor(startColor, endColor, progress) {
    const clampedProgress = Phaser.Math.Clamp(progress, 0, 1);
    const startRed = (startColor >> 16) & 0xff;
    const startGreen = (startColor >> 8) & 0xff;
    const startBlue = startColor & 0xff;
    const endRed = (endColor >> 16) & 0xff;
    const endGreen = (endColor >> 8) & 0xff;
    const endBlue = endColor & 0xff;
    const red = Math.round(Phaser.Math.Linear(startRed, endRed, clampedProgress));
    const green = Math.round(
      Phaser.Math.Linear(startGreen, endGreen, clampedProgress),
    );
    const blue = Math.round(
      Phaser.Math.Linear(startBlue, endBlue, clampedProgress),
    );

    return (red << 16) | (green << 8) | blue;
  }

  getScreenSpaceStrokeWidth(targetWidth, zoom) {
    return targetWidth / Math.max(zoom, 0.0001);
  }

  resolveLayerZoomThreshold(multiplier) {
    return Number.isFinite(multiplier)
      ? Math.max(this.baseMapMinZoom ?? this.getMinZoom(), 0.0001) * multiplier
      : null;
  }

  isLayerVisibleAtZoom(layer, zoom) {
    const minZoom = Number.isFinite(layer?.minZoom)
      ? layer.minZoom
      : this.resolveLayerZoomThreshold(layer?.style?.minZoomMultiplier);
    const maxZoom = Number.isFinite(layer?.maxZoom)
      ? layer.maxZoom
      : this.resolveLayerZoomThreshold(layer?.style?.maxZoomMultiplier);

    if (Number.isFinite(minZoom) && zoom < minZoom) {
      return false;
    }

    if (Number.isFinite(maxZoom) && zoom > maxZoom) {
      return false;
    }

    return true;
  }

  getZoomStyleProgress(zoom, startMultiplier, endMultiplier) {
    const baseZoom = Math.max(this.baseMapMinZoom ?? this.getMinZoom(), 0.0001);
    const startZoom = baseZoom * startMultiplier;
    const endZoom = baseZoom * endMultiplier;

    if (!Number.isFinite(startZoom) || !Number.isFinite(endZoom) || endZoom <= startZoom) {
      return zoom >= startZoom ? 1 : 0;
    }

    return Phaser.Math.Clamp((zoom - startZoom) / (endZoom - startZoom), 0, 1);
  }

  getMapVisualState(zoom) {
    const reliefProgress = this.getZoomStyleProgress(
      zoom,
      MAP_STYLE.RELIEF_FADE_START_MULTIPLIER,
      MAP_STYLE.RELIEF_FADE_END_MULTIPLIER,
    );
    const landProgress = this.getZoomStyleProgress(
      zoom,
      MAP_STYLE.LAND_EMPHASIS_START_MULTIPLIER,
      MAP_STYLE.LAND_EMPHASIS_END_MULTIPLIER,
    );
    const borderProgress = this.getZoomStyleProgress(
      zoom,
      MAP_STYLE.BORDER_EMPHASIS_START_MULTIPLIER,
      MAP_STYLE.BORDER_EMPHASIS_END_MULTIPLIER,
    );
    const detailProgress = this.getZoomStyleProgress(
      zoom,
      MAP_STYLE.DETAIL_START_MULTIPLIER,
      MAP_STYLE.DETAIL_FULL_MULTIPLIER,
    );
    const hydroFillProgress = this.getZoomStyleProgress(
      zoom,
      MAP_STYLE.HYDRO_FILL_START_MULTIPLIER,
      MAP_STYLE.HYDRO_FILL_FULL_MULTIPLIER,
    );
    const hydroLineProgress = this.getZoomStyleProgress(
      zoom,
      MAP_STYLE.HYDRO_LINE_START_MULTIPLIER,
      MAP_STYLE.HYDRO_LINE_FULL_MULTIPLIER,
    );
    const vectorProgress = this.getZoomStyleProgress(
      zoom,
      MAP_STYLE.VECTOR_COLOR_START_MULTIPLIER,
      MAP_STYLE.VECTOR_COLOR_END_MULTIPLIER,
    );
    const baseLandColor = this.reliefImage ? PALETTE.landOverlay : PALETTE.land;
    const worldFillAlpha = Phaser.Math.Linear(
      Phaser.Math.Linear(
        this.reliefImage ? MAP_STYLE.LAND_ALPHA : 1,
        this.reliefImage ? MAP_STYLE.LAND_HIGH_ZOOM_ALPHA : 1,
        landProgress,
      ),
      MAP_STYLE.LAND_VECTOR_ALPHA,
      vectorProgress,
    );
    const borderScreenWidth = Phaser.Math.Linear(
      MAP_STYLE.BORDER_SCREEN_WIDTH,
      MAP_STYLE.BORDER_EMPHASIS_SCREEN_WIDTH,
      borderProgress,
    );
    const detailBorderScreenWidth = Phaser.Math.Linear(
      MAP_STYLE.DETAIL_BORDER_SCREEN_WIDTH,
      MAP_STYLE.DETAIL_BORDER_EMPHASIS_SCREEN_WIDTH,
      vectorProgress,
    );
    const hydroLineScreenWidth = Phaser.Math.Linear(
      MAP_STYLE.HYDRO_LINE_SCREEN_WIDTH,
      MAP_STYLE.HYDRO_LINE_EMPHASIS_SCREEN_WIDTH,
      Math.max(hydroLineProgress, vectorProgress),
    );

    return {
      reliefAlpha: Phaser.Math.Linear(
        MAP_STYLE.RELIEF_ALPHA,
        MAP_STYLE.RELIEF_MIN_ALPHA,
        reliefProgress,
      ),
      reliefTint: this.lerpColor(
        PALETTE.reliefTint,
        PALETTE.reliefTintHighZoom,
        Math.max(reliefProgress, vectorProgress),
      ),
      backgroundColor: this.lerpColor(
        PALETTE.water,
        PALETTE.waterVector,
        vectorProgress,
      ),
      worldFillColor: this.lerpColor(
        baseLandColor,
        PALETTE.landVector,
        vectorProgress,
      ),
      worldFillAlpha,
      worldBorderColor: this.lerpColor(
        PALETTE.borderStrong,
        PALETTE.borderVector,
        vectorProgress,
      ),
      worldBorderAlpha: Phaser.Math.Linear(
        MAP_STYLE.BORDER_ALPHA,
        MAP_STYLE.BORDER_HIGH_ZOOM_ALPHA,
        Math.max(borderProgress, vectorProgress),
      ),
      worldBorderWidth: this.getScreenSpaceStrokeWidth(borderScreenWidth, zoom),
      hydroFillColor: this.lerpColor(
        PALETTE.hydroFill,
        PALETTE.hydroFillVector,
        vectorProgress,
      ),
      hydroFillAlpha:
        hydroFillProgress *
        Phaser.Math.Linear(
          MAP_STYLE.HYDRO_FILL_ALPHA,
          MAP_STYLE.HYDRO_FILL_HIGH_ZOOM_ALPHA,
          vectorProgress,
        ),
      hydroFillVisible: hydroFillProgress > 0.01,
      hydroLineColor: this.lerpColor(
        PALETTE.hydroLine,
        PALETTE.hydroLineVector,
        vectorProgress,
      ),
      hydroLineAlpha:
        hydroLineProgress *
        Phaser.Math.Linear(
          MAP_STYLE.HYDRO_LINE_ALPHA,
          MAP_STYLE.HYDRO_LINE_HIGH_ZOOM_ALPHA,
          vectorProgress,
        ),
      hydroLineWidth: this.getScreenSpaceStrokeWidth(hydroLineScreenWidth, zoom),
      hydroLineVisible: hydroLineProgress > 0.01,
      detailFillColor: this.lerpColor(
        PALETTE.detailLand,
        PALETTE.detailLandVector,
        vectorProgress,
      ),
      detailFillAlpha:
        detailProgress *
        Phaser.Math.Linear(
          MAP_STYLE.DETAIL_FILL_ALPHA,
          MAP_STYLE.DETAIL_FILL_HIGH_ZOOM_ALPHA,
          vectorProgress,
        ),
      detailBorderColor: this.lerpColor(
        PALETTE.detailBorder,
        PALETTE.detailBorderVector,
        vectorProgress,
      ),
      detailBorderAlpha:
        detailProgress *
        Phaser.Math.Linear(
          MAP_STYLE.DETAIL_BORDER_ALPHA,
          MAP_STYLE.DETAIL_BORDER_HIGH_ZOOM_ALPHA,
          vectorProgress,
        ),
      detailBorderWidth: this.getScreenSpaceStrokeWidth(
        detailBorderScreenWidth,
        zoom,
      ),
      detailVisible: detailProgress > 0.01,
    };
  }

  renderLayerGroup(graphics, layers, zoom, visible, renderOptions) {
    if (!graphics) {
      return;
    }

    const visibleLayers = layers.filter((layer) =>
      this.isLayerVisibleAtZoom(layer, zoom),
    );

    graphics.clear();
    graphics.setVisible(visible && visibleLayers.length > 0);

    if (!visible) {
      return;
    }

    visibleLayers.forEach((layer) => {
      layer.renderer.render(graphics, this.projection, {
        clear: false,
        ...renderOptions,
      });
    });
  }

  renderVectorLayers(zoom, visualState = this.getMapVisualState(zoom)) {
    this.cameras.main.setBackgroundColor(visualState.backgroundColor);

    if (this.mapRenderer && this.mapGraphics) {
      this.mapRenderer.render(this.mapGraphics, this.projection, {
        fillColor: visualState.worldFillColor,
        fillAlpha: visualState.worldFillAlpha,
        renderStroke: false,
      });
    }

    if (this.mapBorderRenderer && this.mapBorderGraphics) {
      this.mapBorderRenderer.render(this.mapBorderGraphics, this.projection, {
        renderFill: false,
        borderColor: visualState.worldBorderColor,
        borderAlpha: visualState.worldBorderAlpha,
        borderWidth: visualState.worldBorderWidth,
      });
    }

    this.renderLayerGroup(
      this.hydroFillGraphics,
      this.hydroFillLayerRenderers,
      zoom,
      visualState.hydroFillVisible,
      {
        renderStroke: false,
        fillColor: visualState.hydroFillColor,
        fillAlpha: visualState.hydroFillAlpha,
      },
    );

    this.renderLayerGroup(
      this.hydroLineGraphics,
      this.hydroLineLayerRenderers,
      zoom,
      visualState.hydroLineVisible,
      {
        renderFill: false,
        borderColor: visualState.hydroLineColor,
        borderAlpha: visualState.hydroLineAlpha,
        borderWidth: visualState.hydroLineWidth,
      },
    );

    this.renderLayerGroup(
      this.detailMapGraphics,
      this.detailLayerRenderers,
      zoom,
      visualState.detailVisible,
      {
        renderFill: false,
        borderColor: visualState.detailBorderColor,
        borderAlpha: visualState.detailBorderAlpha,
        borderWidth: visualState.detailBorderWidth,
      },
    );
  }

  syncZoomResponsiveElements() {
    this.syncMarkerScale();

    const zoom = Math.max(this.cameras.main.zoom, 0.0001);
    const visualState = this.getMapVisualState(zoom);

    if (this.reliefImage) {
      this.reliefImage.setAlpha(visualState.reliefAlpha);
      this.reliefImage.setTint(visualState.reliefTint);
    }

    this.renderVectorLayers(zoom, visualState);
  }

  clampWorldPoint(x, y) {
    const fallbackX = WORLD_LAYOUT.WIDTH * 0.5;
    const fallbackY = WORLD_LAYOUT.HEIGHT * 0.5;

    return {
      x: Phaser.Math.Clamp(
        Number.isFinite(x) ? x : fallbackX,
        0,
        WORLD_LAYOUT.WIDTH,
      ),
      y: Phaser.Math.Clamp(
        Number.isFinite(y) ? y : fallbackY,
        0,
        WORLD_LAYOUT.HEIGHT,
      ),
    };
  }

  isWorldPointWithinBounds(x, y) {
    return (
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      x >= 0 &&
      x <= WORLD_LAYOUT.WIDTH &&
      y >= 0 &&
      y <= WORLD_LAYOUT.HEIGHT
    );
  }

  getMinZoom() {
    return Math.min(
      this.scale.width / WORLD_LAYOUT.WIDTH,
      this.scale.height / WORLD_LAYOUT.HEIGHT,
    );
  }

  getMaxZoom(minZoom) {
    return Math.max(CAMERA_LIMITS.MAX_ZOOM, minZoom * 2);
  }

  handleResize(gameSize) {
    const camera = this.cameras.main;

    camera.setViewport(0, 0, gameSize.width, gameSize.height);
    camera.setSize(gameSize.width, gameSize.height);
    this.uiCamera?.setViewport(0, 0, gameSize.width, gameSize.height);
    this.uiCamera?.setSize(gameSize.width, gameSize.height);

    const minZoom = this.getMinZoom();
    const maxZoom = this.getMaxZoom(minZoom);

    this.baseMapMinZoom = minZoom;
    this.inputController?.setZoomLimits(minZoom, maxZoom);
    this.lastCameraZoom = camera.zoom;
    this.syncZoomResponsiveElements();
    this.layoutOverlay();
  }

  handleShutdown() {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.destroySceneSystems();
    this.inputController?.destroy();
    if (this.uiCamera) {
      this.cameras.remove(this.uiCamera);
    }
    this.inputController = null;
    this.uiCamera = null;
    this.overlayText = null;
    this.mapGraphics = null;
    this.hydroFillGraphics = null;
    this.hydroLineGraphics = null;
    this.mapBorderGraphics = null;
    this.detailMapGraphics = null;
    this.mapRenderer = null;
    this.mapBorderRenderer = null;
    this.detailLayerRenderers = [];
    this.hydroFillLayerRenderers = [];
    this.hydroLineLayerRenderers = [];
    this.reliefImage = null;
    this.projection = null;
    this.baseMapMinZoom = 1;
    this.markers = [];
    this.markerDots = [];
    this.worldDisplayObjects = [];
    this.uiDisplayObjects = [];
  }

  updateScene() {}

  update(time, delta) {
    this.inputController?.update(time, delta);

    if (this.cameras.main.zoom !== this.lastCameraZoom) {
      this.lastCameraZoom = this.cameras.main.zoom;
      this.syncZoomResponsiveElements();
    }

    this.updateScene(time, delta);
  }
}
