import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioManager } from '../audio/AudioManager.js';
import { AIRWOLF_ROTOR_REFERENCE, ROTOR_HOVER, ROTOR_FLY } from '../audio/audioProfiles.js';

// ── Minimal Web Audio mock ────────────────────────────────────────────────────

function makeAudioParam(initial = 0) {
  const p = {
    value: initial,
    cancelAndHoldAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    setTargetAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  return p;
}

function makeNode(extras = {}) {
  return { connect: vi.fn(), disconnect: vi.fn(), ...extras };
}

function makeMockContext(state = 'running') {
  const sampleRate = 44100;

  const source = makeNode({
    start: vi.fn(),
    stop: vi.fn(),
    loop: false,
    buffer: null,
    playbackRate: makeAudioParam(1),
  });

  const filter = makeNode({
    type: 'lowpass',
    frequency: makeAudioParam(1000),
    Q: makeAudioParam(1),
  });

  const gainNode = makeNode({ gain: makeAudioParam(0) });
  const oscNode  = makeNode({
    start: vi.fn(),
    stop: vi.fn(),
    frequency: makeAudioParam(440),
    type: 'sine',
  });

  const ctx = {
    state,
    sampleRate,
    currentTime: 0,
    destination: {},
    createBufferSource: vi.fn(() => ({
      ...source,
      connect: vi.fn(),
      disconnect: vi.fn(),
      playbackRate: makeAudioParam(1),
    })),
    createBuffer: vi.fn((channels, length, sr) => ({
      getChannelData: vi.fn(() => new Float32Array(length)),
    })),
    createBiquadFilter: vi.fn(() => ({
      ...filter,
      connect: vi.fn(),
      disconnect: vi.fn(),
      frequency: makeAudioParam(1000),
      Q: makeAudioParam(1),
    })),
    createGain: vi.fn(() => ({
      ...gainNode,
      connect: vi.fn(),
      disconnect: vi.fn(),
      gain: makeAudioParam(0),
    })),
    createOscillator: vi.fn(() => ({
      ...oscNode,
      connect: vi.fn(),
      disconnect: vi.fn(),
      frequency: makeAudioParam(440),
    })),
    resume: vi.fn(() => Promise.resolve()),
  };

  return ctx;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AudioManager._createRotorChopBuffer', () => {
  it('returns a buffer whose length matches 1 / chopHz * sampleRate', () => {
    const am  = new AudioManager();
    const ctx = makeMockContext();
    am._createRotorChopBuffer(ctx);

    const expectedLen = Math.floor(ctx.sampleRate / AIRWOLF_ROTOR_REFERENCE.chopHz);
    expect(ctx.createBuffer).toHaveBeenCalledWith(1, expectedLen, ctx.sampleRate);
  });

  it('fills the channel data array', () => {
    const am  = new AudioManager();
    const sr  = 44100;
    const len = Math.floor(sr / AIRWOLF_ROTOR_REFERENCE.chopHz);

    let writtenData;
    const ctx = makeMockContext();
    ctx.createBuffer = vi.fn(() => {
      const data = new Float32Array(len);
      writtenData = data;
      return { getChannelData: vi.fn(() => data) };
    });

    am._createRotorChopBuffer(ctx);

    // Data should not be all zeros after the synthesis loop
    const nonZero = writtenData.some((v) => v !== 0);
    expect(nonZero).toBe(true);
  });

  it('keeps sample amplitudes within ±1', () => {
    // Run several times since the noise component is random
    for (let run = 0; run < 5; run += 1) {
      const am  = new AudioManager();
      const sr  = 44100;
      const len = Math.floor(sr / AIRWOLF_ROTOR_REFERENCE.chopHz);
      let writtenData;
      const ctx = makeMockContext();
      ctx.createBuffer = vi.fn(() => {
        const data = new Float32Array(len);
        writtenData = data;
        return { getChannelData: vi.fn(() => data) };
      });

      am._createRotorChopBuffer(ctx);

      const maxAbs = Math.max(...writtenData.map(Math.abs));
      expect(maxAbs).toBeLessThanOrEqual(1.0);
    }
  });
});

