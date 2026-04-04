// Maybe the bug is that camera.x/camera.y are not (0,0)?
// In Phaser, camera.x/camera.y are the VIEWPORT position on the canvas

console.log('=== TESTING WITH CAMERA.X/Y NOT AT ORIGIN ===\n');

const WORLD_WIDTH = 4096;
const WORLD_HEIGHT = 2048;
const cameraWidth = 1024;
const cameraHeight = 768;

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

function getPointerWorldPoint(canvasX, canvasY, scrollX, scrollY, zoom, cameraX, cameraY) {
  return {
    x: scrollX + (canvasX - cameraX) / zoom,
    y: scrollY + (canvasY - cameraY) / zoom,
  };
}

// Case: camera has offset position (e.g., due to Phaser internals or UI layout)
const cameraX = 512;  // Camera is positioned at x=512 on canvas (hypothetically)
const cameraY = 384;  // Camera is centered

const amsterdamWorldX = 1250;
const amsterdamWorldY = 650;

console.log(`Camera position on canvas: (${cameraX}, ${cameraY})`);
console.log(`Camera size: ${cameraWidth}x${cameraHeight}`);

// Current zoom
const zoom = 4;
const screenCenterX = cameraX + cameraWidth / 2;  // Canvas center of camera viewport
const screenCenterY = cameraY + cameraHeight / 2;

console.log(`Screen center on canvas: (${screenCenterX}, ${screenCenterY})`);

// Calculate scroll to center Amsterdam
let scrollX = amsterdamWorldX - (screenCenterX - cameraX) / zoom;
let scrollY = amsterdamWorldY - (screenCenterY - cameraY) / zoom;

console.log(`\nInitial state: Zoom=${zoom}, Amsterdam centered`);
console.log(`  Scroll: (${scrollX.toFixed(2)}, ${scrollY.toFixed(2)})`);

// Verify
let clickPoint = getPointerWorldPoint(screenCenterX, screenCenterY, scrollX, scrollY, zoom, cameraX, cameraY);
console.log(`  Click at screen center: (${clickPoint.x.toFixed(2)}, ${clickPoint.y.toFixed(2)})`);

// Now zoom
const nextZoom = 6;
const prevZoom = zoom;

// WAIT - if camera.x is NOT passed to getPointerWorldPoint, but uses cameraX=0!
// That would be the bug!
console.log(`\n--- POTENTIAL BUG: Using camera.x=0 instead of ${cameraX} ---`);

const anchorWorldX = scrollX + (screenCenterX - 0) / prevZoom;  // BUG: using 0 instead of cameraX!
const anchorWorldY = scrollY + (screenCenterY - 0) / prevZoom;

console.log(`  Anchor world (wrong, using camera.x=0): (${anchorWorldX.toFixed(2)}, ${anchorWorldY.toFixed(2)})`);

// Adjust scroll
scrollX = anchorWorldX - (screenCenterX - 0) / nextZoom;  // BUG
scrollY = anchorWorldY - (screenCenterY - 0) / nextZoom;  // BUG

console.log(`  New scroll (before clamp): (${scrollX.toFixed(2)}, ${scrollY.toFixed(2)})`);

let clamped = clampScroll(scrollX, scrollY, nextZoom);
console.log(`  Clamped scroll: (${clamped.x.toFixed(2)}, ${clamped.y.toFixed(2)})`);

// What do we see?
// ALSO BUG: using 0 instead of cameraX
clickPoint = getPointerWorldPoint(screenCenterX, screenCenterY, clamped.x, clamped.y, nextZoom, 0);  // BUG: using 0
console.log(`  Click at screen center (using camera.x=0): (${clickPoint.x.toFixed(2)}, ${clickPoint.y.toFixed(2)})`);
console.log(`  DRIFT: (${(clickPoint.x - amsterdamWorldX).toFixed(2)}, ${(clickPoint.y - amsterdamWorldY).toFixed(2)})`);

// What we SHOULD see if using correct camera.x
clickPoint = getPointerWorldPoint(screenCenterX, screenCenterY, clamped.x, clamped.y, nextZoom, cameraX);
console.log(`  Click at screen center (using camera.x=${cameraX}): (${clickPoint.x.toFixed(2)}, ${clickPoint.y.toFixed(2)})`);

