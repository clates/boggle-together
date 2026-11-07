import { describe, it, expect } from 'vitest'
import { normalizeWord, markShared } from './words'

describe('normalizeWord', () => {
  it('trims and uppercases', () => {
    expect(normalizeWord('  train ')).toBe('TRAIN')
  })
  it('accepts length bounds 3 and 20', () => {
    expect(normalizeWord('abc')).toBe('ABC')
    expect(normalizeWord('a'.repeat(20))).toBe('A'.repeat(20))
  })
  it('rejects invalid input', () => {
    expect(normalizeWord('ab')).toBeNull()
    expect(normalizeWord('tr4in')).toBeNull()
    expect(normalizeWord('two words')).toBeNull()
    expect(normalizeWord('')).toBeNull()
    expect(normalizeWord('🙂🙂🙂')).toBeNull()
    expect(normalizeWord('a'.repeat(21))).toBeNull()
    expect(normalizeWord('café')).toBeNull()
  })
})

describe('markShared', () => {
  it('marks words shared across players, sorted', () => {
    const out = markShared({ A: ['rain', 'sand'], B: ['sand', 'hold'] })
    expect(out.A).toEqual([
      { word: 'rain', shared: false },
      { word: 'sand', shared: true },
    ])
    expect(out.B).toEqual([
      { word: 'hold', shared: false },
      { word: 'sand', shared: true },
    ])
  })
  it('does not count a duplicate within one player as shared', () => {
    const out = markShared({ A: ['sand', 'sand'], B: ['rain'] })
    expect(out.A).toEqual([{ word: 'sand', shared: false }])
  })
  it('handles empty input and empty lists', () => {
    expect(markShared({})).toEqual({})
    expect(markShared({ A: [] })).toEqual({ A: [] })
  })
  it('sorts with plain string comparison', () => {
    const out = markShared({ A: ['b', 'B', 'a'] })
    expect(out.A.map((x) => x.word)).toEqual(['B', 'a', 'b'])
  })
})
