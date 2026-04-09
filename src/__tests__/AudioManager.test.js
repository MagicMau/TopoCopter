import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioManager, AUDIO_ASSET_KEYS } from '../audio/AudioManager.js';
import { AIRWOLF_ROTOR_REFERENCE, ROTOR_FLY, ROTOR_HOVER } from '../audio/audioProfiles.js';

function makeAudioParam(initial = 0) {
  return {
    value: initial,
    cancelAndHoldAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    setTargetAtTime: vi.fn(),
  };
}

function makeRotorSound() {
  return {
    play: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
    setRate: vi.fn(),
    setVolume: vi.fn(),
    source: {
      playbackRate: makeAudioParam(1),
    },
    loopSource: {
      playbackRate: makeAudioParam(1),
    },
    volumeNode: {
      gain: makeAudioParam(ROTOR_HOVER.gain),
    },
  };
}

function makeSoundManager({ locked = false, state = 'running', hasAssets = true } = {}) {
  const sound = makeRotorSound();
  const context = {
    state,
    currentTime: 12,
    resume: vi.fn(() => {
      context.state = 'running';
      return Promise.resolve();
    }),
  };

  const soundManager = {
    locked,
    unlocked: false,
    noAudio: false,
    context,
    game: {
      cache: {
        audio: {
          has: vi.fn(() => hasAssets),
        },
      },
    },
    add: vi.fn(() => sound),
    play: vi.fn(),
    unlock: vi.fn(),
  };

  return { soundManager, sound, context };
}

function createManager(options) {
  const manager = new AudioManager();
  const { soundManager, sound, context } = makeSoundManager(options);
  manager.setSoundManager(soundManager);
  return { manager, soundManager, sound, context };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AudioManager.startRotorLoop', () => {
  it('creates and plays a looping Phaser sound when audio is ready', () => {
    const { manager, soundManager, sound } = createManager();

    manager.startRotorLoop();

    expect(soundManager.add).toHaveBeenCalledWith(
      AUDIO_ASSET_KEYS.ROTOR_LOOP,
      expect.objectContaining({ loop: true, rate: 1, volume: ROTOR_HOVER.gain }),
    );
    expect(sound.play).toHaveBeenCalledOnce();
  });

  it('is idempotent when called repeatedly', () => {
    const { manager, soundManager } = createManager();

    manager.startRotorLoop();
    manager.startRotorLoop();

    expect(soundManager.add).toHaveBeenCalledTimes(1);
  });

  it('does not create a rotor sound before audio is unlocked', () => {
    const { manager, soundManager } = createManager({ locked: true, state: 'suspended' });

    manager.startRotorLoop();

    expect(soundManager.add).not.toHaveBeenCalled();
    expect(manager._rotorRequested).toBe(true);
    expect(manager._rotorSound).toBeNull();
  });
});

describe('AudioManager.setRotorProfile', () => {
  it('schedules playbackRate from the target chop cadence', () => {
    const { manager, sound } = createManager();
    manager.startRotorLoop();
    vi.clearAllMocks();

    manager.setRotorProfile({ chopHz: ROTOR_FLY.chopHz, gain: 0.2 });

    expect(sound.source.playbackRate.setTargetAtTime).toHaveBeenCalledWith(
      expect.closeTo(ROTOR_FLY.chopHz / AIRWOLF_ROTOR_REFERENCE.chopHz, 5),
      12,
      0.25,
    );
    expect(sound.loopSource.playbackRate.setTargetAtTime).toHaveBeenCalledWith(
      expect.closeTo(ROTOR_FLY.chopHz / AIRWOLF_ROTOR_REFERENCE.chopHz, 5),
      12,
      0.25,
    );
  });

  it('schedules rotor gain from the profile', () => {
    const { manager, sound } = createManager();
    manager.startRotorLoop();
    vi.clearAllMocks();

    manager.setRotorProfile({ chopHz: ROTOR_HOVER.chopHz, gain: 0.42 });

    expect(sound.volumeNode.gain.setTargetAtTime).toHaveBeenCalledWith(0.42, 12, 0.25);
  });

  it('falls back to Phaser setters when direct audio params are unavailable', () => {
    const { manager, soundManager } = createManager();
    const fallbackSound = {
      play: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      setRate: vi.fn(),
      setVolume: vi.fn(),
    };
    soundManager.add.mockReturnValue(fallbackSound);

    manager.startRotorLoop();
    vi.clearAllMocks();

    manager.setRotorProfile(ROTOR_FLY);

    expect(fallbackSound.setRate).toHaveBeenCalledWith(
      ROTOR_FLY.chopHz / AIRWOLF_ROTOR_REFERENCE.chopHz,
    );
    expect(fallbackSound.setVolume).toHaveBeenCalledWith(ROTOR_FLY.gain);
  });
});

