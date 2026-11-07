import { describe, expect, it } from 'vitest'
import { cueTimeline, type Cue } from './cues'

const START = Date.parse('2026-11-07T12:00:05Z')
const iso = (ms: number) => new Date(ms).toISOString()
const room = (startMs: number, endMs: number) => ({ start_at: iso(startMs), ends_at: iso(endMs) })
const offsets = (cues: Cue[], kind: Cue['kind'], from: number) => cues.filter((c) => c.kind === kind).map((c) => c.atMs - from)

describe('cueTimeline', () => {
  it('production round (180 s, 5 s countdown): 3 ticks, go, chime pair, 10 mini-ticks, buzzer', () => {
    const end = START + 180_000
    const cues = cueTimeline(room(START, end))
    expect(offsets(cues, 'tick', START)).toEqual([-3000, -2000, -1000])
    expect(offsets(cues, 'go', START)).toEqual([0])
    expect(offsets(cues, 'chime-low', end)).toEqual([-60_000])
    expect(offsets(cues, 'chime-high', end)).toEqual([-60_000 + 350])
    expect(offsets(cues, 'mini-tick', end)).toEqual([-10, -9, -8, -7, -6, -5, -4, -3, -2, -1].map((s) => s * 1000))
    expect(offsets(cues, 'buzzer', end)).toEqual([0])
    expect(cues).toHaveLength(3 + 1 + 2 + 10 + 1)
  })

  it('short test round (12 s, 2 s countdown): no chime, every mini-tick after the start', () => {
    const end = START + 12_000
    const cues = cueTimeline(room(START, end))
    expect(cues.some((c) => c.kind === 'chime-low' || c.kind === 'chime-high')).toBe(false)
    const minis = cues.filter((c) => c.kind === 'mini-tick')
    expect(minis).toHaveLength(10)
    expect(minis.every((c) => c.atMs > START)).toBe(true)
    expect(offsets(cues, 'mini-tick', START)[0]).toBe(2000)
  })

  it('drops mini-ticks that would fall at or before the start of a very short round', () => {
    const end = START + 5_000
    const cues = cueTimeline(room(START, end))
    expect(offsets(cues, 'mini-tick', end)).toEqual([-4000, -3000, -2000, -1000])
    expect(cues.filter((c) => c.kind !== 'tick').every((c) => c.atMs >= START)).toBe(true)
  })

  it('is sorted by time and has no duplicates', () => {
    for (const len of [5_000, 12_000, 60_000, 61_000, 180_000]) {
      const cues = cueTimeline(room(START, START + len))
      const times = cues.map((c) => c.atMs)
      expect(times).toEqual([...times].sort((a, b) => a - b))
      expect(new Set(cues.map((c) => `${c.atMs}:${c.kind}`)).size).toBe(cues.length)
      expect(new Set(times).size).toBe(times.length)
    }
  })

  it('a 60 s round has no chime (it would land on the go tone)', () => {
    const cues = cueTimeline(room(START, START + 60_000))
    expect(cues.some((c) => c.kind === 'chime-low')).toBe(false)
  })

  it('reads timestamps in any timezone offset format', () => {
    const forms = [
      { start_at: '2026-11-07T12:00:05Z', ends_at: '2026-11-07T12:03:05Z' },
      { start_at: '2026-11-07T12:00:05.000+00:00', ends_at: '2026-11-07T12:03:05.000+00:00' },
      { start_at: '2026-11-07T07:00:05-05:00', ends_at: '2026-11-07T07:03:05-05:00' },
      { start_at: '2026-11-07T17:30:05.000+05:30', ends_at: '2026-11-07T17:33:05+05:30' },
    ]
    const expected = cueTimeline(room(START, START + 180_000))
    for (const f of forms) expect(cueTimeline(f)).toEqual(expected)
  })

  it('returns nothing for unparseable or inverted times', () => {
    expect(cueTimeline({ start_at: 'nope', ends_at: iso(START) })).toEqual([])
    expect(cueTimeline(room(START, START - 1))).toEqual([])
  })
})
