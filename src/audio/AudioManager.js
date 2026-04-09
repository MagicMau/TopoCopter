import { AIRWOLF_ROTOR_REFERENCE, ROTOR_HOVER } from './audioProfiles.js';

let _instance = null;

export const AUDIO_ASSET_KEYS = Object.freeze({
  ROTOR_LOOP: 'audio-rotor-loop',
  FOUND: 'audio-found',
  WIN: 'audio-win',
  LOSS: 'audio-loss',
});

/**
 * Returns the shared AudioManager singleton.
 * Phaser's sound manager is attached later by GameConfig / PreloadScene once the
 * game is live, so calling this early is safe.
 *
 * @returns {AudioManager}
 */
export function getAudioManager() {
  if (!_instance) _instance = new AudioManager();
  return _instance;
}

export class AudioManager {
  constructor() {
    this._soundManager = null;
    this._rotorSound = null;
    this._rotorRequested = false;
    this._warnedUnavailable = false;
    this._unlockPromise = null;
    this._pendingSounds = [];
    this._rotorProfile = ROTOR_HOVER;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  setSoundManager(soundManager) {
    if (!soundManager || this._soundManager === soundManager) {
      return;
    }

    this._soundManager = soundManager;

    if (this.isReady()) {
      if (this._rotorRequested) {
        this.startRotorLoop();
      }
      this._flushPendingSounds();
    }
  }

  _getContext() {
    return this._soundManager?.context ?? null;
  }

  _hasAudioAsset(key) {
    return this._soundManager?.game?.cache?.audio?.has?.(key) ?? false;
  }

  _warnUnavailable() {
    if (this._warnedUnavailable || typeof console === 'undefined') {
      return;
    }

    console.warn('Phaser audio is unavailable; audio is disabled.');
    this._warnedUnavailable = true;
  }

  _onReady() {
    if (this._rotorRequested) {
      this.startRotorLoop();
    }
    this._flushPendingSounds();
  }

  /**
   * Resume Phaser audio on first gesture.
   *
   * @returns {Promise<boolean>} True once audio is ready, false on failure.
   */
  unlock() {
    const soundManager = this._soundManager;
    if (!soundManager || soundManager.noAudio === true) {
      this._warnUnavailable();
      return Promise.resolve(false);
    }

    if (this.isReady()) {
      this._onReady();
      return Promise.resolve(true);
    }

    if (this._unlockPromise) {
      return this._unlockPromise;
    }

    const context = this._getContext();
    let resumePromise;

    try {
      if (context && (context.state === 'suspended' || context.state === 'interrupted')) {
        resumePromise = Promise.resolve(context.resume());
      } else {
        if (typeof soundManager.unlock === 'function' && soundManager.locked === true) {
          soundManager.unlock();
        }
        resumePromise = Promise.resolve();
      }
    } catch (error) {
      if (typeof console !== 'undefined') {
        console.warn('Unable to unlock Phaser audio.', error);
      }
      return Promise.resolve(false);
    }

    this._unlockPromise = resumePromise
      .then(() => {
        const finalizeUnlock = () => {
          if (context && context.state === 'running') {
            soundManager.locked = false;
          }

          if (soundManager.locked !== true && (!context || context.state === 'running')) {
            return true;
          }

          return false;
        };

        if (finalizeUnlock()) {
          return true;
        }

        if (!context) {
          return false;
        }

        return new Promise((resolve) => {
          setTimeout(() => {
            Promise.resolve(context.resume())
              .then(() => resolve(finalizeUnlock()))
              .catch(() => resolve(false));
          }, 100);
        });
      })
      .then((ready) => {
        if (ready) {
          this._onReady();
        }
        return ready;
      })
      .catch((error) => {
        if (typeof console !== 'undefined') {
          console.warn('Unable to unlock Phaser audio.', error);
        }
        return false;
      })
      .finally(() => {
        this._unlockPromise = null;
      });

    return this._unlockPromise;
  }

  /** True when the AudioContext is live and able to produce sound. */
  isReady() {
    const soundManager = this._soundManager;
    if (!soundManager || soundManager.noAudio === true || soundManager.locked === true) {
      return false;
    }

    const context = this._getContext();
    return !context || context.state === 'running';
  }

  // ── Rotor loop ────────────────────────────────────────────────────────────

  /**
   * Start the continuous rotor-chop loop. Safe to call multiple times.
   * If the AudioContext is suspended (not yet unlocked) the nodes are created
   * and will start playing automatically once unlock() is called.
   */
  startRotorLoop() {
    this._rotorRequested = true;
    if (this._rotorSound || !this.isReady() || !this._hasAudioAsset(AUDIO_ASSET_KEYS.ROTOR_LOOP)) {
      return;
    }

    this._rotorSound = this._soundManager.add(AUDIO_ASSET_KEYS.ROTOR_LOOP, {
      loop: true,
      volume: ROTOR_HOVER.gain,
      rate: 1,
    });

    this._rotorSound?.play();
    this.setRotorProfile(this._rotorProfile);
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
    const profile =
      typeof profileOrFreq === 'object' && profileOrFreq !== null
        ? profileOrFreq
        : {
            chopHz: Number(profileOrFreq),
            gain,
            noiseFilterFreq: ROTOR_HOVER.noiseFilterFreq,
          };

    this._rotorProfile = profile;

    if (!this._rotorSound) return;

    const context = this._getContext();
    const now = context?.currentTime ?? 0;
    const scheduleTarget = (param, value) => {
      if (!param || !Number.isFinite(Number(value))) return;
      if (typeof param.cancelAndHoldAtTime === 'function') {
        param.cancelAndHoldAtTime(now);
      } else if (typeof param.cancelScheduledValues === 'function') {
        param.cancelScheduledValues(now);
      }
      if (typeof param.setTargetAtTime === 'function') {
        param.setTargetAtTime(Number(value), now, 0.25);
      }
    };

    // Normalise chop rate to the Airwolf reference cadence so that
    // playbackRate = 1.0 at hover and scales proportionally with speed.
    const rate = (profile.chopHz ?? ROTOR_HOVER.chopHz) / AIRWOLF_ROTOR_REFERENCE.chopHz;

    const playbackRateParams = [
      this._rotorSound.source?.playbackRate ?? null,
      this._rotorSound.loopSource?.playbackRate ?? null,
    ].filter(Boolean);
    const volumeParam = this._rotorSound.volumeNode?.gain ?? null;

    if (playbackRateParams.length > 0 && volumeParam) {
      playbackRateParams.forEach((param) => scheduleTarget(param, rate));
      scheduleTarget(volumeParam, profile.gain ?? ROTOR_HOVER.gain);
      return;
    }

    this._rotorSound.setRate?.(rate);
    this._rotorSound.setVolume?.(profile.gain ?? ROTOR_HOVER.gain);
  }

  /** Disconnect and discard all rotor nodes. */
  stopRotorLoop() {
    this._rotorRequested = false;
    if (!this._rotorSound) return;

    try {
      this._rotorSound.stop?.();
    } catch (_) {
      // Phaser may already have stopped the sound.
    }

    this._rotorSound.destroy?.();
    this._rotorSound = null;
  }

  // ── One-shot events ───────────────────────────────────────────────────────

  /** Short ascending two-tone chime: target located. */
  playFoundSound() {
    this._playSoundWhenReady(AUDIO_ASSET_KEYS.FOUND);
  }

  /** Ascending three-note fanfare: all targets found (win). */
  playWinSound() {
    this._playSoundWhenReady(AUDIO_ASSET_KEYS.WIN);
  }

  /** Descending two-note tone: time ran out (loss). */
  playLossSound() {
    this._playSoundWhenReady(AUDIO_ASSET_KEYS.LOSS);
  }

  /**
   * Play tones immediately if the context is running, otherwise queue them for
   * the next successful unlock (discarded if not played within 2 seconds).
   *
   * @param {string} key
   */
  _playSoundWhenReady(key) {
    if (this.isReady()) {
      this._playSound(key);
      return;
    }
    this._pendingSounds.push({ key, expireAt: Date.now() + 2000 });
  }

  /** Play all non-expired queued sounds. Called after audio becomes ready. */
  _flushPendingSounds() {
    if (!this.isReady() || this._pendingSounds.length === 0) return;
    const now = Date.now();
    const pending = this._pendingSounds;
    this._pendingSounds = [];
    for (const { key, expireAt } of pending) {
      if (expireAt > now) {
        this._playSound(key);
      }
    }
  }

  /**
   * Play a cached Phaser audio asset if available.
   *
   * @param {string} key
   */
  _playSound(key) {
    if (!this.isReady() || !this._hasAudioAsset(key)) {
      return;
    }

    this._soundManager.play?.(key);
  }
}
