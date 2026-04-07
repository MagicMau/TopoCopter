import Phaser from 'phaser';
import gameConfig from './core/GameConfig.js';

const GAME_INSTANCE_KEY = '__TOPOCOPTER_GAME__';
const GAME_CLEANUP_KEY = '__TOPOCOPTER_GAME_CLEANUP__';
const VIEWPORT_WIDTH_VAR = '--app-viewport-width';
const VIEWPORT_HEIGHT_VAR = '--app-viewport-height';

const readViewportSize = () => ({
  width: Math.max(
    1,
    Math.round(
      window.visualViewport?.width
      ?? document.documentElement?.clientWidth
      ?? window.innerWidth,
    ),
  ),
  height: Math.max(
    1,
    Math.round(
      window.visualViewport?.height
      ?? document.documentElement?.clientHeight
      ?? window.innerHeight,
    ),
  ),
});

const applyViewportSize = ({ width, height }) => {
  document.documentElement?.style?.setProperty(VIEWPORT_WIDTH_VAR, `${width}px`);
  document.documentElement?.style?.setProperty(VIEWPORT_HEIGHT_VAR, `${height}px`);
};

const syncViewport = (game = null) => {
  const { width, height } = readViewportSize();
  applyViewportSize({ width, height });

  if (game && (game.scale.width !== width || game.scale.height !== height)) {
    game.scale.resize(width, height);
  }

  return { width, height };
};

const bindViewportEvents = (game) => {
  const handleViewportChange = () => syncViewport(game);

  // Orientation changes can report stale viewport metrics briefly on mobile browsers,
  // so resync immediately and then once more after the browser UI settles.
  let orientationTimeout;
  const handleOrientationChange = () => {
    clearTimeout(orientationTimeout);
    handleViewportChange();
    orientationTimeout = setTimeout(handleViewportChange, 300);
  };

  window.addEventListener('resize', handleViewportChange);
  window.addEventListener('orientationchange', handleOrientationChange);
  window.visualViewport?.addEventListener('resize', handleViewportChange);
  window.visualViewport?.addEventListener('scroll', handleViewportChange);

  return () => {
    clearTimeout(orientationTimeout);
    window.removeEventListener('resize', handleViewportChange);
    window.removeEventListener('orientationchange', handleOrientationChange);
    window.visualViewport?.removeEventListener('resize', handleViewportChange);
    window.visualViewport?.removeEventListener('scroll', handleViewportChange);
  };
};

const startGame = () => {
  if (window[GAME_INSTANCE_KEY] || !document.getElementById('game-root')) {
    return window[GAME_INSTANCE_KEY] ?? null;
  }

  syncViewport();
  const game = new Phaser.Game(gameConfig);
  syncViewport(game);

  window[GAME_INSTANCE_KEY] = game;
  window[GAME_CLEANUP_KEY] = bindViewportEvents(game);

  return game;
};

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', startGame, { once: true });
} else {
  startGame();
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window[GAME_CLEANUP_KEY]?.();
    window[GAME_INSTANCE_KEY]?.destroy(true);
    delete window[GAME_CLEANUP_KEY];
    delete window[GAME_INSTANCE_KEY];
  });
}
