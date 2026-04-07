import Phaser from 'phaser';
import gameConfig from './core/GameConfig.js';

const GAME_INSTANCE_KEY = '__TOPOCOPTER_GAME__';
const GAME_CLEANUP_KEY = '__TOPOCOPTER_GAME_CLEANUP__';

const readViewportSize = () => ({
  width: Math.max(1, Math.round(window.visualViewport?.width ?? window.innerWidth)),
  height: Math.max(1, Math.round(window.visualViewport?.height ?? window.innerHeight))
});

const syncViewport = (game) => {
  const { width, height } = readViewportSize();

  if (game.scale.width !== width || game.scale.height !== height) {
    game.scale.resize(width, height);
  }
};

const bindViewportEvents = (game) => {
  const handleViewportChange = () => syncViewport(game);
  
  // Use a debounced handler for orientation changes to account for UI chrome changes
  let orientationTimeout;
  const handleOrientationChange = () => {
    clearTimeout(orientationTimeout);
    // Delay to allow the browser to complete orientation transition and UI chrome updates
    orientationTimeout = setTimeout(handleViewportChange, 100);
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
