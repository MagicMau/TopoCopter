import Phaser from 'phaser';
import BootScene from '../scenes/BootScene.js';
import PreloadScene from '../scenes/PreloadScene.js';
import QuizSelectionScene from '../scenes/QuizSelectionScene.js';
import MapScene from '../scenes/MapScene.js';
import HelicopterScene from '../scenes/HelicopterScene.js';
import {
  debugLog,
  getCanvasMetrics,
  getWindowMetrics,
} from './runtimeDebug.js';
import { getAudioManager } from '../audio/AudioManager.js';
import { isWebKitBrowser } from './browser.js';

const DEFAULT_VIEWPORT = {
  width: 390,
  height: 844
};

const readInitialViewport = () => {
  if (typeof window === 'undefined') {
    return DEFAULT_VIEWPORT;
  }

  return {
    width: Math.max(
      1,
      Math.round(window.visualViewport?.width ?? window.innerWidth ?? DEFAULT_VIEWPORT.width)
    ),
    height: Math.max(
      1,
      Math.round(window.visualViewport?.height ?? window.innerHeight ?? DEFAULT_VIEWPORT.height)
    )
  };
};

const readResolution = () => {
  if (typeof window === 'undefined') {
    return 1;
  }

  return Math.min(window.devicePixelRatio || 1, 2);
};

const initialViewport = readInitialViewport();
const initialResolution = readResolution();
const disablePhaserAudio = isWebKitBrowser();

debugLog('CONFIG', 'Resolved initial game viewport', {
  initialViewport,
  resolution: initialResolution,
  window: getWindowMetrics(),
});

const gameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  backgroundColor: '#f4f7fb',
  scene: [BootScene, PreloadScene, QuizSelectionScene, MapScene, HelicopterScene],
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: initialViewport.width,
    height: initialViewport.height,
    expandParent: true,
    fullscreenTarget: 'game-root'
  },
  input: {
    activePointers: 3,
    touch: {
      capture: true
    },
    mouse: {
      preventDefaultDown: true,
      preventDefaultMove: true,
      preventDefaultUp: true,
      preventDefaultWheel: true
    }
  },
  // Phaser audio is unused; disable its sound manager on WebKit to avoid extra setup.
  audio: {
    noAudio: disablePhaserAudio,
  },
  render: {
    antialias: true,
    antialiasGL: true,
    clearBeforeRender: true,
    powerPreference: 'high-performance'
  },
  resolution: initialResolution,
  autoRound: false,
  disableContextMenu: true,
  banner: false,
  callbacks: {
    postBoot: (game) => {
      game.canvas.style.display = 'block';
      game.canvas.style.width = '100%';
      game.canvas.style.height = '100%';

      // iOS Safari / mobile Edge: Phaser's touch capture can swallow events
      // before they reach document-level bootstrap listeners. Attach directly
      // on the canvas so we always catch the first gesture.
      const unlockAudio = () => getAudioManager().unlock();
      game.canvas.addEventListener('pointerdown', unlockAudio, { passive: true });
      game.canvas.addEventListener('touchstart',  unlockAudio, { passive: true });

      debugLog('CONFIG', 'Phaser postBoot canvas metrics', {
        window: getWindowMetrics(),
        canvas: getCanvasMetrics(game),
        scale: {
          width: game.scale?.width ?? null,
          height: game.scale?.height ?? null,
          baseSize: {
            width: game.scale?.baseSize?.width ?? null,
            height: game.scale?.baseSize?.height ?? null,
          },
          gameSize: {
            width: game.scale?.gameSize?.width ?? null,
            height: game.scale?.gameSize?.height ?? null,
          },
        },
        resolution: game.config?.resolution ?? initialResolution,
      });
    }
  }
};

export default gameConfig;
