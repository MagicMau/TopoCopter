import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getAudioManager } = vi.hoisted(() => ({
  getAudioManager: vi.fn(),
}));

vi.mock('../audio/AudioManager.js', () => ({
  getAudioManager,
}));

import { installBootstrapAudioUnlock } from '../audio/bootstrapAudioUnlock.js';

function createDocumentStub() {
  const listeners = new Map();

  return {
    addEventListener: vi.fn((eventName, handler) => {
      const current = listeners.get(eventName) ?? [];
      current.push(handler);
      listeners.set(eventName, current);
    }),
    removeEventListener: vi.fn((eventName, handler) => {
      const current = listeners.get(eventName) ?? [];
      const next = current.filter((candidate) => candidate !== handler);

      if (next.length > 0) {
        listeners.set(eventName, next);
      } else {
        listeners.delete(eventName);
      }
    }),
    dispatch(eventName, event = {}) {
      for (const handler of listeners.get(eventName) ?? []) {
        handler({ type: eventName, ...event });
      }
    },
    getListenerCount(eventName) {
      return listeners.get(eventName)?.length ?? 0;
    },
  };
}

describe('installBootstrapAudioUnlock', () => {
  let documentStub;
  let manager;
  let cleanup;
  let ready;

  beforeEach(() => {
    ready = false;
    documentStub = createDocumentStub();
    manager = {
      isReady: vi.fn(() => ready),
      unlock: vi.fn(async () => {
        ready = true;
        return true;
      }),
    };

    getAudioManager.mockReturnValue(manager);
    vi.stubGlobal('document', documentStub);
    cleanup = installBootstrapAudioUnlock();
  });

  afterEach(() => {
    cleanup?.();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('registers capture listeners for common mobile gestures', () => {
    expect(documentStub.addEventListener).toHaveBeenCalledWith(
      'pointerdown',
      expect.any(Function),
      expect.objectContaining({ capture: true, passive: true }),
    );
    expect(documentStub.addEventListener).toHaveBeenCalledWith(
      'touchstart',
      expect.any(Function),
      expect.objectContaining({ capture: true, passive: true }),
    );
    expect(documentStub.addEventListener).toHaveBeenCalledWith(
      'mousedown',
      expect.any(Function),
      expect.objectContaining({ capture: true, passive: true }),
    );
    expect(documentStub.addEventListener).toHaveBeenCalledWith(
      'keydown',
      expect.any(Function),
      expect.objectContaining({ capture: true, passive: true }),
    );
  });

  it('unlocks audio from the first gesture and removes listeners once ready', async () => {
    documentStub.dispatch('pointerdown', { pointerType: 'touch' });

    await manager.unlock.mock.results[0].value;
    await Promise.resolve();

    expect(manager.unlock).toHaveBeenCalledTimes(1);
    expect(documentStub.removeEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function), true);
    expect(documentStub.getListenerCount('pointerdown')).toBe(0);

    documentStub.dispatch('pointerdown', { pointerType: 'touch' });
    expect(manager.unlock).toHaveBeenCalledTimes(1);
  });

  it('keeps listening until audio becomes ready', async () => {
    manager.unlock.mockImplementation(async () => false);

    documentStub.dispatch('touchstart', {});
    await manager.unlock.mock.results[0].value;
    await Promise.resolve();

    expect(documentStub.getListenerCount('touchstart')).toBeGreaterThan(0);

    documentStub.dispatch('touchstart', {});
    expect(manager.unlock).toHaveBeenCalledTimes(2);
  });
});
