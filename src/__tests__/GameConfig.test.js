import { afterEach, describe, expect, it, vi } from 'vitest';

const { getAudioManager } = vi.hoisted(() => ({
  getAudioManager: vi.fn(() => ({
    setSoundManager: vi.fn(),
    unlock: vi.fn(),
  })),
}));

vi.mock('phaser', () => ({
  default: {
    AUTO: 0,
    Scale: {
      RESIZE: 1,
      CENTER_BOTH: 2,
    },
  },
}));

vi.mock('../scenes/BootScene.js', () => ({
  default: class BootScene {},
}));

vi.mock('../scenes/PreloadScene.js', () => ({
  default: class PreloadScene {},
}));

vi.mock('../scenes/QuizSelectionScene.js', () => ({
  default: class QuizSelectionScene {},
}));

vi.mock('../scenes/MapScene.js', () => ({
  default: class MapScene {},
}));

vi.mock('../scenes/HelicopterScene.js', () => ({
  default: class HelicopterScene {},
}));

vi.mock('../core/runtimeDebug.js', () => ({
  debugLog: vi.fn(),
  getCanvasMetrics: vi.fn(() => ({})),
  getWindowMetrics: vi.fn(() => ({})),
}));

vi.mock('../audio/AudioManager.js', () => ({
  getAudioManager,
}));

const makeWindow = (options = {}) => ({
  innerWidth: 390,
  innerHeight: 844,
  devicePixelRatio: 2,
  visualViewport: undefined,
  ...options,
});

describe('gameConfig audio setup', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('keeps Phaser audio enabled on WebKit browsers', async () => {
    vi.stubGlobal(
      'window',
      makeWindow({
        webkitConvertPointFromNodeToPage: vi.fn(),
      }),
    );

    const { default: gameConfig } = await import('../core/GameConfig.js');

    expect(gameConfig.audio.noAudio).toBe(false);
  });

  it('registers the Phaser sound manager during postBoot', async () => {
    vi.stubGlobal('window', makeWindow());

    const { default: gameConfig } = await import('../core/GameConfig.js');
    const audioManager = {
      setSoundManager: vi.fn(),
      unlock: vi.fn(),
    };
    getAudioManager.mockReturnValue(audioManager);
    const game = {
      sound: { key: 'sound-manager' },
      canvas: { style: {}, addEventListener: vi.fn() },
      scale: {},
      config: { resolution: 2 },
    };

    gameConfig.callbacks.postBoot(game);

    expect(audioManager.setSoundManager).toHaveBeenCalledWith(game.sound);
  });
});
