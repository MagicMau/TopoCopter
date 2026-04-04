const WORLD_WIDTH = 4096;
const WORLD_HEIGHT = 2048;
const cameraWidth = 1024;
const cameraHeight = 768;

console.log('=== NORTH PAN BUG ROOT CAUSE ===\n');

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
    // THIS IS THE PROBLEM: When view is bigger than world, it forces scroll to center
    clampedScrollY = (WORLD_HEIGHT - viewHeight) * 0.5;
  }

  return { x: clampedScrollX, y: clampedScrollY };
}

// Scenario: Zoomed in to 2.0x
const zoom = 2.0;
let scrollX = 1024;
let scrollY = 512;

console.log(`Zoom level: ${zoom}`);
const viewHeight = cameraHeight / zoom;  // 768 / 2 = 384
console.log(`View height: ${viewHeight}, World height: ${WORLD_HEIGHT}`);
console.log(`maxScrollY = max(${WORLD_HEIGHT} - ${viewHeight}, 0) = ${Math.max(WORLD_HEIGHT - viewHeight, 0)}`);
console.log(`World is BIGGER than view, so panning is allowed\n`);

// Try to pan north (decrease scrollY)
scrollY = 0;
let clamped = clampCamera(scrollX, scrollY, zoom);
console.log(`Attempt 1: Pan to north edge (scrollY=0) -> clamped: ${clamped.y}`);

scrollY = -100;  // Try to pan further north
clamped = clampCamera(scrollX, scrollY, zoom);
console.log(`Attempt 2: Try to pan beyond north (scrollY=-100) -> clamped: ${clamped.y} (clamped to min=0)\n`);

// Now zoom in VERY far
const zoomFar = 0.3;
scrollX = 1024;
scrollY = 1024;

console.log(`\n=== NOW ZOOM FAR (zoom=${zoomFar}) ===`);
const viewHeightFar = cameraHeight / zoomFar;  // 768 / 0.3 = 2560
console.log(`View height: ${viewHeightFar.toFixed(0)}, World height: ${WORLD_HEIGHT}`);
const maxScrollYFar = Math.max(WORLD_HEIGHT - viewHeightFar, 0);
console.log(`maxScrollY = max(${WORLD_HEIGHT} - ${viewHeightFar.toFixed(0)}, 0) = ${maxScrollYFar.toFixed(0)}`);
console.log(`View is BIGGER than world, so panning is NOT allowed!\n`);

// Try to pan
console.log(`Current scroll: (${scrollX}, ${scrollY})`);
clamped = clampCamera(scrollX, scrollY, zoomFar);
console.log(`After clamp: (${clamped.x.toFixed(0)}, ${clamped.y.toFixed(0)})`);

// The clamped value is:
const centeredY = (WORLD_HEIGHT - viewHeightFar) * 0.5;
console.log(`Forced to center: Y = (${WORLD_HEIGHT} - ${viewHeightFar.toFixed(0)}) * 0.5 = ${centeredY.toFixed(0)}`);

// Now try to drag north
console.log(`\nTry to pan north (drag decreases scrollY):`);
scrollY = centeredY - 100;  // User drags north
console.log(`  User drag -> desired scrollY: ${scrollY.toFixed(0)}`);

clamped = clampCamera(scrollX, scrollY, zoomFar);
console.log(`  After clamp: ${clamped.y.toFixed(0)}`);
console.log(`  Back to center! CAN'T PAN NORTH!`);

// Continue dragging further north
scrollY = centeredY - 300;  // User drags further north
console.log(`\nUser drags further north -> desired scrollY: ${scrollY.toFixed(0)}`);

clamped = clampCamera(scrollX, scrollY, zoomFar);
console.log(`  After clamp: ${clamped.y.toFixed(0)}`);
console.log(`  STILL forced to center!\n`);

console.log(`=== ROOT CAUSE ===`);
console.log(`When viewHeight > worldHeight (zoomed in past full world view):`);
console.log(`- clampCamera ALWAYS forces scrollY to (worldHeight - viewHeight) * 0.5`);
console.log(`- This is the CENTER of the world in the oversized viewport`);
console.log(`- User cannot pan north or south because Y is always clamped to center`);
console.log(`- The farther they zoom, the larger viewHeight becomes`);
console.log(`- And the more stringent the centering becomes`);

