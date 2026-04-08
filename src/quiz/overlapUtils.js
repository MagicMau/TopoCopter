/**
 * Utilities for detecting geographic overlap between quiz targets and for
 * reordering sequences to avoid placing consecutive targets in the same area.
 */
import { resolveProjectedTargetGeometry } from './targetGeometry.js';

function boundsIntersect(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX &&
         a.minY <= b.maxY && a.maxY >= b.minY;
}

/**
 * Returns true if the projected bounding boxes of targets `a` and `b`
 * intersect in world-coordinate space.
 *
 * @param {object} a         - Target object with at least { lat, lon, id, category }.
 * @param {object} b         - Target object with at least { lat, lon, id, category }.
 * @param {Function} projectFn - (lat, lon) => { x, y } projection function.
 * @param {object} [datasets]  - Optional GeoJSON datasets forwarded to geometry resolution.
 * @returns {boolean}
 */
export function targetsOverlap(a, b, projectFn, datasets = {}) {
  if (typeof projectFn !== 'function') return false;

  const geomA = resolveProjectedTargetGeometry(a, projectFn, datasets);
  const geomB = resolveProjectedTargetGeometry(b, projectFn, datasets);

  if (!geomA?.bounds || !geomB?.bounds) return false;

  return boundsIntersect(geomA.bounds, geomB.bounds);
}

function centreDistanceSq(a, b, projectFn) {
  const aLat = Number(a?.lat);
  const aLon = Number(a?.lon);
  const bLat = Number(b?.lat);
  const bLon = Number(b?.lon);

  if (projectFn) {
    const pa = projectFn(aLat, aLon);
    const pb = projectFn(bLat, bLon);
    if (pa && pb && Number.isFinite(pa.x) && Number.isFinite(pb.x)) {
      const dx = pa.x - pb.x;
      const dy = pa.y - pb.y;
      return dx * dx + dy * dy;
    }
  }

  const dLon = aLon - bLon;
  const dLat = aLat - bLat;
  return dLon * dLon + dLat * dLat;
}

/**
 * Reorders `sequence` in-place so that consecutive items do not have
 * overlapping bounding boxes.
 *
 * Strategy for each conflicting position i:
 *   1. Scan forward for the first item that does not overlap sequence[i-1]
 *      and swap it into position i.
 *   2. If every remaining item overlaps, pick the one with the greatest
 *      centre distance from sequence[i-1] (least-bad) and swap it in.
 *
 * O(n²) worst-case; fine for the typical quiz sequence lengths (~10–30 items).
 *
 * @param {object[]} sequence  - Mutable array of target objects.
 * @param {Function} projectFn - (lat, lon) => { x, y } projection function.
 * @param {object} [datasets]  - Optional GeoJSON datasets for geometry resolution.
 * @returns {object[]} The same (possibly reordered) array.
 */
export function avoidConsecutiveOverlaps(sequence, projectFn, datasets = {}) {
  if (!projectFn || sequence.length < 2) return sequence;

  for (let i = 1; i < sequence.length; i++) {
    if (!targetsOverlap(sequence[i - 1], sequence[i], projectFn, datasets)) {
      continue;
    }

    // Find the first non-overlapping candidate after position i.
    let swapIdx = -1;
    for (let j = i + 1; j < sequence.length; j++) {
      if (!targetsOverlap(sequence[i - 1], sequence[j], projectFn, datasets)) {
        swapIdx = j;
        break;
      }
    }

    if (swapIdx !== -1) {
      [sequence[i], sequence[swapIdx]] = [sequence[swapIdx], sequence[i]];
    } else {
      // All remaining items overlap with the predecessor.
      // Pick the one furthest away (least inconvenient for the player).
      let bestIdx = i;
      let bestDist = centreDistanceSq(sequence[i - 1], sequence[i], projectFn);
      for (let j = i + 1; j < sequence.length; j++) {
        const d = centreDistanceSq(sequence[i - 1], sequence[j], projectFn);
        if (d > bestDist) {
          bestDist = d;
          bestIdx = j;
        }
      }
      if (bestIdx !== i) {
        [sequence[i], sequence[bestIdx]] = [sequence[bestIdx], sequence[i]];
      }
    }
  }

  return sequence;
}
