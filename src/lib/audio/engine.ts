import type { Cue } from './cues'
import { envelope, MASTER_GAIN, TONES } from './tones'

// Plays round cues with the Web Audio API. Cues are scheduled ahead on the audio clock from the
// server-corrected clock, so every household sounds them at the same server instant (no reliance
// on UI ticks or on the device's own wall clock).

export type AudioStatus = 'idle' | 'locked' | 'running' | 'muted' | 'unavailable'
export type MutePrefs = { read(): boolean; write(muted: boolean): void }

export type AudioEngine = ReturnType<typeof createAudioEngine>

// key: the cue's identity (kind + server time), so a re-plan never sounds the same cue twice
type Voice = { key: string; osc: OscillatorNode; gain: GainNode; nodes: AudioNode[]; startAt: number; endAt: number; fading: boolean }

const FADE_S = 0.01 // cut-off fade, so stopping a sounding tone never clicks
const cueKey = (c: Cue) => `${c.kind}@${c.atMs}`
const warn = (what: string, e: unknown) => console.warn(`[audio] ${what}`, e)

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
      if (ctx) {
        master = ctx.createGain()
        master.gain.value = MASTER_GAIN
        master.connect(ctx.destination)
      }
    } catch (e) {
      warn('no audio context', e)
      ctx = null
    }
    if (!ctx) {
      unavailable = true
      return null
    }
    // suspended -> running (unlock), or an interruption ending: the audio clock stood still, so re-plan
    ctx.onstatechange = guard('statechange', () => {
      if (ctx?.state !== plannedState) refresh() // unlock() may already have re-planned
      notify()
    })
    return ctx
  }

  function status(): AudioStatus {
    if (muted) return 'muted'
    if (unavailable) return 'unavailable'
    if (!ctx) return 'idle'
    return ctx.state === 'running' ? 'running' : 'locked'
  }

  function dispose(v: Voice) {
    v.osc.onended = null
    for (const n of v.nodes) {
      try {
        n.disconnect()
      } catch {
        /* already disconnected */
      }
    }
    voices.delete(v)
  }

  const started = (v: Voice) => !!ctx && v.startAt <= ctx.currentTime

  /** A voice that has not started is dropped silently; a sounding one fades out over FADE_S. */
  function cut(v: Voice) {
    if (!ctx || !started(v)) {
      try {
        v.osc.stop()
      } catch {
        /* never started */
      }
      return dispose(v)
    }
    if (v.fading) return
    v.fading = true
    const now = ctx.currentTime
    try {
      const g = v.gain.gain
      if (typeof g.cancelAndHoldAtTime === 'function') g.cancelAndHoldAtTime(now)
      else {
        g.cancelScheduledValues(now)
        g.setValueAtTime(g.value, now)
      }
      g.linearRampToValueAtTime(0, now + FADE_S)
      v.osc.stop(Math.min(v.endAt, now + FADE_S + 0.002)) // onended disposes it
    } catch (e) {
      warn('fade', e)
      try {
        v.osc.stop()
      } catch {
        /* ignore */
      }
      dispose(v)
    }
  }

  function play(c: AudioContext, cue: Cue, when: number) {
    const tone = TONES[cue.kind]
    const { attack, release: rel } = envelope(tone.duration)
    const osc = c.createOscillator()
    osc.type = tone.type
    osc.frequency.value = tone.freq
    const gain = c.createGain()
    const nodes: AudioNode[] = [osc, gain]
    const v: Voice = { key: cueKey(cue), osc, gain, nodes, startAt: when, endAt: when + tone.duration, fading: false }
    try {
      gain.gain.setValueAtTime(0, when)
      gain.gain.linearRampToValueAtTime(tone.peak, when + attack)
      gain.gain.setValueAtTime(tone.peak, when + tone.duration - rel)
      gain.gain.linearRampToValueAtTime(0, when + tone.duration)
      let out: AudioNode = osc
      if (tone.lowpassHz) {
        const filter = c.createBiquadFilter()
        nodes.push(filter)
        filter.type = 'lowpass'
        filter.frequency.value = tone.lowpassHz
        out = out.connect(filter)
      }
      out.connect(gain).connect(master!)
      osc.onended = () => dispose(v)
      osc.start(when)
      osc.stop(v.endAt)
      voices.add(v)
    } catch (e) {
      dispose(v)
      throw e
    }
  }

  // (Re)build the schedule from the current plan. Voices already sounding for a cue still in the
  // plan ring on (and that cue is not scheduled again); any other sounding voice fades out; voices
  // not yet started are replaced by the new schedule.
  function refresh() {
    const audible = !!plan && !muted && !!ctx && ctx.state === 'running'
    const wanted = new Set(audible ? plan!.cues.map(cueKey) : [])
    const sounding = new Set<string>()
    for (const v of [...voices]) {
      if (started(v) && !v.fading && wanted.has(v.key)) sounding.add(v.key)
      else cut(v)
    }
    plannedState = ctx?.state ?? null
    if (!audible) return
    const c = ctx!
    const nowMs = plan!.serverNowMs()
    // sound leaves the speaker outputLatency after its context time; start that much earlier,
    // but never before the audio clock's present (a past start time is an error)
    const latency = Number.isFinite(c.outputLatency) ? Math.min(Math.max(c.outputLatency, 0), 0.5) : 0
    const now = c.currentTime
    for (const cue of plan!.cues) {
      const delay = (cue.atMs - nowMs) / 1000
      if (delay < 0 || sounding.has(cueKey(cue))) continue
      try {
        play(c, cue, Math.max(now, now - latency + delay))
      } catch (e) {
        warn(`could not schedule ${cue.kind}`, e)
      }
    }
  }

  // Nothing in here may throw into React (effects, click handlers).
  function guard<A extends unknown[]>(what: string, fn: (...a: A) => void) {
    return (...a: A) => {
      try {
        fn(...a)
      } catch (e) {
        warn(what, e)
      }
    }
  }

  return {
    status,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    /** Replace the schedule with these cues (server epoch ms), timed against serverNowMs. */
    schedule: guard('schedule', (cues: Cue[], serverNowMs: () => number) => {
      plan = { cues, serverNowMs }
      if (!muted) ensureContext()
      refresh()
      notify()
    }),
    /** Drop the plan and every cue still ahead; a tone already sounding (the buzzer) rings out. */
    cancelAll: guard('cancelAll', () => {
      plan = null
      for (const v of [...voices]) if (!started(v)) cut(v)
    }),
    setMuted: guard('setMuted', (m: boolean) => {
      if (m === muted) return
      muted = m
      prefs.write(m)
      if (!m) ensureContext()
      refresh()
      notify()
    }),
    /** Create/resume the context. Call from a user gesture (tap) so the browser allows sound. */
    async unlock() {
      try {
        const c = ensureContext()
        if (c && c.state !== 'running') {
          try {
            await c.resume()
          } catch {
            /* still locked */
          }
          if (c.state !== plannedState) refresh()
        }
      } catch (e) {
        warn('unlock', e)
      }
      notify()
    },
  }
}
