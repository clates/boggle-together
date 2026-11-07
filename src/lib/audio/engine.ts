import type { Cue, CueKind } from './cues'
import { envelope, MASTER_GAIN, TONES } from './tones'

// Plays round cues with the Web Audio API. Cues are scheduled ahead on the audio clock from the
// server-corrected clock, so every household sounds them at the same server instant (no reliance
// on UI ticks or on the device's own wall clock).

export type AudioStatus = 'idle' | 'locked' | 'running' | 'muted' | 'unavailable'
export type MutePrefs = { read(): boolean; write(muted: boolean): void }

export type AudioEngine = ReturnType<typeof createAudioEngine>

type Voice = { osc: OscillatorNode; nodes: AudioNode[] }

export function createAudioEngine({ createContext, prefs }: { createContext: () => AudioContext | null; prefs: MutePrefs }) {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let unavailable = false
  let muted = prefs.read()
  let plan: { cues: Cue[]; serverNowMs: () => number } | null = null
  let plannedState: AudioContextState | null = null // context state the current voices were planned for
  const voices = new Set<Voice>()
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((l) => l())

  function ensureContext(): AudioContext | null {
    if (ctx || unavailable) return ctx
    try {
      ctx = createContext()
    } catch {
      ctx = null
    }
    if (!ctx) {
      unavailable = true
      return null
    }
    master = ctx.createGain()
    master.gain.value = MASTER_GAIN
    master.connect(ctx.destination)
    // suspended -> running (unlock), or an interruption ending: the audio clock stood still, so re-plan
    ctx.onstatechange = () => {
      if (ctx?.state !== plannedState) refresh() // unlock() may already have re-planned
      notify()
    }
    return ctx
  }

  function status(): AudioStatus {
    if (muted) return 'muted'
    if (unavailable) return 'unavailable'
    if (!ctx) return 'idle'
    return ctx.state === 'running' ? 'running' : 'locked'
  }

  function release(v: Voice) {
    v.osc.onended = null
    try {
      v.osc.stop()
    } catch {
      /* already stopped */
    }
    for (const n of v.nodes) n.disconnect()
    voices.delete(v)
  }

  function stopVoices() {
    for (const v of [...voices]) release(v)
  }

  function play(c: AudioContext, kind: CueKind, when: number) {
    const tone = TONES[kind]
    const { attack, release: rel } = envelope(tone.duration)
    const osc = c.createOscillator()
    osc.type = tone.type
    osc.frequency.value = tone.freq
    const gain = c.createGain()
    gain.gain.setValueAtTime(0, when)
    gain.gain.linearRampToValueAtTime(tone.peak, when + attack)
    gain.gain.setValueAtTime(tone.peak, when + tone.duration - rel)
    gain.gain.linearRampToValueAtTime(0, when + tone.duration)
    const nodes: AudioNode[] = [osc]
    let out: AudioNode = osc
    if (tone.lowpassHz) {
      const filter = c.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = tone.lowpassHz
      out = out.connect(filter)
      nodes.push(filter)
    }
    out.connect(gain).connect(master!)
    nodes.push(gain)
    const v: Voice = { osc, nodes }
    osc.onended = () => release(v)
    osc.start(when)
    osc.stop(when + tone.duration)
    voices.add(v)
  }

  // (Re)build the schedule from the current plan: only cues still ahead, only when audible.
  function refresh() {
    stopVoices()
    plannedState = ctx?.state ?? null
    if (!plan || muted || !ctx || ctx.state !== 'running') return
    const nowMs = plan.serverNowMs()
    // sound leaves the speaker outputLatency after its context time; start that much earlier
    const latency = Number.isFinite(ctx.outputLatency) ? Math.min(Math.max(ctx.outputLatency, 0), 0.5) : 0
    const base = ctx.currentTime - latency
    for (const cue of plan.cues) {
      const delay = (cue.atMs - nowMs) / 1000
      if (delay < 0) continue
      play(ctx, cue.kind, base + delay)
    }
  }

  return {
    status,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    /** Replace the schedule with these cues (server epoch ms), timed against serverNowMs. */
    schedule(cues: Cue[], serverNowMs: () => number) {
      plan = { cues, serverNowMs }
      if (!muted) ensureContext()
      refresh()
      notify()
    },
    /** Stop everything scheduled and forget the plan. */
    cancelAll() {
      plan = null
      stopVoices()
    },
    setMuted(m: boolean) {
      if (m === muted) return
      muted = m
      prefs.write(m)
      if (!m) ensureContext()
      refresh()
      notify()
    },
    /** Create/resume the context. Call from a user gesture (tap) so the browser allows sound. */
    async unlock() {
      const c = ensureContext()
      if (!c) return notify()
      if (c.state !== 'running') {
        try {
          await c.resume()
        } catch {
          /* still locked */
        }
        if (c.state !== plannedState) refresh()
      }
      notify()
    },
  }
}