describe('AudioManager.stopRotorLoop', () => {
  it('stops and destroys the rotor sound', () => {
    const { manager, sound } = createManager();
    manager.startRotorLoop();

    manager.stopRotorLoop();

    expect(sound.stop).toHaveBeenCalledOnce();
    expect(sound.destroy).toHaveBeenCalledOnce();
    expect(manager._rotorSound).toBeNull();
  });

  it('is safe when no rotor sound exists', () => {
    const { manager } = createManager();
    expect(() => manager.stopRotorLoop()).not.toThrow();
  });
});

describe('AudioManager.unlock', () => {
  it('resumes a suspended Phaser audio context and starts a pending rotor loop', async () => {
    const { manager, soundManager, context } = createManager({ locked: true, state: 'suspended' });
    let resolveResume;
    context.resume = vi.fn(() => new Promise((resolve) => {
      resolveResume = () => {
        context.state = 'running';
        resolve();
      };
    }));

    manager.startRotorLoop();
    const unlockPromise = manager.unlock();

    expect(soundManager.add).not.toHaveBeenCalled();

    resolveResume();
    await expect(unlockPromise).resolves.toBe(true);

    expect(context.resume).toHaveBeenCalledOnce();
    expect(soundManager.add).toHaveBeenCalledOnce();
    expect(manager.isReady()).toBe(true);
  });

  it('coalesces repeated unlock calls while resume is pending', async () => {
    const { manager, context } = createManager({ locked: true, state: 'suspended' });
    let resolveResume;
    context.resume = vi.fn(() => new Promise((resolve) => {
      resolveResume = () => {
        context.state = 'running';
        resolve();
      };
    }));

    const first = manager.unlock();
    const second = manager.unlock();

    expect(first).toBe(second);
    expect(context.resume).toHaveBeenCalledTimes(1);

    resolveResume();
    await expect(first).resolves.toBe(true);
  });

  it('retries once when Safari leaves the context suspended after resume()', async () => {
    vi.useFakeTimers();
    try {
      const { manager, context } = createManager({ locked: true, state: 'suspended' });
      let attempts = 0;
      context.resume = vi.fn(() => {
        attempts += 1;
        if (attempts > 1) {
          context.state = 'running';
        }
        return Promise.resolve();
      });

      const unlockPromise = manager.unlock();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(100);

      await expect(unlockPromise).resolves.toBe(true);
      expect(context.resume).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('AudioManager cue playback', () => {
  it('plays found, win, and loss sounds through Phaser', () => {
    const { manager, soundManager } = createManager();

    manager.playFoundSound();
    manager.playWinSound();
    manager.playLossSound();

    expect(soundManager.play).toHaveBeenNthCalledWith(1, AUDIO_ASSET_KEYS.FOUND);
    expect(soundManager.play).toHaveBeenNthCalledWith(2, AUDIO_ASSET_KEYS.WIN);
    expect(soundManager.play).toHaveBeenNthCalledWith(3, AUDIO_ASSET_KEYS.LOSS);
  });

  it('queues cue sounds until audio has been unlocked', async () => {
    const { manager, soundManager, context } = createManager({ locked: true, state: 'suspended' });
    let resolveResume;
    context.resume = vi.fn(() => new Promise((resolve) => {
      resolveResume = () => {
        context.state = 'running';
        resolve();
      };
    }));

    manager.playFoundSound();
    manager.playWinSound();

    expect(soundManager.play).not.toHaveBeenCalled();

    const unlockPromise = manager.unlock();
    resolveResume();
    await unlockPromise;

    expect(soundManager.play).toHaveBeenNthCalledWith(1, AUDIO_ASSET_KEYS.FOUND);
    expect(soundManager.play).toHaveBeenNthCalledWith(2, AUDIO_ASSET_KEYS.WIN);
  });
});
