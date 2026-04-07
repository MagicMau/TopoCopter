/**
 * Pure audio parameter profiles — no Web Audio API dependency.
 * Safe to import in Node / test environments.
 */

/** Rotor frequency and gain while hovering (stationary or very slow). */
export const ROTOR_HOVER = { freq: 27, gain: 0.08 };

/** Rotor frequency and gain at full flying speed (faster and louder). */
export const ROTOR_FLY = { freq: 40, gain: 0.14 };

/**
 * Interpolate rotor frequency and gain between hover and flying states.
 *
 * @param {number} speed     Current helicopter speed in world units/s.
 * @param {number} maxSpeed  Maximum helicopter speed in world units/s.
 * @returns {{ freq: number, gain: number }}
 */
export function interpolateRotorProfile(speed, maxSpeed) {
  const safeMax = Math.max(maxSpeed, 1);
  const t = Math.min(Math.max(speed, 0) / safeMax, 1);
  return {
    freq: ROTOR_HOVER.freq + (ROTOR_FLY.freq - ROTOR_HOVER.freq) * t,
    gain: ROTOR_HOVER.gain + (ROTOR_FLY.gain - ROTOR_HOVER.gain) * t,
  };
}
