import Phaser from 'phaser';
import BootScene from '../scenes/BootScene.js';
import PreloadScene from '../scenes/PreloadScene.js';
import QuizSelectionScene from '../scenes/QuizSelectionScene.js';
import MapScene from '../scenes/MapScene.js';
import HelicopterScene from '../scenes/HelicopterScene.js';

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

const gameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  backgroundColor: '#eef2f5',
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
    height: initialViewport.height
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
  render: {
    antialias: true,
    antialiasGL: true,
    clearBeforeRender: true,
    powerPreference: 'high-performance'
  },
  resolution: readResolution(),
  autoRound: false,
  disableContextMenu: true,
  banner: false,
  callbacks: {
    postBoot: (game) => {
      game.canvas.style.display = 'block';
      game.canvas.style.width = '100%';
      game.canvas.style.height = '100%';
    }
  }
};

export default gameConfig;