describe('AudioManager.startRotorLoop', () => {
  it('creates source, filter, and gain nodes when context is running', () => {
    const am  = new AudioManager();
    const ctx = makeMockContext('running');
    am._ctx = ctx;

    am.startRotorLoop();

    expect(ctx.createBufferSource).toHaveBeenCalledOnce();
    expect(ctx.createBiquadFilter).toHaveBeenCalledOnce();
    expect(ctx.createGain).toHaveBeenCalled();
  });

  it('is idempotent — calling twice does not create extra nodes', () => {
    const am  = new AudioManager();
    const ctx = makeMockContext('running');
    am._ctx = ctx;

    am.startRotorLoop();
    am.startRotorLoop();

    expect(ctx.createBufferSource).toHaveBeenCalledOnce();
  });

  it('does nothing when context is not running', () => {
    const am  = new AudioManager();
    const ctx = makeMockContext('suspended');
    am._ctx = ctx;

    am.startRotorLoop();

    expect(ctx.createBufferSource).not.toHaveBeenCalled();
    expect(am._rotorNodes).toBeNull();
  });

  it('does not create an AudioContext before unlock is called', () => {
    const am = new AudioManager();
    const audioCtor = vi.fn(() => makeMockContext('running'));
    vi.stubGlobal('window', { AudioContext: audioCtor });

    am.startRotorLoop();

    expect(audioCtor).not.toHaveBeenCalled();
    expect(am._rotorRequested).toBe(true);
    expect(am._rotorNodes).toBeNull();

    vi.unstubAllGlobals();
  });

  it('sets loop = true on the buffer source', () => {
    const am  = new AudioManager();
    const ctx = makeMockContext('running');
    am._ctx = ctx;

    let capturedSource;
    ctx.createBufferSource = vi.fn(() => {
      capturedSource = {
        connect: vi.fn(), disconnect: vi.fn(),
        start: vi.fn(), stop: vi.fn(),
        loop: false,
        buffer: null,
        playbackRate: makeAudioParam(1),
      };
      return capturedSource;
    });

    am.startRotorLoop();

    expect(capturedSource.loop).toBe(true);
  });
});

