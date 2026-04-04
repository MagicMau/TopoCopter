You are generating a complete, modern Phaser.js game inspired by the MSX title “Nederlandse Topografie”.  
The game must run smoothly on iPhone Safari, use a clean vector world map, support touch‑based helicopter navigation, and provide configurable topography quizzes across Europe.

The project is divided into three milestones.  
All code, architecture, and design must support clean extensibility and strict modularity.

============================================================
MILESTONE 1 — VECTOR WORLD MAP ENGINE + ARCHITECTURE
============================================================

ARCHITECTURE:
Create the following project structure:

src/
core/
GameConfig.js
Projection.js
MapLoader.js
MapRenderer.js
InputController.js
scenes/
BootScene.js
PreloadScene.js
MapScene.js
data/
world.geojson
markers.json
ui/
styles.js
assets/
fonts/
icons/

GOALS:

- Load and render a simplified vector world map (GeoJSON/TopoJSON).
- Render land polygons + borders only (no labels, roads, icons).
- Implement lat/lon → pixel projection (equirectangular or Mercator).
- Implement touch-first camera pan + zoom.
- Place a few test markers (Amsterdam, Berlin, Paris).
- Ensure smooth performance on iPhone Safari.

MAP REQUIREMENTS:

- Use a simplified GeoJSON dataset (see recommended dataset below).
- Render using Phaser Graphics:
  - Land fill: #d8d8d8
  - Borders: #444444, thin, crisp
- Cache projected polygon paths for performance.
- Use a single Graphics object for the map layer.

PROJECTION SYSTEM:
Provide a Projection module with:

Projection.init(width, height, options)
Projection.latLonToPoint(lat, lon)
Projection.pointToLatLon(x, y)

Support:

- Equirectangular projection (default)
- Mercator (optional future)

CAMERA + INPUT:

- Drag to pan
- Pinch to zoom (or double-tap fallback)
- Clamp zoom + camera bounds
- Smooth inertial scrolling (optional)

DELIVERABLES:

- Fully rendered world map
- Projection utilities
- Camera controls
- Example markers placed correctly

============================================================
MILESTONE 2 — HELICOPTER MOVEMENT + CAMERA FOLLOW
============================================================

ARCHITECTURE EXTENSION:

src/
core/
MovementController.js
RotationController.js
CameraController.js
entities/
Helicopter.js
scenes/
HelicopterScene.js

GOALS:

- Add a controllable helicopter.
- Implement smooth acceleration-based movement.
- Rotate helicopter toward velocity vector.
- Integrate touch/mouse input for navigation.
- Camera follows helicopter smoothly.

HELICOPTER ENTITY:

- Vector or sprite silhouette.
- Arcade Physics body.
- API:

  Helicopter.setTarget(x, y)
  Helicopter.update(delta)
  Helicopter.getPosition()
  Helicopter.getVelocity()

MOVEMENT CONTROLLER:

- Accepts pointer/touch target.
- Computes desired velocity using:
  - maxSpeed
  - acceleration
  - decelerationRadius
  - stopThreshold
- Smooth easing toward target.
- No snapping.

ROTATION CONTROLLER:

- Rotate toward velocity direction.
- Smooth interpolation.
- Maintain last heading when nearly stationary.

INPUT INTEGRATION:
Touch:

- Tap/hold → fly toward point
- Drag → update target
- Multi-touch still controls map zoom/pan

Mouse:

- Click → set target
- Drag → update target

CAMERA CONTROLLER:

- Smooth follow with configurable lag.
- Clamp to map bounds.
- Integrate with zoom.

DELIVERABLES:

- Helicopter movement + rotation
- Camera follow
- Integrated scene with map + helicopter

============================================================
MILESTONE 3 — TOPOGRAPHY QUIZ SYSTEM
============================================================

GOALS:

- Add educational gameplay loop.
- Randomized target selection.
- Level configuration system.

LEVEL CONFIGURATION:
Each level defines:

- Countries to include
- Cities to include
- Bodies of water to include
- Difficulty settings:
  - hoverTime
  - helicopterSpeed
  - targetRadius

TARGET SYSTEM:

- Randomly select a target from active pool.
- Display target name in UI overlay.
- Player must hover over target for required duration.
- On success:
  - Score increments
  - Next target selected automatically

UI OVERLAY:

- Current target
- Score
- Optional timer
- Optional “Next” button

MAP INTEGRATION:

- Targets placed using projection system.
- Helicopter movement unchanged.

DELIVERABLES:

- Level configuration JSON
- Target selection logic
- Hover detection
- UI overlay

============================================================
RECOMMENDED GEOJSON DATASET
============================================================

Use **Natural Earth Admin 0 + Admin 1** boundaries, simplified:

- Source: Natural Earth (public domain)
- Files:
  - ne_110m_admin_0_countries.geojson
  - ne_110m_land.geojson
- Simplify using:
  - mapshaper.org
  - Settings:
    - Simplify: 5–10%
    - Remove small polygons
    - Remove metadata
    - Keep only:
      - geometry
      - name
      - iso_a2

Reasoning:

- Extremely lightweight
- Clean borders
- Perfect for mobile
- Public domain (no attribution required)

============================================================
MOVEMENT TUNING PRESETS
============================================================

ARCADE (fast, responsive):
{
maxSpeed: 450,
acceleration: 900,
decelerationRadius: 120,
stopThreshold: 6
}

REALISTIC (smooth, weighty):
{
maxSpeed: 280,
acceleration: 420,
decelerationRadius: 200,
stopThreshold: 4
}

MSX-INSPIRED (retro, snappy):
{
maxSpeed: 320,
acceleration: 800,
decelerationRadius: 60,
stopThreshold: 8
}

============================================================
VISUAL STYLE GUIDE
============================================================

MAP:

- Land: #d8d8d8
- Borders: #444444
- Water: #bcd7ff (optional background)
- Markers: #ff4d4d (cities), #4d9aff (water bodies)
- No labels, no icons, no clutter

HELICOPTER:

- Simple geometric silhouette
- Forward direction clearly indicated
- Colors:
  - Body: #333333
  - Rotor: #666666
  - Accent: #ffcc00
- Scales cleanly at all zoom levels

UI:

- Font: clean sans-serif (Inter, Roboto, or system font)
- Colors:
  - Background: rgba(0,0,0,0.4)
  - Text: #ffffff
  - Highlight: #ffcc00
- Touch targets: minimum 44px

MARKERS:

- Circles or small vector icons
- Scale with zoom
- High contrast against map

============================================================
FINAL GOAL
============================================================

Deliver a complete, modern, mobile-friendly topography game where the player:

- Navigates a helicopter across a clean vector map
- Receives randomized geography challenges
- Flies to the correct location
- Learns European topography through interactive play

All milestones must integrate seamlessly into a cohesive, maintainable codebase.
