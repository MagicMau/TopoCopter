// Let's check what camera.x actually is in Phaser
// Based on Phaser source, camera.x is the display origin of the camera on the canvas

// The critical issue: is camera.x the left edge or the center?
// Looking at Phaser BaseCamera source:
// - scrollX/scrollY are the world coordinates of the top-left corner being displayed
// - x/y are the viewport position on the canvas
// - width/height are the viewport size in canvas pixels

// So if camera is at x=0, y=0, width=1024, height=768:
// - A pointer at canvas (512, 384) is at the CENTER of the viewport
// - A pointer at canvas (0, 0) is at the TOP-LEFT of the viewport

// The formula should be:
// worldX = scrollX + (canvasX - camera.x) / zoom
// worldY = scrollY + (canvasY - camera.y) / zoom

// This looks correct! The camera.x and camera.y are subtracted from canvas coords.
// But wait - what if the viewport is NOT at (0,0)?

console.log('=== ANALYZING CAMERA VIEWPORT MATH ===\n');

// Standard case: camera at 0,0, size 1024x768
const scenario1 = {
  camera: { x: 0, y: 0, width: 1024, height: 768, zoom: 1, scrollX: 100, scrollY: 200 },
  canvasPoint: { x: 512, y: 384 },
};

console.log('Scenario 1: Camera at (0,0), standard viewport');
console.log(`  Camera: x=${scenario1.camera.x}, y=${scenario1.camera.y}, width=${scenario1.camera.width}, height=${scenario1.camera.height}`);
console.log(`  Canvas point: (${scenario1.canvasPoint.x}, ${scenario1.canvasPoint.y})`);
console.log(`  Scroll: (${scenario1.camera.scrollX}, ${scenario1.camera.scrollY})`);

let worldX = scenario1.camera.scrollX + (scenario1.canvasPoint.x - scenario1.camera.x) / scenario1.camera.zoom;
let worldY = scenario1.camera.scrollY + (scenario1.canvasPoint.y - scenario1.camera.y) / scenario1.camera.zoom;
console.log(`  World point: (${worldX}, ${worldY})`);
console.log(`  Expected: (${scenario1.camera.scrollX + 512}, ${scenario1.camera.scrollY + 384})\n`);

// Edge case: what if camera.x is NOT at the left edge?
// This might happen in a split-screen or UI layout
const scenario2 = {
  camera: { x: 100, y: 0, width: 1024, height: 768, zoom: 1, scrollX: 100, scrollY: 200 },
  canvasPoint: { x: 612, y: 384 },  // Canvas point at 612 is center of camera viewport
};

console.log('Scenario 2: Camera at (100,0), offset viewport');
console.log(`  Camera: x=${scenario2.camera.x}, y=${scenario2.camera.y}, width=${scenario2.camera.width}, height=${scenario2.camera.height}`);
console.log(`  Canvas point: (${scenario2.canvasPoint.x}, ${scenario2.canvasPoint.y})`);
console.log(`  Scroll: (${scenario2.camera.scrollX}, ${scenario2.camera.scrollY})`);

worldX = scenario2.camera.scrollX + (scenario2.canvasPoint.x - scenario2.camera.x) / scenario2.camera.zoom;
worldY = scenario2.camera.scrollY + (scenario2.canvasPoint.y - scenario2.camera.y) / scenario2.camera.zoom;
console.log(`  World point: (${worldX}, ${worldY})`);
console.log(`  Expected: (${scenario2.camera.scrollX + 512}, ${scenario2.camera.scrollY + 384})\n`);

// Now the actual bug scenario: what if camera bounds cause the camera to not cover the full canvas?
console.log('Scenario 3: Zoomed in, world smaller than viewport, camera centering issue');

const cameraWidth = 1024;
const cameraHeight = 768;
const worldWidth = 4096;
const worldHeight = 2048;
const zoom = 0.3;  // Very zoomed out, viewHeight > worldHeight

const viewHeight = cameraHeight / zoom;  // 768 / 0.3 = 2560
console.log(`  Camera viewport: ${cameraWidth}x${cameraHeight}`);
console.log(`  World size: ${worldWidth}x${worldHeight}`);
console.log(`  Zoom: ${zoom}`);
console.log(`  View height at zoom: ${viewHeight}`);
console.log(`  View exceeds world? ${viewHeight > worldHeight}\n`);

// In this case, clamping sets scrollY to center the world:
const maxScrollY = Math.max(worldHeight - viewHeight, 0);  // 2048 - 2560 = -512, clamped to 0
let clampedScrollY;
if (maxScrollY > 0) {
  clampedScrollY = 0;  // min scroll
} else {
  clampedScrollY = (worldHeight - viewHeight) * 0.5;  // center: (2048 - 2560) * 0.5 = -256
}
console.log(`  Max scroll Y: ${maxScrollY}`);
console.log(`  Clamped scroll Y (centered): ${clampedScrollY}`);

// Now a click at canvas Y=0 should be at world Y=0
// But scrollY is -256, so:
let clickWorldY = clampedScrollY + (0 - 0) / zoom;  // -256 + 0 = -256
console.log(`  Click at canvas Y=0 -> world Y=${clickWorldY} (WRONG! Should be topmost visible world Y)`);

// Actually, let me think about this more carefully.
// If world height is 2048 and viewport height is 2560:
// The viewport is BIGGER than the world
// scrollY of -256 means the world is centered in the viewport
// The top of the world (Y=0) appears at canvas Y = scrollOffset = -(-256) = 256
// So a click at canvas Y=0 is actually ABOVE the world
// And a click at canvas Y=256 is at world Y=0

console.log(`\n  Top of world appears at canvas Y: ${-clampedScrollY}`);
console.log(`  So canvas Y=0 is above the world (invalid)\n`);

