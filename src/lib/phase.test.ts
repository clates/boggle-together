import { describe, it, expect } from 'vitest'
import { derivePhase, progress, type RoomTimes } from './phase'

const S = Date.parse('2026-01-01T00:00:10Z')
const E = Date.parse('2026-01-01T00:03:10Z')
const room: RoomTimes = {
  start_at: '2026-01-01T00:00:10Z',
  ends_at: '2026-01-01T00:03:10Z',
  results_at: null,
}

describe('derivePhase', () => {
  it('lobby without start_at', () => {
    expect(derivePhase({ start_at: null, ends_at: null, results_at: null }, S)).toBe('lobby')
  })
  it('countdown strictly before start_at', () => {
    expect(derivePhase(room, S - 1)).toBe('countdown')
  })
  it('playing at exactly start_at and before ends_at', () => {
    expect(derivePhase(room, S)).toBe('playing')
    expect(derivePhase(room, E - 1)).toBe('playing')
  })
  it('locked at exactly ends_at and after', () => {
    expect(derivePhase(room, E)).toBe('locked')
    expect(derivePhase(room, E + 100000)).toBe('locked')
  })
  it('results when results_at is set', () => {
    expect(derivePhase({ ...room, results_at: '2026-01-01T00:04:00Z' }, S - 1000)).toBe('results')
  })
})

describe('progress', () => {
  it('is 1, 0.5, 0 at start, midpoint, end', () => {
    expect(progress(room, S)).toBe(1)
    expect(progress(room, (S + E) / 2)).toBe(0.5)
    expect(progress(room, E)).toBe(0)
  })
  it('is clamped outside', () => {
    expect(progress(room, S - 5000)).toBe(1)
    expect(progress(room, E + 5000)).toBe(0)
  })
  it('is 1 with no times', () => {
    expect(progress({ start_at: null, ends_at: null, results_at: null }, S)).toBe(1)
  })
})
