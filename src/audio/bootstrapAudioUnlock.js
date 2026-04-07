import { getAudioManager } from './AudioManager.js';

const GESTURE_EVENTS = ['pointerdown', 'touchstart', 'mousedown', 'keydown'];
const EVENT_OPTIONS = { capture: true, passive: true };

let cleanupBootstrapUnlock = null;
let unlockInFlight = false;

export function installBootstrapAudioUnlock() {
  const doc = globalThis.document;
  if (!doc || typeof doc.addEventListener !== 'function') {
    return () => {};
  }

  if (cleanupBootstrapUnlock) {
    return cleanupBootstrapUnlock;
  }

  function cleanup() {
    if (!cleanupBootstrapUnlock) return;

    for (const eventName of GESTURE_EVENTS) {
      doc.removeEventListener(eventName, handleGesture, true);
    }

    cleanupBootstrapUnlock = null;
    unlockInFlight = false;
  }

  function handleGesture() {
    const audioManager = getAudioManager();

    if (audioManager.isReady()) {
      cleanup();
      return;
    }

    if (unlockInFlight) {
      return;
    }

    unlockInFlight = true;

    let unlockPromise;
    try {
      unlockPromise = audioManager.unlock();
    } catch (error) {
      unlockInFlight = false;
      if (typeof console !== 'undefined') {
        console.warn('Unable to unlock audio on first gesture.', error);
      }
      return;
    }

    Promise.resolve(unlockPromise)
      .finally(() => {
        unlockInFlight = false;
        if (audioManager.isReady()) {
          cleanup();
        }
      });
  }

  for (const eventName of GESTURE_EVENTS) {
    doc.addEventListener(eventName, handleGesture, EVENT_OPTIONS);
  }

  cleanupBootstrapUnlock = cleanup;
  return cleanupBootstrapUnlock;
}
