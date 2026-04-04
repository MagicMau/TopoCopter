const WORLD_WIDTH = 4096;
const WORLD_HEIGHT = 2048;
const cameraWidth = 1024;
const cameraHeight = 768;

console.log('=== CLICK TARGETING DIVERGENCE WITH CLAMPING ===\n');

function clampCamera(scrollX, scrollY, zoom) {
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

function getPointerWorldPoint(canvasX, canvasY, scrollX, scrollY, zoom, cameraX = 0, cameraY = 0) {
  return {
    x: scrollX + (canvasX - cameraX) / zoom,
    y: scrollY + (canvasY - cameraY) / zoom,
  };
}

// Scenario: Amsterdam is visible at screen center, zoomed 2x
const zoom = 2.0;
const amsterdamWorldX = 1250;
const amsterdamWorldY = 650;

const screenCenterX = cameraWidth / 2;  // 512
const screenCenterY = cameraHeight / 2;  // 384

// Calculate scroll to position Amsterdam at screen center
let scrollX = amsterdamWorldX - screenCenterX / zoom;  // 1250 - 256 = 994
let scrollY = amsterdamWorldY - screenCenterY / zoom;  // 650 - 192 = 458

console.log(`Initial: Amsterdam at world (${amsterdamWorldX}, ${amsterdamWorldY}) centered on screen`);
console.log(`  Scroll: (${scrollX}, ${scrollY})`);

let click = getPointerWorldPoint(screenCenterX, screenCenterY, scrollX, scrollY, zoom);
console.log(`  Click at screen center -> world: (${click.x.toFixed(1)}, ${click.y.toFixed(1)})`);

// Now the KEY part: What if the camera is clamped and scroll doesn't match the view?
console.log(`\n=== ASYMMETRIC CLAMPING SCENARIO ===`);

// Zoom 3x
const zoom3 = 3.0;
const viewWidth3 = cameraWidth / zoom3;  // 341.33
const maxScrollX3 = Math.max(WORLD_WIDTH - viewWidth3, 0);  // 4096 - 341 = 3754.67

console.log(`Zoom: ${zoom3}, viewWidth: ${viewWidth3.toFixed(1)}, maxScrollX: ${maxScrollX3.toFixed(1)}`);

// Position Amsterdam near the right edge of world
const scrollXNearBoundary = maxScrollX3 - 50;  // Near east boundary
scrollY = 650;

console.log(`\nPosition near EAST boundary: scrollX = ${scrollXNearBoundary.toFixed(1)}`);

click = getPointerWorldPoint(screenCenterX, screenCenterY, scrollXNearBoundary, scrollY, zoom3);
console.log(`  Click at screen center -> world: (${click.x.toFixed(1)}, ${click.y.toFixed(1)})`);

// Now try to pan further east (drag west on screen, which INCREASES scrollX)
const attemptedScrollX = scrollXNearBoundary + 300;  // Attempt to pan further east
console.log(`\nAttempt to pan further east:`);
console.log(`  Desired scroll: ${attemptedScrollX.toFixed(1)}`);

let clamped = clampCamera(attemptedScrollX, scrollY, zoom3);
console.log(`  Clamped scroll: ${clamped.x.toFixed(1)}`);
console.log(`  Clamping applied: was ${attemptedScrollX.toFixed(1)}, now ${clamped.x.toFixed(1)}`);

click = getPointerWorldPoint(screenCenterX, screenCenterY, clamped.x, scrollY, zoom3);
console.log(`  Click at screen center -> world: (${click.x.toFixed(1)}, ${click.y.toFixed(1)})`);
console.log(`  Position shifted WEST by: ${((attemptedScrollX - clamped.x) / zoom3).toFixed(1)} world units`);

console.log(`\n=== POSSIBLE ROOT CAUSE FOR ICELAND BUG ===`);
console.log(`The Amsterdam/Iceland bug might be caused by:` );
console.log(`1. Clamping happens at different times than click calculation`);
console.log(`2. OR: Zoom operation doesn't preserve the correct anchor point`);
console.log(`3. OR: There's an off-by-one or unit conversion error`);

// Let me test the ZOOM scenario more carefully
console.log(`\n=== ZOOMING AND ANCHOR POINT ===`);

const testZoom1 = 2;
let testScroll = 1000;

console.log(`Start: zoom=${testZoom1}, scrollX=${testScroll}`);
click = getPointerWorldPoint(screenCenterX, screenCenterY, testScroll, 400, testZoom1);
console.log(`  Screen center world point: ${click.x.toFixed(1)}`);

// Zoom to 4x, trying to keep the same world point at screen center
const testZoom2 = 4;
// To keep the world point at screen center:
// testScroll2 = worldPoint - screenCenterX / testZoom2
const worldPoint = click.x;
const testScroll2 = worldPoint - screenCenterX / testZoom2;
console.log(`\nZoom to ${testZoom2}:`);
console.log(`  To keep world point ${worldPoint.toFixed(1)} centered:`);
console.log(`  Need scrollX = ${worldPoint.toFixed(1)} - ${screenCenterX} / ${testZoom2} = ${testScroll2.toFixed(1)}`);

// Now apply clamping
clamped = clampCamera(testScroll2, 400, testZoom2);
console.log(`  After clamp: ${clamped.x.toFixed(1)}`);
if (clamped.x !== testScroll2) {
  console.log(`  CLAMPING APPLIED! Scroll changed by: ${(clamped.x - testScroll2).toFixed(1)}`);
  click = getPointerWorldPoint(screenCenterX, screenCenterY, clamped.x, 400, testZoom2);
  console.log(`  New world point at screen center: ${click.x.toFixed(1)}`);
  console.log(`  DRIFT: ${(click.x - worldPoint).toFixed(1)} world units`);
}

