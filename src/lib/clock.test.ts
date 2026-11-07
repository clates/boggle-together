import { describe, it, expect } from 'vitest'
import { estimateOffset } from './clock'
import { derivePhase } from './phase'

const TEN_MIN = 600000

describe('estimateOffset', () => {
  it('returns 0 for no samples', () => {
    expect(estimateOffset([])).toBe(0)
  })
  it('detects a local clock 10 minutes slow', () => {
    const server = 1_800_000_000_000
    const local = server - TEN_MIN
    const off = estimateOffset([{ sentMs: local - 100, receivedMs: local + 100, serverMs: server }])
    expect(Math.abs(off - TEN_MIN)).toBeLessThan(1)
  })
  it('prefers the sample with the smaller round trip', () => {
    const server = 1_800_000_000_000
    const local = server - TEN_MIN
    const good = { sentMs: local - 10, receivedMs: local + 10, serverMs: server }
    const bad = { sentMs: local - 2000, receivedMs: local + 2000, serverMs: server + 1500 }
    expect(estimateOffset([bad, good])).toBe(estimateOffset([good]))
    expect(estimateOffset([good, bad])).toBe(estimateOffset([good]))
  })
  it('skewed clock plus offset gives the same phase as a correct clock', () => {
    const start = Date.parse('2026-01-01T00:00:10Z')
    const room = { start_at: '2026-01-01T00:00:10Z', ends_at: '2026-01-01T00:03:10Z', results_at: null }
    const trueNow = start + 60000
    const local = trueNow - TEN_MIN
    const off = estimateOffset([{ sentMs: local - 50, receivedMs: local + 50, serverMs: trueNow }])
    expect(derivePhase(room, local)).toBe('countdown')
    expect(derivePhase(room, local + off)).toBe(derivePhase(room, trueNow))
    expect(derivePhase(room, local + off)).toBe('playing')
  })
})
