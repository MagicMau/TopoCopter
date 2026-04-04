// Trace through zoomTo logic to find the Amsterdam/Iceland bug

const WORLD_WIDTH = 4096;
const WORLD_HEIGHT = 2048;
const cameraWidth = 1024;
const cameraHeight = 768;

console.log('=== TRACING ZOOM-TO LOGIC ===\n');

function clampScroll(scrollX, scrollY, zoom) {
  const viewWidth = cameraWidth / zoom;
  const viewHeight = cameraHeight / zoom;
  const maxScrollX = Math.max(WORLD_WIDTH - viewWidth, 0);
  const maxScrollY = Math.max(WORLD_HEIGHT - viewHeight, 0);

  let clampedScrollX = scrollX;
  if (maxScrollX > 0) {
    clampedScrollX = Math.max(0, Math.min(scrollX, maxScrollX));
  } else {
    clampedScrollX = (WORLD_WIDTH - viewWidth) * 0.5;
  }

  let clampedScrollY = scrollY;
  if (maxScrollY > 0) {
    clampedScrollY = Math.max(0, Math.min(scrollY, maxScrollY));
  } else {
    clampedScrollY = (WORLD_HEIGHT - viewHeight) * 0.5;
  }

  return { x: clampedScrollX, y: clampedScrollY };
}

function getPointerWorldPoint(canvasX, canvasY, scrollX, scrollY, zoom) {
  const cameraX = 0;
  const cameraY = 0;
  return {
    x: scrollX + (canvasX - cameraX) / zoom,
    y: scrollY + (canvasY - cameraY) / zoom,
  };
}

// Simulate: We're zoomed in and Amsterdam is at center of screen
// Amsterdam world coords: ~1250, 650
const amsterdamWorldX = 1250;
const amsterdamWorldY = 650;

// Current zoom level: 4
const zoom = 4;
const screenCenterX = cameraWidth / 2;
const screenCenterY = cameraHeight / 2;

// What's the current scroll to center Amsterdam?
let scrollX = amsterdamWorldX - screenCenterX / zoom;
let scrollY = amsterdamWorldY - screenCenterY / zoom;

console.log(`Initial state: Zoom=${zoom}, Amsterdam centered on screen`);
console.log(`  Scroll: (${scrollX.toFixed(2)}, ${scrollY.toFixed(2)})`);

// Verify click at center gets Amsterdam
let clickPoint = getPointerWorldPoint(screenCenterX, screenCenterY, scrollX, scrollY, zoom);
console.log(`  Click at canvas center: (${clickPoint.x.toFixed(2)}, ${clickPoint.y.toFixed(2)})`);

// Now user zooms to 6x (via zoomTo)
// The formula in zoomTo is:
// 1. Get anchor world point before zoom: anchorWorldX = scrollX + (anchorX - cameraX) / prevZoom
// 2. Set zoom
// 3. Adjust scroll: scrollX = anchorWorldX - (screenX - cameraX) / nextZoom

const nextZoom = 6;
const anchorX = screenCenterX;  // zoomTo defaults to screen center
const anchorY = screenCenterY;

const prevZoom = zoom;
const anchorWorldX = scrollX + (anchorX - 0) / prevZoom;
const anchorWorldY = scrollY + (anchorY - 0) / prevZoom;

console.log(`\nZooming from ${prevZoom} to ${nextZoom}`);
console.log(`  Anchor world point (before zoom): (${anchorWorldX.toFixed(2)}, ${anchorWorldY.toFixed(2)})`);

// Adjust scroll so anchor appears at screen center
scrollX = anchorWorldX - (anchorX - 0) / nextZoom;
scrollY = anchorWorldY - (anchorY - 0) / nextZoom;

console.log(`  New scroll (before clamp): (${scrollX.toFixed(2)}, ${scrollY.toFixed(2)})`);

// Now clamp
let clamped = clampScroll(scrollX, scrollY, nextZoom);
console.log(`  Clamped scroll: (${clamped.x.toFixed(2)}, ${clamped.y.toFixed(2)})`);

// Check what we see at screen center now
clickPoint = getPointerWorldPoint(screenCenterX, screenCenterY, clamped.x, clamped.y, nextZoom);
console.log(`  Click at canvas center after clamp: (${clickPoint.x.toFixed(2)}, ${clickPoint.y.toFixed(2)})`);
console.log(`  Expected Amsterdam: (${amsterdamWorldX}, ${amsterdamWorldY})`);
console.log(`  DRIFT: (${(clickPoint.x - amsterdamWorldX).toFixed(2)}, ${(clickPoint.y - amsterdamWorldY).toFixed(2)})`);

// What if we continue zooming further?
console.log(`\n--- Continuing from zoom=${nextZoom} to zoom=10 ---`);
scrollX = clamped.x;
scrollY = clamped.y;

const nextZoom2 = 10;
const anchorWorldX2 = scrollX + (anchorX - 0) / nextZoom;
const anchorWorldY2 = scrollY + (anchorY - 0) / nextZoom;

console.log(`  Anchor world point (before zoom): (${anchorWorldX2.toFixed(2)}, ${anchorWorldY2.toFixed(2)})`);

scrollX = anchorWorldX2 - (anchorX - 0) / nextZoom2;
scrollY = anchorWorldY2 - (anchorY - 0) / nextZoom2;

console.log(`  New scroll (before clamp): (${scrollX.toFixed(2)}, ${scrollY.toFixed(2)})`);

clamped = clampScroll(scrollX, scrollY, nextZoom2);
console.log(`  Clamped scroll: (${clamped.x.toFixed(2)}, ${clamped.y.toFixed(2)})`);

clickPoint = getPointerWorldPoint(screenCenterX, screenCenterY, clamped.x, clamped.y, nextZoom2);
console.log(`  Click at canvas center after clamp: (${clickPoint.x.toFixed(2)}, ${clickPoint.y.toFixed(2)})`);
console.log(`  DRIFT: (${(clickPoint.x - amsterdamWorldX).toFixed(2)}, ${(clickPoint.y - amsterdamWorldY).toFixed(2)})`);

