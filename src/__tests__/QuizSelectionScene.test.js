import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Scene: class {},
    Scale: { Events: { RESIZE: 'resize' } },
    Scenes: { Events: { SHUTDOWN: 'shutdown' } },
    Math: {
      Clamp: (value, min, max) => Math.min(Math.max(value, min), max),
    },
  },
}));

import QuizSelectionScene from '../scenes/QuizSelectionScene.js';
import { PLAY_MODE } from '../quiz/questionModes.js';

const originalWindow = globalThis.window;

function installWindow(search = '?foo=1', hash = '') {
  const location = {
    pathname: '/game',
    search,
    hash,
  };

  const history = {
    state: null,
    replaceState: vi.fn((state, _title, url) => {
      const parsed = new URL(url, 'https://example.test');
      history.state = state;
      location.pathname = parsed.pathname;
      location.search = parsed.search;
      location.hash = parsed.hash;
    }),
  };

  globalThis.window = { location, history };
  return { location, history };
}

afterEach(() => {
  if (originalWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }
});

describe('QuizSelectionScene routing', () => {
  it('launches a quiz and syncs the browser URL', () => {
    const { location } = installWindow('?foo=1');
    const scene = Object.create(QuizSelectionScene.prototype);
    scene._selectedPlayMode = PLAY_MODE.MIXED;
    scene.scene = { start: vi.fn() };

    scene._launchQuizSet({ id: 'quiz-west-europa' });

    expect(scene.scene.start).toHaveBeenCalledWith('HelicopterScene', {
      quizSetId: 'quiz-west-europa',
      playMode: PLAY_MODE.MIXED,
    });
    expect(location.search).toBe('?foo=1&quiz=quiz-west-europa&mode=mixed');
  });

  it('auto-starts a deep-linked quiz and applies its play mode', () => {
    installWindow('?quiz=quiz-west-europa&mode=spelling');
    const scene = Object.create(QuizSelectionScene.prototype);
    const quizSet = { id: 'quiz-west-europa' };
    scene._quizSets = [quizSet];
    scene._selectedPlayMode = PLAY_MODE.LOCATE;
    scene._updateModeButtonStyles = vi.fn();
    scene._launchQuizSet = vi.fn();

    expect(scene._startFromRouteIfPresent()).toBe(true);
    expect(scene._selectedPlayMode).toBe(PLAY_MODE.SPELLING);
    expect(scene._updateModeButtonStyles).toHaveBeenCalledOnce();
    expect(scene._launchQuizSet).toHaveBeenCalledWith(quizSet);
  });

  it('auto-starts a deep-linked level run', () => {
    const { location } = installWindow('?level=level-2&mode=spelling');
    const scene = Object.create(QuizSelectionScene.prototype);
    scene._quizSets = [];
    scene._selectedPlayMode = PLAY_MODE.LOCATE;
    scene._updateModeButtonStyles = vi.fn();
    scene.scene = { start: vi.fn() };

    expect(scene._startFromRouteIfPresent()).toBe(true);
    expect(scene.scene.start).toHaveBeenCalledWith('HelicopterScene', {
      playMode: PLAY_MODE.SPELLING,
    });
    expect(location.search).toBe('?level=level-2&mode=spelling');
  });

  it('clears stale quiz parameters when the deep-linked quiz does not exist', () => {
    const { location } = installWindow('?quiz=missing&mode=mixed&foo=1');
    const scene = Object.create(QuizSelectionScene.prototype);
    scene._quizSets = [];
    scene._selectedPlayMode = PLAY_MODE.LOCATE;
    scene._updateModeButtonStyles = vi.fn();

    expect(scene._startFromRouteIfPresent()).toBe(false);
    expect(location.search).toBe('?foo=1');
  });
});
