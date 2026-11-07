import type { CueKind } from './cues'

// Sound design for each cue. peak is the voice gain before the master gain.
export type Tone = { freq: number; type: OscillatorType; duration: number; peak: number; lowpassHz?: number }

export const TONES: Record<CueKind, Tone> = {
  tick: { freq: 440, type: 'sine', duration: 0.1, peak: 0.3 },
  go: { freq: 880, type: 'sine', duration: 0.4, peak: 0.35 },
  'chime-low': { freq: 660, type: 'sine', duration: 0.2, peak: 0.3 },
  'chime-high': { freq: 880, type: 'sine', duration: 0.2, peak: 0.3 },
  'mini-tick': { freq: 1000, type: 'sine', duration: 0.03, peak: 0.1 },
  // A sawtooth is rich in harmonics, so it reads as a firm buzzer; the low-pass takes the rasp off.
  buzzer: { freq: 220, type: 'sawtooth', duration: 0.9, peak: 0.5, lowpassHz: 1800 },
}

/** Caps the overall output so nothing is harsh. */
export const MASTER_GAIN = 0.8

/** Short attack/release times (s) so tones start and end without clicks. */
export function envelope(duration: number) {
  return { attack: Math.min(0.01, duration * 0.2), release: Math.min(0.06, duration * 0.3) }
}
