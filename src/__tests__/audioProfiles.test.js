import { describe, it, expect } from 'vitest';
import {
  AIRWOLF_ROTOR_REFERENCE,
  interpolateRotorProfile,
  ROTOR_HOVER,
  ROTOR_FLY,
} from '../audio/audioProfiles.js';

describe('interpolateRotorProfile', () => {
  it('returns hover profile at zero speed', () => {
    const p = interpolateRotorProfile(0, 300);
    expect(p.freq).toBe(ROTOR_HOVER.freq);
    expect(p.gain).toBe(ROTOR_HOVER.gain);
    expect(p.chopHz).toBe(ROTOR_HOVER.chopHz);
  });

  it('returns fly profile at max speed', () => {
    const p = interpolateRotorProfile(300, 300);
    expect(p.freq).toBe(ROTOR_FLY.freq);
    expect(p.gain).toBe(ROTOR_FLY.gain);
    expect(p.noiseGain).toBe(ROTOR_FLY.noiseGain);
  });

  it('interpolates at half speed', () => {
    const p = interpolateRotorProfile(150, 300);
    expect(p.freq).toBeCloseTo((ROTOR_HOVER.freq + ROTOR_FLY.freq) / 2);
    expect(p.gain).toBeCloseTo((ROTOR_HOVER.gain + ROTOR_FLY.gain) / 2);
    expect(p.chopHz).toBeCloseTo((ROTOR_HOVER.chopHz + ROTOR_FLY.chopHz) / 2);
  });

  it('clamps at fly profile when speed exceeds maxSpeed', () => {
    const p = interpolateRotorProfile(9999, 300);
    expect(p.freq).toBe(ROTOR_FLY.freq);
    expect(p.gain).toBe(ROTOR_FLY.gain);
  });

  it('clamps at hover profile for negative speed', () => {
    const p = interpolateRotorProfile(-50, 300);
    expect(p.freq).toBe(ROTOR_HOVER.freq);
    expect(p.gain).toBe(ROTOR_HOVER.gain);
  });

  it('does not divide by zero when maxSpeed is 0', () => {
    expect(() => interpolateRotorProfile(0, 0)).not.toThrow();
    const p = interpolateRotorProfile(0, 0);
    expect(Number.isFinite(p.freq)).toBe(true);
    expect(Number.isFinite(p.gain)).toBe(true);
    expect(Number.isFinite(p.noiseFilterFreq)).toBe(true);
  });

  it('fly profile has higher freq than hover profile', () => {
    expect(ROTOR_FLY.freq).toBeGreaterThan(ROTOR_HOVER.freq);
  });

  it('fly profile has higher gain than hover profile', () => {
    expect(ROTOR_FLY.gain).toBeGreaterThan(ROTOR_HOVER.gain);
  });

  it('keeps the Airwolf-derived chop reference in a realistic rotor range', () => {
    expect(AIRWOLF_ROTOR_REFERENCE.chopHz).toBeCloseTo(6.7567, 3);
    expect(ROTOR_HOVER.chopHz).toBeCloseTo(AIRWOLF_ROTOR_REFERENCE.chopHz, 5);
    expect(ROTOR_FLY.chopHz).toBeGreaterThan(ROTOR_HOVER.chopHz);
  });
});
