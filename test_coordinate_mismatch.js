// What if worldWidth/worldHeight in InputController are DIFFERENT 
// from the actual world size used in the clamping or projection?

const ACTUAL_WORLD_WIDTH = 4096;
const ACTUAL_WORLD_HEIGHT = 2048;

// But what if InputController gets initialized with wrong values?
const INPUT_WORLD_WIDTH = 4096;  // Same
const INPUT_WORLD_HEIGHT = 2048;  // Same

const cameraWidth = 1024;
const cameraHeight = 768;

console.log('=== CHECKING COORDINATE CONVERSIONS ===\n');

// When we use Projection.latLonToPoint for Amsterdam:
// Amsterdam is at lon=5, lat=52
// Projection converts to world coordinates
// Let's say it gives us (1250, 650) in world space

// Now, when user clicks on Amsterdam at screen center:
// Click is at canvas (512, 384)
// At zoom 2, scrollX=994, scrollY=458
// getPointerWorldPoint gives us: scrollX + (512-0)/2 = 994 + 256 = 1250 ✓

// But what if the click coordinates are WRONG from Phaser's perspective?
// What if pointer.x / pointer.y are in a different coordinate space?

console.log('Scenario: Pointer coordinates are in canvas space');
const pointerCanvasX = 512;
const pointerCanvasY = 384;
const zoom = 2;
let scrollX = 994;
let scrollY = 458;

let worldX = scrollX + (pointerCanvasX - 0) / zoom;
let worldY = scrollY + (pointerCanvasY - 0) / zoom;

console.log(`Pointer canvas: (${pointerCanvasX}, ${pointerCanvasY})`);
console.log(`Scroll: (${scrollX}, ${scrollY}), Zoom: ${zoom}`);
console.log(`Calculated world: (${worldX}, ${worldY})`);

// Now what if there's a viewport scale issue?
// In some frameworks, canvas mouse events are in CSS coordinates
// But need to be scaled by device pixel ratio or viewport scale

console.log(`\nScenario 2: Pointer is in CSS coordinates, viewport is scaled`);

const devicePixelRatio = 2;  // Hypothetical 2x scaling
const cssPointerX = pointerCanvasX / devicePixelRatio;
const cssPointerY = pointerCanvasY / devicePixelRatio;

console.log(`Device pixel ratio: ${devicePixelRatio}`);
console.log(`CSS pointer: (${cssPointerX}, ${cssPointerY})`);
console.log(`Canvas pointer: (${pointerCanvasX}, ${pointerCanvasY})`);

// If getPointerWorldPoint doesn't account for this:
worldX = scrollX + (cssPointerX - 0) / zoom;
worldY = scrollY + (cssPointerY - 0) / zoom;
console.log(`Using CSS coordinates in world calc: (${worldX}, ${worldY})`);
console.log(`ERROR: Should be (1250, 650) but got (${worldX}, ${worldY})`);
console.log(`Off by: (${1250 - worldX}, ${650 - worldY})`);

