// The app's one audio engine (household screens only; typist phones never touch it).
import { createAudioEngine, type AudioEngine } from './audio/engine'
import { readMuted, writeMuted } from './audio/mutePref'

export type { AudioStatus } from './audio/engine'

function browserContext(): AudioContext | null {
  const g = globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
  const Ctor = g.AudioContext ?? g.webkitAudioContext
  return Ctor ? new Ctor() : null
}

const make = () => createAudioEngine({ createContext: browserContext, prefs: { read: readMuted, write: writeMuted } })

let engine: AudioEngine = make()

export const getAudio = () => engine

/** Call from a household's tap (Ready, Start anyway) so the browser lets the round's cues play. */
export function unlockAudio(): void {
  void engine.unlock()
}

/** Tests: start over with a fresh engine (re-reads the mute preference and window.AudioContext). */
export function resetAudio(): void {
  engine.cancelAll()
  engine = make()
}