describe('AudioManager.setRotorProfile', () => {
  function setupRunningManager() {
    const am  = new AudioManager();
    const ctx = makeMockContext('running');
    am._ctx = ctx;
    am.startRotorLoop();
    // Clear call counts from startRotorLoop's own setRotorProfile call
    vi.clearAllMocks();
    return { am, ctx };
  }

  it('schedules playbackRate as chopHz / AIRWOLF_ROTOR_REFERENCE.chopHz', () => {
    const { am } = setupRunningManager();

    const targetChopHz = ROTOR_FLY.chopHz;
    am.setRotorProfile({ chopHz: targetChopHz, gain: 0.2, noiseFilterFreq: 800 });

    const expectedRate = targetChopHz / AIRWOLF_ROTOR_REFERENCE.chopHz;
    const rateParam = am._rotorNodes.source.playbackRate;
    expect(rateParam.setTargetAtTime).toHaveBeenCalledWith(
      expect.closeTo(expectedRate, 5),
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('at hover profile, playbackRate is exactly 1.0', () => {
    const { am } = setupRunningManager();

    am.setRotorProfile(ROTOR_HOVER);

    const rateParam = am._rotorNodes.source.playbackRate;
    expect(rateParam.setTargetAtTime).toHaveBeenCalledWith(
      1.0,
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('at fly profile, playbackRate is > 1.0', () => {
    const { am } = setupRunningManager();

    am.setRotorProfile(ROTOR_FLY);

    const rateParam = am._rotorNodes.source.playbackRate;
    const [[rate]] = rateParam.setTargetAtTime.mock.calls;
    expect(rate).toBeGreaterThan(1.0);
  });

  it('schedules gain from the profile', () => {
    const { am } = setupRunningManager();

    am.setRotorProfile({ chopHz: ROTOR_HOVER.chopHz, gain: 0.42, noiseFilterFreq: 700 });

    const gainParam = am._rotorNodes.masterGain.gain;
    expect(gainParam.setTargetAtTime).toHaveBeenCalledWith(
      0.42,
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('is a no-op when _rotorNodes is null', () => {
    const am  = new AudioManager();
    const ctx = makeMockContext('running');
    am._ctx = ctx;
    // Do NOT call startRotorLoop — nodes are null

    expect(() => am.setRotorProfile(ROTOR_HOVER)).not.toThrow();
  });
});

describe('AudioManager.stopRotorLoop', () => {
  it('disconnects all nodes and nulls _rotorNodes', () => {
    const am  = new AudioManager();
    const ctx = makeMockContext('running');
    am._ctx = ctx;
    am.startRotorLoop();

    const { source, filter, masterGain } = am._rotorNodes;
    am.stopRotorLoop();

    expect(source.disconnect).toHaveBeenCalled();
    expect(filter.disconnect).toHaveBeenCalled();
    expect(masterGain.disconnect).toHaveBeenCalled();
    expect(am._rotorNodes).toBeNull();
  });

  it('is safe to call when no loop is running', () => {
    const am = new AudioManager();
    expect(() => am.stopRotorLoop()).not.toThrow();
  });

  it('handles source.stop() throwing without propagating', () => {
    const am  = new AudioManager();
    const ctx = makeMockContext('running');
    am._ctx = ctx;
    am.startRotorLoop();

    am._rotorNodes.source.stop = vi.fn(() => { throw new Error('already stopped'); });

    expect(() => am.stopRotorLoop()).not.toThrow();
    expect(am._rotorNodes).toBeNull();
  });
});

describe('AudioManager.unlock', () => {
  it('resumes a suspended context and starts a pending rotor loop', async () => {
    const am  = new AudioManager();
    const ctx = makeMockContext('suspended');
    let resolveResume;
    ctx.resume = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveResume = () => {
            ctx.state = 'running';
            resolve();
          };
        }),
    );

    am._ctx = ctx;
    am._rotorRequested = true;

    const unlockPromise = am.unlock();

    expect(ctx.createBufferSource).not.toHaveBeenCalled();

    resolveResume();

    await expect(unlockPromise).resolves.toBe(true);

    expect(ctx.resume).toHaveBeenCalledOnce();
    expect(ctx.createBufferSource).toHaveBeenCalledOnce();
    expect(am.isReady()).toBe(true);
  });

  it('coalesces repeated unlock calls while a resume is pending', async () => {
    const am  = new AudioManager();
    const ctx = makeMockContext('suspended');

    let resolveResume;
    ctx.resume = vi.fn(
      () =>
        new Promise((res) => {
          resolveResume = () => {
            ctx.state = 'running';
            res();
          };
        }),
    );

    am._ctx = ctx;

    const firstUnlock = am.unlock();
    const secondUnlock = am.unlock();

    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(secondUnlock).toBe(firstUnlock);

    resolveResume();

    await expect(firstUnlock).resolves.toBe(true);
    await expect(secondUnlock).resolves.toBe(true);
  });

  it('resumes interrupted contexts too', async () => {
    const am  = new AudioManager();
    const ctx = makeMockContext('interrupted');
    ctx.resume = vi.fn(() => {
      ctx.state = 'running';
      return Promise.resolve();
    });

    am._ctx = ctx;

    await expect(am.unlock()).resolves.toBe(true);

    expect(ctx.resume).toHaveBeenCalledOnce();
    expect(am.isReady()).toBe(true);
  });
});
