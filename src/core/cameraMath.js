const toFiniteNumber = (value, fallback = 0) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

export function setCameraScroll(camera, x, y) {
  if (!camera) {
    return;
  }

  if (typeof camera.setScroll === 'function') {
    camera.setScroll(x, y);
    return;
  }

  camera.scrollX = x;
  camera.scrollY = y;
}

export function getCameraViewportMetrics(camera, zoom = camera?.zoom) {
  const resolvedZoom = Math.max(toFiniteNumber(zoom, 1), 0.0001);
  const width = toFiniteNumber(camera?.width, 0);
  const height = toFiniteNumber(camera?.height, 0);
  const x = toFiniteNumber(camera?.x, 0);
  const y = toFiniteNumber(camera?.y, 0);
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;
  const viewWidth = width / resolvedZoom;
  const viewHeight = height / resolvedZoom;
  const offsetX = halfWidth - viewWidth * 0.5;
  const offsetY = halfHeight - viewHeight * 0.5;

  return {
    width,
    height,
    x,
    y,
    zoom: resolvedZoom,
    halfWidth,
    halfHeight,
    viewWidth,
    viewHeight,
    offsetX,
    offsetY,
  };
}

export function getCameraVisibleWorldRect(camera, zoom = camera?.zoom, output = {}) {
  const metrics = getCameraViewportMetrics(camera, zoom);
  const scrollX = toFiniteNumber(camera?.scrollX, 0);
  const scrollY = toFiniteNumber(camera?.scrollY, 0);
  const left = scrollX + metrics.offsetX;
  const top = scrollY + metrics.offsetY;

  output.left = left;
  output.top = top;
  output.right = left + metrics.viewWidth;
  output.bottom = top + metrics.viewHeight;
  output.centerX = left + metrics.viewWidth * 0.5;
  output.centerY = top + metrics.viewHeight * 0.5;
  output.width = metrics.viewWidth;
  output.height = metrics.viewHeight;
  output.scrollX = scrollX;
  output.scrollY = scrollY;
  output.zoom = metrics.zoom;

  return output;
}

export function getCameraWorldPoint(
  camera,
  canvasX,
  canvasY,
  zoom = camera?.zoom,
  output = {},
) {
  const metrics = getCameraViewportMetrics(camera, zoom);
  const visibleRect = getCameraVisibleWorldRect(camera, zoom);
  const screenX = toFiniteNumber(canvasX, metrics.x + metrics.halfWidth);
  const screenY = toFiniteNumber(canvasY, metrics.y + metrics.halfHeight);

  output.x = visibleRect.left + (screenX - metrics.x) / metrics.zoom;
  output.y = visibleRect.top + (screenY - metrics.y) / metrics.zoom;

  return output;
}

export function getCameraScrollForWorldPoint(
  camera,
  worldX,
  worldY,
  screenX,
  screenY,
  zoom = camera?.zoom,
  output = {},
) {
  const metrics = getCameraViewportMetrics(camera, zoom);
  const targetScreenX = toFiniteNumber(screenX, metrics.x + metrics.halfWidth);
  const targetScreenY = toFiniteNumber(screenY, metrics.y + metrics.halfHeight);

  output.x =
    toFiniteNumber(worldX, 0) -
    metrics.halfWidth -
    (targetScreenX - metrics.x - metrics.halfWidth) / metrics.zoom;
  output.y =
    toFiniteNumber(worldY, 0) -
    metrics.halfHeight -
    (targetScreenY - metrics.y - metrics.halfHeight) / metrics.zoom;

  return output;
}

export function getCameraScrollForWorldCenter(camera, centerX, centerY, output = {}) {
  const metrics = getCameraViewportMetrics(camera);

  output.x = toFiniteNumber(centerX, 0) - metrics.halfWidth;
  output.y = toFiniteNumber(centerY, 0) - metrics.halfHeight;

  return output;
}

export function getCameraScrollForVisibleWorldOrigin(
  camera,
  left,
  top,
  zoom = camera?.zoom,
  output = {},
) {
  const metrics = getCameraViewportMetrics(camera, zoom);

  output.x = toFiniteNumber(left, 0) - metrics.offsetX;
  output.y = toFiniteNumber(top, 0) - metrics.offsetY;

  return output;
}
