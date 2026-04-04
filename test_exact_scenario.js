// Exact scenario from bug report:
// 1. Zoomed in (zoom > 1)
// 2. Click on Amsterdam
// 3. Expected: Helicopter flies to Amsterdam
// 4. Actual: Helicopter flies to Iceland (westward)

const WORLD_WIDTH = 4096;
const WORLD_HEIGHT = 2048;
const cameraWidth = 1024;
const cameraHeight = 768;

console.log('=== EXACT BUG SCENARIO ===\n');

// Amsterdam: lon=5, lat=52
// In world coordinates: approximately (1250, 650) - based on equirectangular projection
const amsterdamWorldX = 1250;
const amsterdamWorldY = 650;

// Iceland: lon=-19, lat=65
// In world coordinates: approximately (400, 500)
const icelandWorldX = 400;
const icelandWorldY = 500;

const zoom = 3;  // Zoomed in

function clampCamera(scrollX, scrollY) {
  const viewWidth = cameraWidth / zoom;
  const viewHeight = cameraHeight / zoom;
  const maxScrollX = Math.max(WORLD_WIDTH - viewWidth, 0);
  const maxScrollY = Math.max(WORLD_HEIGHT - viewHeight, 0);

  if (maxScrollX > 0) {
    scrollX = Math.max(0, Math.min(scrollX, maxScrollX));
  } else {
    scrollX = (WORLD_WIDTH - viewWidth) * 0.5;
  }

  if (maxScrollY > 0) {
    scrollY = Math.max(0, Math.min(scrollY, maxScrollY));
  } else {
    scrollY = (WORLD_HEIGHT - viewHeight) * 0.5;
  }

  return { x: scrollX, y: scrollY };
}

function getPointerWorldPoint(canvasX, canvasY, scrollX, scrollY) {
  const cameraX = 0;
  const cameraY = 0;
  return {
    x: scrollX + (canvasX - cameraX) / zoom,
    y: scrollY + (canvasY - cameraY) / zoom,
  };
}

// Position: Amsterdam centered on screen at zoom 3
const screenCenterX = cameraWidth / 2;
const screenCenterY = cameraHeight / 2;

let scrollX = amsterdamWorldX - screenCenterX / zoom;  // 1250 - 341.33 = 908.67
let scrollY = amsterdamWorldY - screenCenterY / zoom;  // 650 - 256 = 394

console.log(`Amsterdam centered on screen at zoom ${zoom}`);
console.log(`  Scroll needed: (${scrollX.toFixed(2)}, ${scrollY.toFixed(2)})`);

let clamped = clampCamera(scrollX, scrollY);
console.log(`  After clamp: (${clamped.x.toFixed(2)}, ${clamped.y.toFixed(2)})`);
scrollX = clamped.x;
scrollY = clamped.y;

// Verify
let click = getPointerWorldPoint(screenCenterX, screenCenterY, scrollX, scrollY);
console.log(`  Click at screen center -> world: (${click.x.toFixed(1)}, ${click.y.toFixed(1)})`);
console.log(`  Expected Amsterdam: (${amsterdamWorldX}, ${amsterdamWorldY})`);
console.log();

// Now user tries to pan. Let's say they drag left (west)
// This increases scrollX
console.log('Scenario: User drags left (west) by 200 canvas pixels');
const dragAmount = 200;
const dragScrollDelta = dragAmount / zoom;  // Convert to world units: 200 / 3 = 66.67

scrollX += dragScrollDelta;  // Drag increases scrollX
scrollY = 394;  // No vertical drag

console.log(`  Raw scroll after drag: (${scrollX.toFixed(2)}, ${scrollY.toFixed(2)})`);

clamped = clampCamera(scrollX, scrollY);
console.log(`  After clamp: (${clamped.x.toFixed(2)}, ${clamped.y.toFixed(2)})`);
scrollX = clamped.x;
scrollY = clamped.y;

click = getPointerWorldPoint(screenCenterX, screenCenterY, scrollX, scrollY);
console.log(`  Click at screen center -> world: (${click.x.toFixed(1)}, ${click.y.toFixed(1)})`);
console.log(`  Amsterdam is now off-screen to the east\n`);

// Now the user clicks where they THINK Amsterdam is
// But due to the drag, their frame of reference is off
// They're actually clicking on what LOOKS like Amsterdam
console.log('User click (trying to click Amsterdam which is off-screen east):');
console.log('  They click at canvas position that LOOKED like Amsterdam before dragging');

// After dragging west by 200 pixels, Amsterdam moved 200 pixels east on screen
// So user needs to click 200 pixels east of center to hit Amsterdam
const clickCanvasX = screenCenterX + dragAmount;  // 512 + 200 = 712
click = getPointerWorldPoint(clickCanvasX, screenCenterY, scrollX, scrollY);
console.log(`  Click at canvas (${clickCanvasX}, ${screenCenterY}) -> world: (${click.x.toFixed(1)}, ${click.y.toFixed(1)})`);
console.log(`  Should be Amsterdam at (${amsterdamWorldX}, ${amsterdamWorldY})`);
console.log();

// But what if the user DIDN'T account for the drag and clicked at the original center?
console.log('What if user clicked at original screen center (thinking it still shows Amsterdam)?');
click = getPointerWorldPoint(screenCenterX, screenCenterY, scrollX, scrollY);
console.log(`  Click at canvas (${screenCenterX}, ${screenCenterY}) -> world: (${click.x.toFixed(1)}, ${click.y.toFixed(1)})`);
console.log(`  This is now somewhere between Amsterdam and Iceland!`);
console.log(`  Drift from Amsterdam: (${(click.x - amsterdamWorldX).toFixed(1)}, ...)`);

