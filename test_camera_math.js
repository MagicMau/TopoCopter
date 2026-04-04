// Simulate the camera clamping and zoom logic

const WORLD_WIDTH = 4096;
const WORLD_HEIGHT = 2048;

// Simulate camera at different zoom levels
const cameraWidth = 1024;  // typical viewport
const cameraHeight = 768;

console.log('=== TESTING NORTH PAN RESTRICTION ===\n');

function testZoomAndPan(zoom) {
  console.log(`\nZoom: ${zoom}`);
  
  const viewWidth = cameraWidth / zoom;
  const viewHeight = cameraHeight / zoom;
  
  console.log(`  View dimensions: ${viewWidth.toFixed(2)} x ${viewHeight.toFixed(2)}`);
  
  const maxScrollX = Math.max(WORLD_WIDTH - viewWidth, 0);
  const maxScrollY = Math.max(WORLD_HEIGHT - viewHeight, 0);
  
  console.log(`  Max scroll X: ${maxScrollX.toFixed(2)}, Max scroll Y: ${maxScrollY.toFixed(2)}`);
  
  // If maxScrollY is 0, the world height equals view height
  // Let's say we try to pan to Y=0 (top of world)
  let targetScrollY = 0;
  let clampedScrollY;
  
  if (maxScrollY > 0) {
    clampedScrollY = Math.max(0, Math.min(targetScrollY, maxScrollY));
  } else {
    // World is smaller than view, center it
    clampedScrollY = (WORLD_HEIGHT - viewHeight) * 0.5;
  }
  
  console.log(`  Target scrollY: ${targetScrollY}, Clamped: ${clampedScrollY.toFixed(2)}`);
  
  // Now what if we try to scroll north (decrease scrollY)?
  targetScrollY = -100;
  if (maxScrollY > 0) {
    clampedScrollY = Math.max(0, Math.min(targetScrollY, maxScrollY));
  } else {
    clampedScrollY = (WORLD_HEIGHT - viewHeight) * 0.5;
  }
  console.log(`  Target scrollY (negative): ${targetScrollY}, Clamped: ${clampedScrollY.toFixed(2)}`);
  
  // At what zoom does viewHeight exceed WORLD_HEIGHT?
  const zoomWhenViewExceedsWorld = cameraHeight / WORLD_HEIGHT;
  console.log(`  Zoom threshold when viewHeight >= WORLD_HEIGHT: ${zoomWhenViewExceedsWorld.toFixed(4)}`);
  console.log(`  Currently viewHeight > WORLD_HEIGHT: ${viewHeight > WORLD_HEIGHT}`);
}

// Test at various zoom levels
testZoomAndPan(1);      // Min zoom
testZoomAndPan(2);      // 2x
testZoomAndPan(3);      // 3x
testZoomAndPan(4);      // viewHeight = 768/4 = 192 < 2048
const zoomThreshold = 768 / 2048;
console.log(`\n\nZoom at threshold (viewHeight = WORLD_HEIGHT): ${zoomThreshold.toFixed(4)}`);
testZoomAndPan(zoomThreshold);
testZoomAndPan(zoomThreshold * 0.9);  // Just below threshold
testZoomAndPan(zoomThreshold * 1.1);  // Just above threshold (overshoots world)

console.log('\n\n=== TESTING CLICK TARGETING ===\n');

// Simulate click-to-world conversion
function testClickToWorld(clickCanvasX, clickCanvasY, scrollX, scrollY, zoom) {
  // This is the formula from getPointerWorldPoint
  // output.x = camera.scrollX + (canvasPoint.x - camera.x) / zoom;
  // Note: camera.x is the camera's x position on canvas, typically 0 or camera.width/2?
  
  const cameraX = 0;  // Assuming camera x position on canvas
  const cameraY = 0;  // Assuming camera y position on canvas
  
  const worldX = scrollX + (clickCanvasX - cameraX) / zoom;
  const worldY = scrollY + (clickCanvasY - cameraY) / zoom;
  
  return { worldX, worldY };
}

// Simulate clicking on Amsterdam (roughly at lon=5, lat=52)
// In world space at default zoom, this would be around x=1250, y=650
const amsterdamWorldX = 1250;
const amsterdamWorldY = 650;

// Now project it to canvas at zoom=4
const zoom = 4;
// To see Amsterdam at center of screen during zoom=4:
// Amsterdam should be at scrollX + cameraWidth/2/zoom = amsterdamWorldX
// scrollX = amsterdamWorldX - cameraWidth/2/zoom = 1250 - 512/4 = 1250 - 128 = 1122
const scrollXForAmsterdam = amsterdamWorldX - cameraWidth / 2 / zoom;
const scrollYForAmsterdam = amsterdamWorldY - cameraHeight / 2 / zoom;

console.log(`Amsterdam world coords: (${amsterdamWorldX}, ${amsterdamWorldY})`);
console.log(`Camera scroll for Amsterdam centered at zoom ${zoom}: (${scrollXForAmsterdam.toFixed(2)}, ${scrollYForAmsterdam.toFixed(2)})`);

// Now click at center of screen (should get Amsterdam)
const clickCenterX = cameraWidth / 2;
const clickCenterY = cameraHeight / 2;
let result = testClickToWorld(clickCenterX, clickCenterY, scrollXForAmsterdam, scrollYForAmsterdam, zoom);
console.log(`Click at canvas center (${clickCenterX}, ${clickCenterY}) -> world: (${result.worldX.toFixed(2)}, ${result.worldY.toFixed(2)})`);

// Now what if we click at the same canvas position but with different scrollX (shifted west)?
const shiftedScrollX = scrollXForAmsterdam - 200;  // Shifted west
result = testClickToWorld(clickCenterX, clickCenterY, shiftedScrollX, scrollYForAmsterdam, zoom);
console.log(`Click at canvas center with scrollX shifted 200 west -> world: (${result.worldX.toFixed(2)}, ${result.worldY.toFixed(2)})`);

// Iceland is at roughly lon=-19, lat=65, which would be around x=400, y=500
console.log(`\nIceland roughly at world coords: (400, 500)`);

