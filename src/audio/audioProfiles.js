/**
 * Pure audio parameter profiles — no Web Audio API dependency.
 * Safe to import in Node / test environments.
 */

const AIRWOLF_PULSE_INTERVAL_SECONDS = 0.148;
const midiToFrequency = (midiNote) => 440 * (2 ** ((midiNote - 69) / 12));

/**
 * The opening helicopter pulse in Airwolf.mid resolves to repeated A#1 hits at
 * roughly 0.148 s intervals. That gives us a rotor chop cadence close to 6.75 Hz.
 */
export const AIRWOLF_ROTOR_REFERENCE = Object.freeze({
  pulseIntervalSeconds: AIRWOLF_PULSE_INTERVAL_SECONDS,
  chopHz: 1 / AIRWOLF_PULSE_INTERVAL_SECONDS,
  baseMidiNote: 34,
});

/** Rotor profile while hovering (stationary or very slow). */
export const ROTOR_HOVER = Object.freeze({
  freq: midiToFrequency(AIRWOLF_ROTOR_REFERENCE.baseMidiNote),
  harmonicFreq: midiToFrequency(AIRWOLF_ROTOR_REFERENCE.baseMidiNote + 12),
  subFreq: midiToFrequency(AIRWOLF_ROTOR_REFERENCE.baseMidiNote - 12),
  chopHz: AIRWOLF_ROTOR_REFERENCE.chopHz,
  chopDepth: 0.22,
  chopFloor: 0.62,
  noiseGain: 0.028,
  noiseFilterFreq: 700,
  noiseFilterQ: 2.4,
  gain: 0.12,
});

/** Rotor profile at full flying speed (faster and louder). */
export const ROTOR_FLY = Object.freeze({
  freq: midiToFrequency(AIRWOLF_ROTOR_REFERENCE.baseMidiNote + 3),
  harmonicFreq: midiToFrequency(AIRWOLF_ROTOR_REFERENCE.baseMidiNote + 15),
  subFreq: midiToFrequency(AIRWOLF_ROTOR_REFERENCE.baseMidiNote - 9),
  chopHz: AIRWOLF_ROTOR_REFERENCE.chopHz + 2.1,
  chopDepth: 0.34,
  chopFloor: 0.54,
  noiseGain: 0.05,
  noiseFilterFreq: 1100,
  noiseFilterQ: 3.2,
  gain: 0.17,
});

function interpolateScalar(start, end, t) {
  return start + (end - start) * t;
}

/**
 * Interpolate rotor parameters between hover and flying states.
 *
 * @param {number} speed     Current helicopter speed in world units/s.
 * @param {number} maxSpeed  Maximum helicopter speed in world units/s.
 * @returns {{
 *   freq: number,
 *   harmonicFreq: number,
 *   subFreq: number,
 *   chopHz: number,
 *   chopDepth: number,
 *   chopFloor: number,
 *   noiseGain: number,
 *   noiseFilterFreq: number,
 *   noiseFilterQ: number,
 *   gain: number,
 * }}
 */
export function interpolateRotorProfile(speed, maxSpeed) {
  const safeMax = Math.max(maxSpeed, 1);
  const t = Math.min(Math.max(speed, 0) / safeMax, 1);
  return {
    freq: interpolateScalar(ROTOR_HOVER.freq, ROTOR_FLY.freq, t),
    harmonicFreq: interpolateScalar(ROTOR_HOVER.harmonicFreq, ROTOR_FLY.harmonicFreq, t),
    subFreq: interpolateScalar(ROTOR_HOVER.subFreq, ROTOR_FLY.subFreq, t),
    chopHz: interpolateScalar(ROTOR_HOVER.chopHz, ROTOR_FLY.chopHz, t),
    chopDepth: interpolateScalar(ROTOR_HOVER.chopDepth, ROTOR_FLY.chopDepth, t),
    chopFloor: interpolateScalar(ROTOR_HOVER.chopFloor, ROTOR_FLY.chopFloor, t),
    noiseGain: interpolateScalar(ROTOR_HOVER.noiseGain, ROTOR_FLY.noiseGain, t),
    noiseFilterFreq: interpolateScalar(
      ROTOR_HOVER.noiseFilterFreq,
      ROTOR_FLY.noiseFilterFreq,
      t,
    ),
    noiseFilterQ: interpolateScalar(ROTOR_HOVER.noiseFilterQ, ROTOR_FLY.noiseFilterQ, t),
    gain: interpolateScalar(ROTOR_HOVER.gain, ROTOR_FLY.gain, t),
  };
}
