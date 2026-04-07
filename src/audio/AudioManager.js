let _instance = null;

/**
 * Returns the shared AudioManager singleton.
 * Calling this does NOT create an AudioContext — that only happens on the first
 * unlock() call (which must come from a user-gesture handler for iOS Safari).
 *
 * @returns {AudioManager}
 */
export function getAudioManager() {
  if (!_instance) _instance = new AudioManager();
  return _instance;
}

class AudioManager {
  constructor() {
    this._ctx        = null;
    this._rotorNodes = null; // { osc, gain, harmOsc, harmGain }
    this._rotorRequested = false;
    this._warnedUnsupported = false;
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  _ensureContext() {
    if (this._ctx && this._ctx.state !== 'closed') return this._ctx;

    const Ctor =
      typeof window !== 'undefined'
        ? (window.AudioContext ?? window.webkitAudioContext)
        : null;

    if (!Ctor) {
      if (!this._warnedUnsupported && typeof console !== 'undefined') {
        console.warn('Web Audio API is unavailable; audio is disabled.');
        this._warnedUnsupported = true;
      }
      return null;
    }

    this._ctx = new Ctor();
    return this._ctx;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Create / resume the AudioContext.
   * MUST be called from a user-gesture handler to satisfy iOS Safari autoplay policy.
   */
  unlock() {
    const ctx = this._ensureContext();
    if (!ctx) return;

    const startPendingRotor = () => {
      if (this._rotorRequested) {
        this.startRotorLoop();
      }
    };

    if (ctx.state === 'suspended') {
      ctx.resume()
        .then(startPendingRotor)
        .catch((error) => {
          if (typeof console !== 'undefined') {
            console.warn('Unable to resume audio context.', error);
          }
        });
      return;
    }

    startPendingRotor();
  }

  /** True when the AudioContext is live and able to produce sound. */
  isReady() {
    return this._ctx?.state === 'running';
  }

  // ── Rotor loop ────────────────────────────────────────────────────────────

  /**
   * Start the continuous rotor-chop loop. Safe to call multiple times.
   * If the AudioContext is suspended (not yet unlocked) the nodes are created
   * and will start playing automatically once unlock() is called.
   */
  startRotorLoop() {
    this._rotorRequested = true;
    if (this._rotorNodes) return;
    const ctx = this._ensureContext();
    if (!ctx || ctx.state !== 'running') return;

    const gain = ctx.createGain();
    gain.gain.value = 0.08;
    gain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 27;
    osc.connect(gain);
    osc.start();

    const harmGain = ctx.createGain();
    harmGain.gain.value = 0.04;
    harmGain.connect(ctx.destination);

    const harmOsc = ctx.createOscillator();
    harmOsc.type = 'sawtooth';
    harmOsc.frequency.value = 54;
    harmOsc.connect(harmGain);
    harmOsc.start();

    this._rotorNodes = { osc, gain, harmOsc, harmGain };
  }

  /**
   * Smoothly ramp rotor frequency and gain toward target values.
   * Uses a first-order exponential approach so per-frame calls produce
   * smooth transitions without clicks.
   *
   * @param {number} freq  Target fundamental frequency in Hz.
   * @param {number} gain  Target gain (0–1).
   */
  setRotorProfile(freq, gain) {
    const ctx = this._ctx;
    if (!ctx || !this._rotorNodes) return;
    const now = ctx.currentTime;
    const TAU = 0.25; // time constant in seconds (~63% reached in 0.25 s)
    const scheduleTarget = (param, value) => {
      if (typeof param.cancelAndHoldAtTime === 'function') {
        param.cancelAndHoldAtTime(now);
      } else {
        param.cancelScheduledValues(now);
      }
      param.setTargetAtTime(value, now, TAU);
    };

    scheduleTarget(this._rotorNodes.osc.frequency, freq);
    scheduleTarget(this._rotorNodes.gain.gain, gain);
    scheduleTarget(this._rotorNodes.harmOsc.frequency, freq * 2);
    scheduleTarget(this._rotorNodes.harmGain.gain, gain * 0.5);
  }

  /** Disconnect and discard all rotor nodes. */
  stopRotorLoop() {
    this._rotorRequested = false;
    if (!this._rotorNodes) return;
    const { osc, gain, harmOsc, harmGain } = this._rotorNodes;
    osc.stop();
    harmOsc.stop();
    osc.disconnect();
    gain.disconnect();
    harmOsc.disconnect();
    harmGain.disconnect();
    this._rotorNodes = null;
  }

  // ── One-shot events ───────────────────────────────────────────────────────

  /** Short ascending two-tone chime: target located. */
  playFoundSound() {
    this._playTones([
      { freq: 880,  startDelay: 0,    duration: 0.12, gain: 0.25 },
      { freq: 1320, startDelay: 0.10, duration: 0.18, gain: 0.25 },
    ]);
  }

  /** Ascending three-note fanfare: all targets found (win). */
  playWinSound() {
    this._playTones([
      { freq: 523, startDelay: 0,    duration: 0.15, gain: 0.28 },
      { freq: 659, startDelay: 0.15, duration: 0.15, gain: 0.28 },
      { freq: 784, startDelay: 0.30, duration: 0.35, gain: 0.30 },
    ]);
  }

  /** Descending two-note tone: time ran out (loss). */
  playLossSound() {
    this._playTones([
      { freq: 440, startDelay: 0,    duration: 0.22, gain: 0.25 },
      { freq: 294, startDelay: 0.22, duration: 0.45, gain: 0.22 },
    ]);
  }

  /**
   * Schedule a sequence of sine-wave tones via the Web Audio API.
   * Silently does nothing when the context is not in the 'running' state.
   *
   * @param {Array<{freq: number, startDelay: number, duration: number, gain: number}>} tones
   */
  _playTones(tones) {
    const ctx = this._ensureContext();
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    for (const { freq, startDelay, duration, gain: peakGain } of tones) {
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0, now + startDelay);
      gainNode.gain.linearRampToValueAtTime(peakGain, now + startDelay + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + startDelay + duration);
      gainNode.connect(ctx.destination);

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gainNode);
      osc.onended = () => {
        osc.disconnect();
        gainNode.disconnect();
      };
      osc.start(now + startDelay);
      osc.stop(now + startDelay + duration + 0.02);
    }
  }
}
