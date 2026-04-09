import { PLAY_MODE } from './questionModes.js';

const QUIZ_PARAM = 'quiz';
const LEGACY_QUIZ_PARAM = 'quizset';
const LEVEL_PARAM = 'level';
const MODE_PARAM = 'mode';
const LEGACY_MODE_PARAM = 'playMode';

const VALID_PLAY_MODES = new Set(Object.values(PLAY_MODE));

function getCurrentSearch() {
  return typeof window === 'undefined' ? '' : window.location.search;
}

export function normalizePlayMode(playMode) {
  return VALID_PLAY_MODES.has(playMode) ? playMode : null;
}

export function readQuizRoute(search = getCurrentSearch()) {
  const params = new URLSearchParams(search);

  return {
    quizSetId: params.get(QUIZ_PARAM) ?? params.get(LEGACY_QUIZ_PARAM) ?? null,
    levelId: params.get(LEVEL_PARAM) ?? null,
    playMode: normalizePlayMode(
      params.get(MODE_PARAM) ?? params.get(LEGACY_MODE_PARAM),
    ),
  };
}

export function hasQuizLaunchRoute(route) {
  return Boolean(route?.quizSetId || route?.levelId);
}

export function buildQuizRouteSearch(
  route = {},
  currentSearch = getCurrentSearch(),
) {
  const params = new URLSearchParams(currentSearch);

  [
    QUIZ_PARAM,
    LEGACY_QUIZ_PARAM,
    LEVEL_PARAM,
    MODE_PARAM,
    LEGACY_MODE_PARAM,
  ].forEach((key) => params.delete(key));

  if (route.quizSetId) {
    params.set(QUIZ_PARAM, route.quizSetId);
  } else if (route.levelId) {
    params.set(LEVEL_PARAM, route.levelId);
  }

  const playMode = normalizePlayMode(route.playMode);
  if (playMode) {
    params.set(MODE_PARAM, playMode);
  }

  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : '';
}

export function syncQuizRoute(route, { replace = true } = {}) {
  if (typeof window === 'undefined' || typeof window.history === 'undefined') {
    return false;
  }

  const nextSearch = buildQuizRouteSearch(route, window.location.search);
  const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
  const historyMethod = replace ? 'replaceState' : 'pushState';
  window.history[historyMethod](window.history.state, '', nextUrl);
  return true;
}

export function clearQuizRoute(options) {
  return syncQuizRoute({}, options);
}
