import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal Phaser mock: only what Helicopter actually uses.
// ---------------------------------------------------------------------------
vi.mock('phaser', () => {
  class EventEmitter {
    constructor() {
      this._listeners = {};
    }
    on(event, fn) {
      (this._listeners[event] ??= []).push(fn);
      return this;
    }
    off(event, fn) {
      if (this._listeners[event]) {
        this._listeners[event] = this._listeners[event].filter((f) => f !== fn);
      }
      return this;
    }
    emit(event, ...args) {
      (this._listeners[event] ?? []).forEach((fn) => fn(...args));
      return this;
    }
  }

  class ArcadeSprite extends EventEmitter {
    constructor(scene, x, y) {
      super();
      this.scene = scene;
      this.x = x;
      this.y = y;
      this.rotation = 0;
      this.depth = 0;
      this.name = '';
      this.displayWidth = 80;
      this.displayHeight = 80;
      this.body = null;
    }
    setName(n) { this.name = n; return this; }
    setOrigin() { return this; }
    setDepth(d) { this.depth = d; return this; }
    setDisplaySize(w, h) { this.displayWidth = w; this.displayHeight = h; return this; }
    setRotation(r) { this.rotation = r; return this; }
  }

  return {
    default: {
      Physics: {
        Arcade: { Sprite: ArcadeSprite },
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Import AFTER mock so the mock is in place.
// ---------------------------------------------------------------------------
import Helicopter from '../entities/Helicopter.js';

// ---------------------------------------------------------------------------
// Scene factory: textures.exists returns true to skip graphics generation.
// No scene.physics → fallbackBody path is taken.
// ---------------------------------------------------------------------------
const makeScene = () => ({
  textures: { exists: () => true },
  make: { graphics: () => ({}) },
  add: { existing: () => {} },
});

// Capture a sequence of events emitted on an object.
const captureEvents = (emitter, event) => {
  const calls = [];
  emitter.on(event, (payload) => calls.push(payload));
  return calls;
};

describe('Helicopter (fallback-body / no-physics environment)', () => {
  describe('fallback body creation', () => {
    it('creates fallbackBody when scene has no physics', () => {
      const heli = new Helicopter(makeScene(), 0, 0);
      expect(heli.fallbackBody).not.toBeNull();
      expect(heli.body).toBeNull();
    });

    it('getActiveBody() returns fallbackBody', () => {
      const heli = new Helicopter(makeScene(), 0, 0);
      expect(heli.getActiveBody()).toBe(heli.fallbackBody);
    });

    it('fallbackBody dimensions reflect displaySize with minimum clamp', () => {
      const heli = new Helicopter(makeScene(), 0, 0);
      const expectedW = Math.max(heli.displayWidth * 0.56, 16);
      const expectedH = Math.max(heli.displayHeight * 0.42, 10);
      expect(heli.fallbackBody.width).toBeCloseTo(expectedW);
      expect(heli.fallbackBody.height).toBeCloseTo(expectedH);
    });

    it('fallbackBody center is initialized to helicopter position', () => {
      const heli = new Helicopter(makeScene(), 120, 80);
      expect(heli.fallbackBody.center.x).toBeCloseTo(120);
      expect(heli.fallbackBody.center.y).toBeCloseTo(80);
    });

    it('fallbackBody position syncs with helicopter after update moves it', () => {
      const heli = new Helicopter(makeScene(), 0, 0);
      const startX = heli.x;
      // Inject a velocity; MovementController will decelerate it but it stays positive
      heli.fallbackBody.velocity.x = 200;
      heli.fallbackBody.velocity.y = 0;
      heli.update(100);
      // Position must have moved in the positive x direction
      expect(heli.x).toBeGreaterThan(startX);
      // fallbackBody center must track the helicopter's new position
      expect(heli.fallbackBody.center.x).toBeCloseTo(heli.x, 3);
    });
  });

  describe('setTarget / clearTarget', () => {
    it('setTarget emits targetchange with the new target', () => {
      const heli = new Helicopter(makeScene(), 0, 0);
      const events = captureEvents(heli, 'targetchange');
      heli.setTarget(100, 200);
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ x: 100, y: 200 });
    });

    it('setTarget returns this for chaining', () => {
      const heli = new Helicopter(makeScene(), 0, 0);
      expect(heli.setTarget(1, 2)).toBe(heli);
    });

    it('clearTarget emits targetchange(null) when a target was active', () => {
      const heli = new Helicopter(makeScene(), 0, 0);
      heli.setTarget(100, 200);
      const events = captureEvents(heli, 'targetchange');
      heli.clearTarget();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeNull();
    });

    it('clearTarget does NOT emit targetchange when there was no target', () => {
      const heli = new Helicopter(makeScene(), 0, 0);
      const events = captureEvents(heli, 'targetchange');
      heli.clearTarget();
      expect(events).toHaveLength(0);
    });

    it('clearTarget returns this for chaining', () => {
      const heli = new Helicopter(makeScene(), 0, 0);
      expect(heli.clearTarget()).toBe(heli);
    });
  });

  describe('moving / stopped events', () => {
    it('emits moving when velocity crosses above the event threshold', () => {
      const heli = new Helicopter(makeScene(), 0, 0, { movementEventThreshold: 4 });
      const movingEvents = captureEvents(heli, 'moving');
      // Inject a velocity well above the threshold
      heli.fallbackBody.velocity.x = 100;
      heli.update(16);
      expect(movingEvents).toHaveLength(1);
      expect(movingEvents[0]).toMatchObject({ position: expect.any(Object), velocity: expect.any(Object) });
    });

    it('does not re-emit moving on consecutive updates while already moving', () => {
      const heli = new Helicopter(makeScene(), 0, 0, { movementEventThreshold: 4 });
      const movingEvents = captureEvents(heli, 'moving');
      heli.fallbackBody.velocity.x = 100;
      heli.update(16); // first: wasMoving false → emit
      heli.fallbackBody.velocity.x = 100; // keep above threshold
      heli.update(16); // second: wasMoving true → no emit
      expect(movingEvents).toHaveLength(1);
    });

    it('emits stopped when velocity drops below event threshold', () => {
      const heli = new Helicopter(makeScene(), 0, 0, { movementEventThreshold: 4 });
      const stoppedEvents = captureEvents(heli, 'stopped');
      // Prime wasMoving = true
      heli.wasMoving = true;
      // Ensure velocity is 0 (default fallbackBody)
      heli.fallbackBody.velocity.x = 0;
      heli.fallbackBody.velocity.y = 0;
      heli.update(16);
      expect(stoppedEvents).toHaveLength(1);
      expect(stoppedEvents[0]).toMatchObject({ position: expect.any(Object) });
    });

    it('does not emit stopped when wasMoving is already false', () => {
      const heli = new Helicopter(makeScene(), 0, 0);
      const stoppedEvents = captureEvents(heli, 'stopped');
      heli.update(16); // velocity=0, wasMoving=false → no stopped
      expect(stoppedEvents).toHaveLength(0);
    });
  });

  describe('targetchange on arrival', () => {
    it('emits targetchange(null) via update when helicopter reaches its target', () => {
      // Place helicopter at (0,0), target at (1,0) — within default stopThreshold=10
      const heli = new Helicopter(makeScene(), 0, 0);
      heli.setTarget(1, 0);
      const events = captureEvents(heli, 'targetchange');
      heli.update(16);
      // MovementController will clear target on arrival and Helicopter emits targetchange(null)
      expect(events).toContain(null);
    });
  });

  describe('getPosition / getVelocity', () => {
    it('getPosition returns fallbackBody center', () => {
      const heli = new Helicopter(makeScene(), 50, 75);
      expect(heli.getPosition()).toEqual({ x: 50, y: 75 });
    });

    it('getVelocity returns fallbackBody velocity', () => {
      const heli = new Helicopter(makeScene(), 0, 0);
      heli.fallbackBody.velocity.x = 30;
      heli.fallbackBody.velocity.y = -40;
      expect(heli.getVelocity()).toEqual({ x: 30, y: -40 });
    });
  });
});
