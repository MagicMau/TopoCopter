import { AIRWOLF_ROTOR_REFERENCE, ROTOR_HOVER } from './audioProfiles.js';

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

export class AudioManager {
  constructor() {
    this._ctx             = null;
    this._rotorNodes      = null; // { source, filter, masterGain }
    this._rotorRequested  = false;
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

  /**
   * Synthesise one blade-chop cycle as a PCM buffer.
   *
   * Buffer duration = 1 / AIRWOLF_ROTOR_REFERENCE.chopHz (≈ 0.148 s), so
   * looping at playbackRate = 1.0 reproduces exactly the Airwolf reference
   * chop cadence.  Increasing playbackRate raises both the chop rate and the
   * blade-tone pitch together, which matches real-helicopter behaviour.
   *
   * The signal is shaped as a sharp impact transient (≈35 ms) plus a shorter
   * resonant body, layered over tonal components at the Airwolf fundamental
   * (A#1, 58.27 Hz) and its harmonics.  A small noise burst adds turbulence
   * character without overwhelming the tonal content.
   *
   * @param {AudioContext} ctx
   * @returns {AudioBuffer}
   */
  _createRotorChopBuffer(ctx) {
    const sr       = ctx.sampleRate;
    const duration = 1 / AIRWOLF_ROTOR_REFERENCE.chopHz; // ≈ 0.148 s
    const len      = Math.floor(sr * duration);
    const buf      = ctx.createBuffer(1, len, sr);
    const ch       = buf.getChannelData(0);

    const f1 = ROTOR_HOVER.freq; // A#1 ≈ 58.27 Hz

    for (let i = 0; i < len; i++) {
      const t = i / sr;

      // Two-stage amplitude envelope
      const impact = Math.exp(-t * 28);          // fast attack, dies in ~35 ms
      const body   = Math.exp(-t *  9) * 0.30;  // lingering resonance ~80 ms

      // Harmonic series from MIDI-derived fundamental; 3rd partial is slightly
      // detuned (+0.1 semitone) to avoid the overly-clean sound of integer ratios
      const tone =
        Math.sin(2 * Math.PI * f1       * t) * 0.55 +
        Math.sin(2 * Math.PI * f1 * 2   * t) * 0.28 +
        Math.sin(2 * Math.PI * f1 * 3.1 * t) * 0.12;

      const noise = Math.random() * 2 - 1;

      ch[i] = tone  * (impact * 0.65 + body * 0.35) +
              noise * (impact * 0.20 + body * 0.05);
    }

    return buf;
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

    // Loop a single synthesised blade-chop cycle
    const chopBuf = this._createRotorChopBuffer(ctx);
    const source  = ctx.createBufferSource();
    source.buffer           = chopBuf;
    source.loop             = true;
    source.playbackRate.value = 1.0; // 1.0 = Airwolf hover baseline

    // Gentle low-pass to round off the high-frequency edge of the noise burst
    const filter = ctx.createBiquadFilter();
    filter.type            = 'lowpass';
    filter.frequency.value = ROTOR_HOVER.noiseFilterFreq;

    const masterGain = ctx.createGain();
    masterGain.gain.value  = 0; // ramped to hover gain by setRotorProfile below

    source.connect(filter);
    filter.connect(masterGain);
    masterGain.connect(ctx.destination);

    source.start();

    this._rotorNodes = { source, filter, masterGain };
    this.setRotorProfile(ROTOR_HOVER);
  }

  /**
   * Smoothly ramp rotor parameters toward the target profile.
   * Uses a first-order exponential approach so per-frame calls produce
   * smooth transitions without clicks.
   *
   * Accepts either a full profile object (as returned by interpolateRotorProfile)
   * or the legacy two-argument form (freq, gain) for backward compatibility.
   *
   * @param {object|number} profileOrFreq  Profile object or raw freq value.
   * @param {number}        [gain]         Gain (only used in legacy two-arg form).
   */
  setRotorProfile(profileOrFreq, gain) {
    const ctx = this._ctx;
    if (!ctx || !this._rotorNodes) return;
    const now = ctx.currentTime;
    const TAU = 0.25; // time constant in seconds (~63% reached in 0.25 s)
    const scheduleTarget = (param, value) => {
      if (!Number.isFinite(Number(value))) return;
      if (typeof param.cancelAndHoldAtTime === 'function') {
        param.cancelAndHoldAtTime(now);
      } else {
        param.cancelScheduledValues(now);
      }
      param.setTargetAtTime(Number(value), now, TAU);
    };

    const profile =
      typeof profileOrFreq === 'object' && profileOrFreq !== null
        ? profileOrFreq
        : {
            chopHz:         Number(profileOrFreq),
            gain:           gain,
            noiseFilterFreq: ROTOR_HOVER.noiseFilterFreq,
          };

    // Normalise chop rate to the Airwolf reference cadence so that
    // playbackRate = 1.0 at hover and scales proportionally with speed.
    const rate = (profile.chopHz ?? ROTOR_HOVER.chopHz) / AIRWOLF_ROTOR_REFERENCE.chopHz;
    scheduleTarget(this._rotorNodes.source.playbackRate, rate);
    scheduleTarget(this._rotorNodes.masterGain.gain, profile.gain);
    if (profile.noiseFilterFreq != null) {
      scheduleTarget(this._rotorNodes.filter.frequency, profile.noiseFilterFreq);
    }
  }

  /** Disconnect and discard all rotor nodes. */
  stopRotorLoop() {
    this._rotorRequested = false;
    if (!this._rotorNodes) return;
    const { source, filter, masterGain } = this._rotorNodes;
    try { source.stop(); } catch (_) { /* already stopped */ }
    source.disconnect();
    filter.disconnect();
    masterGain.disconnect();
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
