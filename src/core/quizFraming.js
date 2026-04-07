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

function normalizeBounds(bounds) {
  if (!bounds) {
    return null;
  }

  const minX = Number(bounds.minX);
  const maxX = Number(bounds.maxX);
  const minY = Number(bounds.minY);
  const maxY = Number(bounds.maxY);

  if (![minX, maxX, minY, maxY].every(Number.isFinite)) {
    return null;
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    centerX:
      Number.isFinite(Number(bounds.centerX))
        ? Number(bounds.centerX)
        : (minX + maxX) * 0.5,
    centerY:
      Number.isFinite(Number(bounds.centerY))
        ? Number(bounds.centerY)
        : (minY + maxY) * 0.5,
  };
}

/**
 * Like `computeTargetBounds` but optionally expands each target's contribution
 * using its geographic bounding box (e.g. a country polygon) rather than just
 * its centroid.
 *
 * @param {Array<{lat:number, lon:number}>} targets
 * @param {function(lat:number, lon:number): {x:number, y:number}|null} projectFn
 * @param {function(target): {minLon, maxLon, minLat, maxLat}|null} [getTargetBbox]
 *   Optional callback that returns a lat/lon bounding box for a given target.
 *   When it returns `null` or is not provided, the centroid is used as a point.
 * @returns {{ minX, maxX, minY, maxY, centerX, centerY } | null}
 */
export function computeTargetBoundsExpanded(targets, projectFn, getTargetBbox = null) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let count = 0;

  function addProjected(lat, lon) {
    const pt = projectFn(lat, lon);
    if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
    count += 1;
  }

  for (const t of targets) {
    if (!Number.isFinite(t?.lat) || !Number.isFinite(t?.lon)) continue;

    const bbox = getTargetBbox ? getTargetBbox(t) : null;
    if (bbox && Number.isFinite(bbox.minLon)) {
      // Use all four corners of the geographic bbox
      addProjected(bbox.minLat, bbox.minLon);
      addProjected(bbox.maxLat, bbox.maxLon);
      addProjected(bbox.minLat, bbox.maxLon);
      addProjected(bbox.maxLat, bbox.minLon);
    } else {
      addProjected(t.lat, t.lon);
    }
  }

  if (count === 0) return null;

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
 * Returns `{ scrollX, scrollY, cameraScrollX, cameraScrollY, zoom, centerX,
 * centerY }` or `null` when no valid targets can be projected.
 *
 * `scrollX` / `scrollY` are the visible world-rect top-left values.
 * `cameraScrollX` / `cameraScrollY` are the Phaser camera `scrollX` /
 * `scrollY` values needed to centre the view on `centerX` / `centerY`.
 *
 * @param {Array<{lat:number, lon:number}>} targets
 * @param {function(lat:number, lon:number): {x:number, y:number}|null} projectFn
 * @param {number} viewWidth  - camera viewport width in pixels
 * @param {number} viewHeight - camera viewport height in pixels
 * @param {number} [paddingFactor=0.15] - fractional padding on each side
 * @param {number} [maxZoom=Infinity]
 * @returns {{ scrollX:number, scrollY:number, zoom:number, centerX:number, centerY:number } | null}
 */
export function computeFixedFramingFromBounds(
  bounds,
  viewWidth,
  viewHeight,
  paddingFactor = 0.15,
  maxZoom = Infinity,
) {
  const normalizedBounds = normalizeBounds(bounds);
  if (!normalizedBounds) {
    return null;
  }

  const { minX, maxX, minY, maxY, centerX, centerY } = normalizedBounds;

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
  const cameraScrollX = centerX - safeViewWidth * 0.5;
  const cameraScrollY = centerY - safeViewHeight * 0.5;

  return {
    scrollX,
    scrollY,
    cameraScrollX,
    cameraScrollY,
    zoom: safeZoom,
    centerX,
    centerY,
  };
}

/**
 * Compute camera scroll and zoom to fit all targets on screen with padding.
 *
 * Returns `{ scrollX, scrollY, cameraScrollX, cameraScrollY, zoom, centerX,
 * centerY }` or `null` when no valid targets can be projected.
 *
 * `scrollX` / `scrollY` are the visible world-rect top-left values.
 * `cameraScrollX` / `cameraScrollY` are the Phaser camera `scrollX` /
 * `scrollY` values needed to centre the view on `centerX` / `centerY`.
 *
 * @param {Array<{lat:number, lon:number}>} targets
 * @param {function(lat:number, lon:number): {x:number, y:number}|null} projectFn
 * @param {number} viewWidth  - camera viewport width in pixels
 * @param {number} viewHeight - camera viewport height in pixels
 * @param {number} [paddingFactor=0.15] - fractional padding on each side
 * @param {number} [maxZoom=Infinity]
 * @param {function(target): {minLon, maxLon, minLat, maxLat}|null} [getTargetBbox]
 *   Optional callback supplying a geographic bbox per target; when provided the
 *   framing expands to cover the full extent of each target (e.g. a country
 *   polygon), not just its centroid.  Falls back to the centroid when the
 *   callback returns `null`.
 * @returns {{ scrollX:number, scrollY:number, zoom:number, centerX:number, centerY:number } | null}
 */
export function computeFixedFraming(
  targets,
  projectFn,
  viewWidth,
  viewHeight,
  paddingFactor = 0.15,
  maxZoom = Infinity,
  getTargetBbox = null,
) {
  const bounds = getTargetBbox
    ? computeTargetBoundsExpanded(targets, projectFn, getTargetBbox)
    : computeTargetBounds(targets, projectFn);

  return computeFixedFramingFromBounds(
    bounds,
    viewWidth,
    viewHeight,
    paddingFactor,
    maxZoom,
  );
}

