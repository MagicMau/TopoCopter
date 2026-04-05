import { describe, it, expect, vi } from 'vitest';
import TargetVisualizer from '../quiz/TargetVisualizer.js';

const makeGraphics = () => ({
  clear: vi.fn(function () { return this; }),
  fillStyle: vi.fn(function () { return this; }),
  fillCircle: vi.fn(function () { return this; }),
  lineStyle: vi.fn(function () { return this; }),
  strokeCircle: vi.fn(function () { return this; }),
  beginPath: vi.fn(function () { return this; }),
  arc: vi.fn(function () { return this; }),
  strokePath: vi.fn(function () { return this; }),
  setDepth: vi.fn(function () { return this; }),
  destroy: vi.fn(),
});

const makeScene = (graphics = makeGraphics()) => ({
  add: {
    graphics: () => graphics,
  },
  registerWorldObject: (object) => object,
});

describe('TargetVisualizer', () => {
  it('keeps the target hidden until the helicopter is hovering', () => {
    const graphics = makeGraphics();
    const visualizer = new TargetVisualizer(makeScene(graphics));

    visualizer.showTarget(100, 200, 60);
    graphics.clear.mockClear();

    visualizer.updateProgress(0.4, 16, false);

    expect(graphics.clear).toHaveBeenCalledOnce();
    expect(graphics.fillCircle).not.toHaveBeenCalled();
    expect(graphics.strokeCircle).not.toHaveBeenCalled();
    expect(graphics.arc).not.toHaveBeenCalled();
  });

  it('renders the target ring and progress arc while hovering', () => {
    const graphics = makeGraphics();
    const visualizer = new TargetVisualizer(makeScene(graphics));

    visualizer.showTarget(100, 200, 60);
    graphics.clear.mockClear();

    visualizer.updateProgress(0.5, 16, true);

    expect(graphics.fillCircle).toHaveBeenCalledWith(100, 200, 60);
    expect(graphics.strokeCircle).toHaveBeenCalledWith(100, 200, 60);
    expect(graphics.arc).toHaveBeenCalledOnce();
    expect(graphics.strokePath).toHaveBeenCalledOnce();
  });

  it('clears the graphics when the target is hidden', () => {
    const graphics = makeGraphics();
    const visualizer = new TargetVisualizer(makeScene(graphics));

    visualizer.showTarget(100, 200, 60);
    graphics.clear.mockClear();

    visualizer.hideTarget();

    expect(graphics.clear).toHaveBeenCalledOnce();
  });
});
