import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AIRWOLF_ROTOR_REFERENCE,
  ROTOR_HOVER,
} from '../src/audio/audioProfiles.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const outputDir = path.join(repoRoot, 'assets', 'audio');
const sampleRate = 22050;

function clampSample(value) {
  return Math.max(-1, Math.min(1, value));
}

// Keep the rotor asset reproducible so rerunning the generator does not churn
// the WAV file for no good reason.
function deterministicNoise(index) {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function normalise(samples) {
  let peak = 0;
  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample));
  }

  if (peak <= 0.98) {
    return samples;
  }

  const scale = 0.98 / peak;
  const next = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    next[i] = samples[i] * scale;
  }
  return next;
}

function writeMonoPcm16Wav(filePath, samples) {
  const pcm = Buffer.alloc(samples.length * 2);

  for (let i = 0; i < samples.length; i += 1) {
    const sample = clampSample(samples[i]);
    const int16 = sample < 0
      ? Math.round(sample * 0x8000)
      : Math.round(sample * 0x7fff);
    pcm.writeInt16LE(int16, i * 2);
  }

  const header = Buffer.alloc(44);
  const byteRate = sampleRate * 2;

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);

  fs.writeFileSync(filePath, Buffer.concat([header, pcm]));
}

function renderRotorLoop() {
  const duration = 1 / AIRWOLF_ROTOR_REFERENCE.chopHz;
  const length = Math.floor(sampleRate * duration);
  const samples = new Float32Array(length);
  const baseFrequency = ROTOR_HOVER.freq;

  for (let i = 0; i < length; i += 1) {
    const time = i / sampleRate;
    const impact = Math.exp(-time * 28);
    const body = Math.exp(-time * 9) * 0.3;
    const tone =
      Math.sin(2 * Math.PI * baseFrequency * time) * 0.55 +
      Math.sin(2 * Math.PI * baseFrequency * 2 * time) * 0.28 +
      Math.sin(2 * Math.PI * baseFrequency * 3.1 * time) * 0.12;
    const noise = deterministicNoise(i);

    samples[i] =
      tone * (impact * 0.65 + body * 0.35) +
      noise * (impact * 0.2 + body * 0.05);
  }

  return normalise(samples);
}

function renderToneSequence(tones) {
  const totalDuration = tones.reduce(
    (max, tone) => Math.max(max, tone.startDelay + tone.duration),
    0,
  ) + 0.08;
  const length = Math.ceil(totalDuration * sampleRate);
  const samples = new Float32Array(length);

  for (const { freq, startDelay, duration, gain } of tones) {
    const startIndex = Math.max(0, Math.floor(startDelay * sampleRate));
    const endIndex = Math.min(length, Math.ceil((startDelay + duration) * sampleRate));
    const attack = Math.min(0.01, duration);
    const decayDuration = Math.max(duration - attack, 0.001);

    for (let i = startIndex; i < endIndex; i += 1) {
      const time = i / sampleRate - startDelay;
      const envelope = time <= attack
        ? gain * (time / Math.max(attack, 0.001))
        : gain * Math.pow(0.001 / Math.max(gain, 0.001), (time - attack) / decayDuration);
      samples[i] += Math.sin(2 * Math.PI * freq * time) * envelope;
    }
  }

  return normalise(samples);
}

const assets = [
  ['rotor-loop.wav', renderRotorLoop()],
  ['found.wav', renderToneSequence([
    { freq: 880, startDelay: 0, duration: 0.12, gain: 0.25 },
    { freq: 1320, startDelay: 0.1, duration: 0.18, gain: 0.25 },
  ])],
  ['win.wav', renderToneSequence([
    { freq: 523, startDelay: 0, duration: 0.15, gain: 0.28 },
    { freq: 659, startDelay: 0.15, duration: 0.15, gain: 0.28 },
    { freq: 784, startDelay: 0.3, duration: 0.35, gain: 0.3 },
  ])],
  ['loss.wav', renderToneSequence([
    { freq: 440, startDelay: 0, duration: 0.22, gain: 0.25 },
    { freq: 294, startDelay: 0.22, duration: 0.45, gain: 0.22 },
  ])],
];

fs.mkdirSync(outputDir, { recursive: true });

for (const [fileName, samples] of assets) {
  writeMonoPcm16Wav(path.join(outputDir, fileName), samples);
}

console.log(`Generated ${assets.length} audio assets in ${outputDir}`);
