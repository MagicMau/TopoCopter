import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildQuizRouteSearch,
  clearQuizRoute,
  hasQuizLaunchRoute,
  normalizePlayMode,
  readQuizRoute,
  syncQuizRoute,
} from '../quiz/quizRouting.js';

const originalWindow = globalThis.window;

function installWindow(search = '?foo=1', hash = '#map') {
  const location = {
    pathname: '/game',
    search,
    hash,
  };

  const history = {
    state: { fromTest: true },
    replaceState: vi.fn((state, _title, url) => {
      const parsed = new URL(url, 'https://example.test');
      history.state = state;
      location.pathname = parsed.pathname;
      location.search = parsed.search;
      location.hash = parsed.hash;
    }),
    pushState: vi.fn((state, _title, url) => {
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

describe('quizRouting', () => {
  it('reads canonical quiz and mode parameters', () => {
    expect(readQuizRoute('?quiz=quiz-west-europa&mode=mixed')).toEqual({
      quizSetId: 'quiz-west-europa',
      levelId: null,
      playMode: 'mixed',
    });
  });

  it('reads legacy quizset and playMode parameters', () => {
    expect(readQuizRoute('?quizset=quiz-west-europa&playMode=spelling')).toEqual({
      quizSetId: 'quiz-west-europa',
      levelId: null,
      playMode: 'spelling',
    });
  });

  it('builds a canonical quiz URL and preserves unrelated parameters', () => {
    expect(buildQuizRouteSearch(
      { quizSetId: 'quiz-west-europa', playMode: 'locate' },
      '?foo=1&quizset=old&playMode=mixed',
    )).toBe('?foo=1&quiz=quiz-west-europa&mode=locate');
  });

  it('builds a canonical level URL when no quiz set is active', () => {
    expect(buildQuizRouteSearch(
      { levelId: 'level-3', playMode: 'spelling' },
      '?quiz=quiz-west-europa&mode=locate',
    )).toBe('?level=level-3&mode=spelling');
  });

  it('normalizes only supported play modes', () => {
    expect(normalizePlayMode('mixed')).toBe('mixed');
    expect(normalizePlayMode('banana')).toBeNull();
  });

  it('detects launch routes', () => {
    expect(hasQuizLaunchRoute({ quizSetId: 'quiz-west-europa' })).toBe(true);
    expect(hasQuizLaunchRoute({ levelId: 'level-1' })).toBe(true);
    expect(hasQuizLaunchRoute({ playMode: 'locate' })).toBe(false);
  });

  it('syncs the browser URL with quiz routes', () => {
    const { history, location } = installWindow('?foo=1', '#keep');

    expect(syncQuizRoute({ quizSetId: 'quiz-west-europa', playMode: 'mixed' })).toBe(true);
    expect(history.replaceState).toHaveBeenCalledOnce();
    expect(location.search).toBe('?foo=1&quiz=quiz-west-europa&mode=mixed');
    expect(location.hash).toBe('#keep');
  });

  it('clears quiz parameters from the browser URL', () => {
    const { history, location } = installWindow('?foo=1&quiz=quiz-west-europa&mode=mixed');

    expect(clearQuizRoute()).toBe(true);
    expect(history.replaceState).toHaveBeenCalledOnce();
    expect(location.search).toBe('?foo=1');
  });
});
