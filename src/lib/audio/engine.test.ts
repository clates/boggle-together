import { afterEach, describe, expect, it, vi } from 'vitest'
import { cueTimeline, type Cue } from './cues'
import { createAudioEngine, type MutePrefs } from './engine'
import { FakeAudioContext, voiceOf } from './fakeAudioContext'

const S = Date.parse('2026-11-07T12:00:00Z') // "now" on the server clock
const START = S + 4_000
const END = START + 180_000
const CUES = cueTimeline({ start_at: new Date(START).toISOString(), ends_at: new Date(END).toISOString() })

function prefs(muted = false): MutePrefs & { writes: boolean[] } {
  const writes: boolean[] = []
  return { writes, read: () => muted, write: (m) => void writes.push(m) }
}

function setup(opts: { ctx?: FakeAudioContext; muted?: boolean } = {}) {
  const ctx = opts.ctx ?? new FakeAudioContext({ currentTime: 50 })
  const factory = vi.fn(() => ctx as unknown as AudioContext)
  const p = prefs(opts.muted)
  const engine = createAudioEngine({ createContext: factory, prefs: p })
  return { ctx, factory, engine, prefs: p }
}

/** server time each oscillator will sound at, given the context time at scheduling */
const serverTimes = (ctx: FakeAudioContext, ctxTimeAtSchedule: number, serverAtSchedule: number) =>
  ctx.live.map((o) => Math.round(serverAtSchedule + (o.startAt! - ctxTimeAtSchedule) * 1000))

afterEach(() => vi.useRealTimers())

