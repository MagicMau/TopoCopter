/**
 * Pure framing helpers — no Phaser dependency.
 *
 * Computes the camera scroll and zoom needed to fit a set of geographic
 * targets into a given viewport with optional padding.
 */

/**
 * Project a list of targets to world coordinates and return the bounding box.
 *
 * @param {Array<{lat:number, lon:number}>} targets
 * @param {function(lat:number, lon:number): {x:number, y:number}|null} projectFn
 * @returns {{ minX, maxX, minY, maxY, centerX, centerY } | null}
 */
export function computeTargetBounds(targets, projectFn) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let count = 0;

  for (const t of targets) {
    if (!Number.isFinite(t?.lat) || !Number.isFinite(t?.lon)) {
      continue;
    }

    const pt = projectFn(t.lat, t.lon);

    if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
      continue;
    }

    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
    count += 1;
  }

  if (count === 0) {
    return null;
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    centerX: (minX + maxX) * 0.5,
    centerY: (minY + maxY) * 0.5,
  };
}

/**
 * Compute camera scroll and zoom to fit all targets on screen with padding.
 *
 * Returns `{ scrollX, scrollY, zoom, centerX, centerY }` or `null` when no
 * valid targets can be projected.
 *
 * @param {Array<{lat:number, lon:number}>} targets
 * @param {function(lat:number, lon:number): {x:number, y:number}|null} projectFn
 * @param {number} viewWidth  - camera viewport width in pixels
 * @param {number} viewHeight - camera viewport height in pixels
 * @param {number} [paddingFactor=0.15] - fractional padding on each side
 * @param {number} [maxZoom=Infinity]
 * @returns {{ scrollX:number, scrollY:number, zoom:number, centerX:number, centerY:number } | null}
 */
export function computeFixedFraming(
  targets,
  projectFn,
  viewWidth,
  viewHeight,
  paddingFactor = 0.15,
  maxZoom = Infinity,
) {
  const bounds = computeTargetBounds(targets, projectFn);

  if (!bounds) {
    return null;
  }

  const { minX, maxX, minY, maxY, centerX, centerY } = bounds;

  const bboxWidth = Math.max(maxX - minX, 1);
  const bboxHeight = Math.max(maxY - minY, 1);

  const safePadding = Math.max(Number(paddingFactor) || 0, 0);
  const paddedWidth = bboxWidth * (1 + 2 * safePadding);
  const paddedHeight = bboxHeight * (1 + 2 * safePadding);

  const safeViewWidth = Math.max(Number(viewWidth) || 1, 1);
  const safeViewHeight = Math.max(Number(viewHeight) || 1, 1);

  const zoomX = safeViewWidth / paddedWidth;
  const zoomY = safeViewHeight / paddedHeight;
  const zoom = Math.min(zoomX, zoomY, maxZoom > 0 ? maxZoom : Infinity);

  const safeZoom = Math.max(zoom, 0.0001);

  const scrollX = centerX - safeViewWidth * 0.5 / safeZoom;
  const scrollY = centerY - safeViewHeight * 0.5 / safeZoom;

  return { scrollX, scrollY, zoom: safeZoom, centerX, centerY };
}