describe('audio engine scheduling', () => {
  it('schedules every future cue on the audio clock relative to the server clock', () => {
    const { ctx, engine } = setup()
    engine.schedule(CUES, () => S)
    expect(ctx.live).toHaveLength(CUES.length)
    expect(serverTimes(ctx, 50, S)).toEqual(CUES.map((c) => c.atMs))
    expect(engine.status()).toBe('running')
  })

  it('ignores the device clock: a device 10 minutes wrong but with a corrected server clock gets the same times', () => {
    vi.useFakeTimers()
    vi.setSystemTime(S + 10 * 60_000)
    const a = setup()
    a.engine.schedule(CUES, () => S)
    vi.setSystemTime(S - 10 * 60_000)
    const b = setup()
    b.engine.schedule(CUES, () => S)
    expect(a.ctx.live.map((o) => o.startAt)).toEqual(b.ctx.live.map((o) => o.startAt))
    expect(a.ctx.live[0].startAt).toBeCloseTo(50 + 1, 6) // first tick is start-3 s = now+1 s
  })

  it('skips cues already in the past (refresh mid-round schedules only what is left)', () => {
    const { ctx, engine } = setup()
    const now = END - 9_500 // 9.5 s left: mini-ticks at -9..-1 and the buzzer remain
    engine.schedule(CUES, () => now)
    const kinds = ctx.live.map((o) => o.frequency.value)
    expect(kinds).toEqual([...Array(9).fill(1000), 220])
    expect(serverTimes(ctx, 50, now)).toEqual(CUES.filter((c) => c.atMs >= now).map((c) => c.atMs))
  })

  it('schedules nothing once the round is over', () => {
    const { ctx, engine } = setup()
    engine.schedule(CUES, () => END + 1)
    expect(ctx.oscillators).toHaveLength(0)
  })

  it('cancelAll stops and disconnects every node that has not started', () => {
    const { ctx, engine } = setup()
    engine.schedule(CUES, () => S)
    engine.cancelAll()
    expect(ctx.oscillators.every((o) => o.cancelled && o.disconnected)).toBe(true)
    expect(ctx.gains.filter((g) => g !== ctx.gains[0]).every((g) => g.disconnected)).toBe(true)
    expect(ctx.live).toHaveLength(0)
  })

  it('a new schedule (round change) cancels the old one', () => {
    const { ctx, engine } = setup()
    engine.schedule(CUES, () => S)
    const old = [...ctx.oscillators]
    const next: Cue[] = cueTimeline({ start_at: new Date(S + 10_000).toISOString(), ends_at: new Date(S + 22_000).toISOString() })
    engine.schedule(next, () => S)
    expect(old.every((o) => o.cancelled)).toBe(true)
    expect(serverTimes(ctx, 50, S)).toEqual(next.map((c) => c.atMs))
  })

  it('muting cancels and unmuting reschedules what is still ahead', () => {
    let now = S
    const { ctx, engine, prefs: p } = setup()
    engine.schedule(CUES, () => now)
    engine.setMuted(true)
    expect(ctx.live).toHaveLength(0)
    expect(engine.status()).toBe('muted')
    expect(p.writes).toEqual([true])
    now = END - 5_000
    ctx.currentTime = 70
    engine.setMuted(false)
    expect(engine.status()).toBe('running')
    expect(serverTimes(ctx, 70, now)).toEqual(CUES.filter((c) => c.atMs >= now).map((c) => c.atMs))
    expect(p.writes).toEqual([true, false])
  })

  it('a muted engine creates no context and schedules nothing', () => {
    const { factory, engine } = setup({ muted: true })
    engine.schedule(CUES, () => S)
    expect(factory).not.toHaveBeenCalled()
    expect(engine.status()).toBe('muted')
  })

  it('a suspended context is "locked" and plays nothing until unlock()', async () => {
    const ctx = new FakeAudioContext({ currentTime: 0, state: 'suspended' })
    const { engine } = setup({ ctx })
    const listener = vi.fn()
    engine.subscribe(listener)
    engine.schedule(CUES, () => S)
    expect(engine.status()).toBe('locked')
    expect(ctx.oscillators).toHaveLength(0)
    ctx.currentTime = 3
    await engine.unlock()
    expect(engine.status()).toBe('running')
    expect(listener).toHaveBeenCalled()
    expect(serverTimes(ctx, 3, S)).toEqual(CUES.map((c) => c.atMs))
  })

  it('stays locked when resume is refused (no gesture)', async () => {
    const ctx = new FakeAudioContext({ state: 'suspended', canResume: false })
    const { engine } = setup({ ctx })
    engine.schedule(CUES, () => S)
    await engine.unlock()
    expect(engine.status()).toBe('locked')
    expect(ctx.oscillators).toHaveLength(0)
  })

  it('unlock() before any round creates and resumes the context, idle before that', async () => {
    const ctx = new FakeAudioContext({ state: 'suspended' })
    const { engine, factory } = setup({ ctx })
    expect(engine.status()).toBe('idle')
    await engine.unlock()
    expect(factory).toHaveBeenCalledTimes(1)
    expect(ctx.resumeCalls).toBe(1)
    expect(engine.status()).toBe('running')
    await engine.unlock()
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('reports unavailable when the browser has no Web Audio', () => {
    const engine = createAudioEngine({ createContext: () => null, prefs: prefs() })
    engine.schedule(CUES, () => S)
    expect(engine.status()).toBe('unavailable')
  })

  it('two households with different audio clocks sound each cue at the same server instant', () => {
    const a = setup({ ctx: new FakeAudioContext({ currentTime: 12.25 }) })
    const b = setup({ ctx: new FakeAudioContext({ currentTime: 987.5 }) })
    a.engine.schedule(CUES, () => S)
    b.engine.schedule(CUES, () => S + 0) // same server clock, read at the same instant
    expect(serverTimes(a.ctx, 12.25, S)).toEqual(serverTimes(b.ctx, 987.5, S))
    expect(serverTimes(a.ctx, 12.25, S)).toEqual(CUES.map((c) => c.atMs))
  })
})

describe('audio engine tones', () => {
  it('uses the agreed sound design with click-free envelopes', () => {
    const { ctx, engine } = setup()
    engine.schedule(CUES, () => S)
    const v = ctx.live.map(voiceOf)
    const byFreq = (f: number) => v.filter((x) => x.frequency === f)
    const tick = byFreq(440)[0]
    expect(byFreq(440)).toHaveLength(3)
    expect(tick).toMatchObject({ type: 'sine' })
    expect(tick.duration).toBeCloseTo(0.1)
    const go = v[3]
    expect(go).toMatchObject({ type: 'sine', frequency: 880 })
    expect(go.duration).toBeCloseTo(0.4)
    const [low, high] = [v[4], v[5]]
    expect([low.frequency, high.frequency]).toEqual([660, 880])
    expect(low.duration).toBeCloseTo(0.2)
    expect(high.start - (low.start + low.duration)).toBeCloseTo(0.15)
    const mini = byFreq(1000)
    expect(mini).toHaveLength(10)
    expect(mini[0].duration).toBeCloseTo(0.03)
    expect(mini[0].peak).toBeCloseTo(tick.peak / 3, 2)
    const buzzer = v[v.length - 1]
    expect(buzzer).toMatchObject({ type: 'sawtooth', frequency: 220 })
    expect(buzzer.duration).toBeCloseTo(0.9)
    expect(buzzer.peak).toBeGreaterThan(Math.max(...v.slice(0, -1).map((x) => x.peak)))
    for (const x of v) {
      const ev = x.gain.gain.events
      expect(ev[0]).toMatchObject({ value: 0 })
      expect(ev[0].time).toBeCloseTo(x.start)
      expect(ev[ev.length - 1]).toMatchObject({ kind: 'ramp', value: 0 })
      expect(ev[ev.length - 1].time).toBeLessThanOrEqual(x.start + x.duration + 1e-9)
      expect(ev[1].time - ev[0].time).toBeGreaterThan(0.001) // a real attack ramp
    }
    // master gain caps the output
    const master = ctx.gains[0]
    expect(master.connected).toContain(ctx.destination)
    expect(master.gain.value).toBeLessThanOrEqual(0.8)
  })
})

describe('audio engine robustness', () => {
  it('clamps cues closer than the output latency (and one exactly at now) to the audio clock, and plays them', () => {
    const ctx = new FakeAudioContext({ currentTime: 0.05, outputLatency: 0.3 })
    const { engine } = setup({ ctx })
    const cues: Cue[] = [
      { atMs: S, kind: 'tick' },
      { atMs: S + 100, kind: 'go' },
      { atMs: S + 5_000, kind: 'buzzer' },
    ]
    expect(() => engine.schedule(cues, () => S)).not.toThrow()
    expect(ctx.live.map((o) => o.frequency.value)).toEqual([440, 880, 220])
    expect(ctx.live[0].startAt).toBeCloseTo(0.05, 9)
    expect(ctx.live[1].startAt).toBeCloseTo(0.05, 9)
    expect(ctx.live[2].startAt).toBeCloseTo(0.05 + 5 - 0.3, 9) // far cues still get the latency lead
    for (const o of ctx.oscillators) expect(o.startAt!).toBeGreaterThanOrEqual(ctx.currentTime)
  })

  it('a cue whose oscillator throws does not stop the later cues and nothing escapes', () => {
    const ctx = new FakeAudioContext({ currentTime: 50 })
    const real = ctx.createOscillator.bind(ctx)
    let n = 0
    ctx.createOscillator = () => {
      const o = real()
      if (++n === 2) o.start = () => {
        throw new RangeError('boom')
      }
      return o
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { engine } = setup({ ctx })
    expect(() => engine.schedule(CUES, () => S)).not.toThrow()
    expect(ctx.oscillators.filter((o) => o.startAt !== null)).toHaveLength(CUES.length - 1)
    expect(ctx.live[ctx.live.length - 1].frequency.value).toBe(220)
    warn.mockRestore()
  })

  it('a context that throws everywhere never throws out of schedule, unlock, setMuted or cancelAll', async () => {
    const ctx = new FakeAudioContext({ currentTime: 50, state: 'suspended' })
    ctx.createOscillator = () => {
      throw new Error('dead')
    }
    ctx.resume = () => {
      throw new Error('dead too')
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { engine } = setup({ ctx })
    expect(() => engine.schedule(CUES, () => S)).not.toThrow()
    await expect(engine.unlock()).resolves.toBeUndefined()
    ctx.state = 'running'
    expect(() => engine.schedule(CUES, () => S)).not.toThrow()
    expect(() => engine.setMuted(true)).not.toThrow()
    expect(() => engine.setMuted(false)).not.toThrow()
    expect(() => engine.cancelAll()).not.toThrow()
    warn.mockRestore()
  })
})

describe('audio engine re-planning', () => {
  const GO_CTX = 50 + 4 // go tone (start_at = S + 4 s) on the context clock, scheduled at currentTime 50
  const at = (ctx: FakeAudioContext, freq: number, t: number) => ctx.oscillators.filter((o) => o.frequency.value === freq && Math.abs(o.startAt! - t) < 0.05)

  it('a re-plan during a sounding tone leaves it playing and does not start it again', () => {
    const { ctx, engine } = setup()
    engine.schedule(CUES, () => S)
    const go = at(ctx, 880, GO_CTX)[0]
    ctx.currentTime = GO_CTX + 0.1
    // a clock resync that shifts the estimate by 30 ms: the go tone now looks 70 ms in the past... or ahead
    engine.schedule(CUES, () => S + 4_100 - 30)
    engine.schedule(CUES, () => S + 4_100 + 30)
    expect(go.cancelled).toBe(false)
    expect(go.stopCalls).toEqual([GO_CTX + 0.4])
    expect(go.disconnected).toBe(false)
    expect(at(ctx, 880, GO_CTX)).toHaveLength(1)
  })

  it('a re-plan replaces only cues that have not started', () => {
    const { ctx, engine } = setup()
    engine.schedule(CUES, () => S)
    const ticks = ctx.oscillators.filter((o) => o.frequency.value === 440)
    ctx.currentTime = 50 + 1.05 // first countdown tick (start - 3 s) is sounding
    engine.schedule(CUES, () => S + 1_050)
    expect(ticks[0].cancelled).toBe(false)
    expect(ticks.slice(1).every((o) => o.cancelled)).toBe(true)
    const freshTicks = ctx.live.filter((o) => o.frequency.value === 440)
    expect(freshTicks).toHaveLength(3) // the sounding one plus two re-planned
    expect(ctx.live).toHaveLength(CUES.length)
  })

  it('muting fades a sounding voice out over about 10 ms before stopping it', () => {
    const { ctx, engine } = setup()
    engine.schedule(CUES, () => S)
    const go = at(ctx, 880, GO_CTX)[0]
    ctx.currentTime = GO_CTX + 0.1
    engine.setMuted(true)
    expect(go.cancelled).toBe(false) // not an abrupt stop()
    const ev = voiceOf(go).gain.gain.events
    const last = ev[ev.length - 1]
    expect(last).toMatchObject({ kind: 'ramp', value: 0 })
    expect(last.time - ctx.currentTime).toBeGreaterThanOrEqual(0.005)
    expect(last.time - ctx.currentTime).toBeLessThanOrEqual(0.02)
    expect(ev.some((e) => e.kind === 'cancel' && e.time === ctx.currentTime)).toBe(true)
    expect(go.stopAt!).toBeGreaterThanOrEqual(last.time)
    expect(go.stopAt!).toBeLessThan(GO_CTX + 0.4)
    // not-yet-started voices are simply cancelled
    expect(ctx.oscillators.filter((o) => o.startAt! > ctx.currentTime).every((o) => o.cancelled)).toBe(true)
  })

  it('a round change fades out a tone of the old round', () => {
    const { ctx, engine } = setup()
    engine.schedule(CUES, () => S)
    const go = at(ctx, 880, GO_CTX)[0]
    ctx.currentTime = GO_CTX + 0.1
    engine.cancelAll()
    const next = cueTimeline({ start_at: new Date(S + 60_000).toISOString(), ends_at: new Date(S + 72_000).toISOString() })
    engine.schedule(next, () => S + 4_100)
    expect(go.stopAt!).toBeLessThan(GO_CTX + 0.4)
    expect(go.stopAt! - ctx.currentTime).toBeLessThanOrEqual(0.02)
  })

  it('cancelAll (leaving the round for results) lets a tone that already started ring out', () => {
    const { ctx, engine } = setup()
    engine.schedule(CUES, () => S)
    const buzzer = ctx.oscillators[ctx.oscillators.length - 1]
    ctx.currentTime = buzzer.startAt! + 0.05
    engine.cancelAll()
    expect(buzzer.cancelled).toBe(false)
    expect(buzzer.stopCalls).toEqual([buzzer.startAt! + 0.9])
    expect(buzzer.disconnected).toBe(false)
    expect(voiceOf(buzzer).gain.gain.events.some((e) => e.kind === 'cancel')).toBe(false)
  })
})
