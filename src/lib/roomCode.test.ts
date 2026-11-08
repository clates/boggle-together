import { describe, expect, it } from 'vitest'
import { editCode, isComplete, isKnownWord, normalizeCode, suggestWord } from './roomCode'

describe('normalizeCode', () => {
  it.each([
    // the ways people say and type a code
    ['pecan 2654', 'PECAN-2654'],
    ['pecan2654', 'PECAN-2654'],
    ['PECAN-2654', 'PECAN-2654'],
    ['pecan - 2654', 'PECAN-2654'],
    ['Pecan, 2654', 'PECAN-2654'],
    ['  pecan 2654  ', 'PECAN-2654'],
    ['pecan.2654', 'PECAN-2654'],
    ['pecan – 2654', 'PECAN-2654'],
    ['pe can 2654', 'PECAN-2654'],
    // pasted invite links and messages
    ['https://boggle.example/r/PECAN-2654', 'PECAN-2654'],
    ['https://boggle.example/r/pecan-2654?m=type', 'PECAN-2654'],
    ['http://localhost:5173/r/lime-6014', 'LIME-6014'],
    ['Join us tonight! Code: lime-6014, see you', 'LIME-6014'],
    // partial codes while typing
    ['', ''],
    ['p', 'P'],
    ['pecan', 'PECAN'],
    ['pecan ', 'PECAN-'],
    ['pecan-', 'PECAN-'],
    ['pecan,', 'PECAN-'],
    ['pecan 2', 'PECAN-2'],
    ['pecan26', 'PECAN-26'],
    // caps and junk
    ['pecan 265478', 'PECAN-2654'],
    ['pecan-2654x', 'PECAN-2654'],
    ['mushroomsoup', 'MUSHROOM'],
    ['pé!can', 'PCAN'],
    ['2654', ''],
    ['--', ''],
    // URL-encoded and full-width text is decoded first
    ['pecan%202654', 'PECAN-2654'],
    ['pecan%2D2654', 'PECAN-2654'],
    ['https://boggle.example/r/pecan%202654?m=type', 'PECAN-2654'],
    ['https%3A%2F%2Fboggle.example%2Fr%2Fpecan%2D2654%3Fm%3Dtype', 'PECAN-2654'],
    ['ＰＥＣＡＮ　２６５４', 'PECAN-2654'],
    ['pecan２６５４', 'PECAN-2654'],
  ])('%j -> %j', (raw, out) => {
    expect(normalizeCode(raw)).toBe(out)
  })
})

describe('normalizeCode on hostile input', () => {
  it.each(['pecan%2', 'pecan%zz2654', '%E0%A4%A', '%', 'pecan%%2654'])('malformed escapes in %j do not throw', (raw) => {
    expect(() => normalizeCode(raw)).not.toThrow()
  })

  it('malformed escapes still read the code around them', () => {
    expect(normalizeCode('pecan%E0%A42654')).toBe('PECAN-2654') // invalid UTF-8: decodeURIComponent throws
  })

  it('a 100k-character input normalizes in well under 100 ms', () => {
    for (const raw of ['a'.repeat(100_000), 'a'.repeat(100_000) + ' 2654', 'a1'.repeat(50_000), 'ab '.repeat(33_000) + '%20'.repeat(1000)]) {
      const t = performance.now()
      normalizeCode(raw)
      editCode('PECAN', raw, raw.length)
      expect(performance.now() - t).toBeLessThan(100)
    }
  })
})

describe('isComplete', () => {
  it('needs a word and exactly four digits', () => {
    expect(isComplete('PECAN-2654')).toBe(true)
    expect(isComplete('PECAN-265')).toBe(false)
    expect(isComplete('PECAN-')).toBe(false)
    expect(isComplete('PECAN')).toBe(false)
    expect(isComplete('-2654')).toBe(false)
  })
})

describe('editCode (what the input shows after each keystroke, and where the caret goes)', () => {
  it('inserts the hyphen at the letters-to-digits boundary', () => {
    expect(editCode('PECAN', 'PECAN2', 6)).toEqual({ value: 'PECAN-2', caret: 7 })
  })

  it('a typed space or hyphen shows the hyphen once', () => {
    expect(editCode('PECAN', 'PECAN ', 6)).toEqual({ value: 'PECAN-', caret: 6 })
    expect(editCode('PECAN', 'PECAN-', 6)).toEqual({ value: 'PECAN-', caret: 6 })
    expect(editCode('PECAN-', 'PECAN--', 7)).toEqual({ value: 'PECAN-', caret: 6 })
    expect(editCode('PECAN-', 'PECAN-2', 7)).toEqual({ value: 'PECAN-2', caret: 7 })
  })

  it('backspacing the first digit takes the auto hyphen with it', () => {
    expect(editCode('PECAN-2', 'PECAN-', 6)).toEqual({ value: 'PECAN', caret: 5 })
  })

  it('backspace right after the hyphen removes the last letter, not a stuck hyphen', () => {
    // caret was after the hyphen in PECAN-|2654; the browser removed the hyphen
    expect(editCode('PECAN-2654', 'PECAN2654', 5)).toEqual({ value: 'PECA-2654', caret: 4 })
  })

  it('forward delete just before the hyphen removes the first digit', () => {
    expect(editCode('PECAN-2654', 'PECAN2654', 5, 'deleteContentForward')).toEqual({ value: 'PECAN-654', caret: 5 })
  })

  it('backspacing letters works normally', () => {
    expect(editCode('PECAN', 'PECA', 4)).toEqual({ value: 'PECA', caret: 4 })
    expect(editCode('PECAN-', 'PECAN', 5)).toEqual({ value: 'PECAN', caret: 5 })
  })

  it('keeps the caret in place when editing the word in the middle', () => {
    expect(editCode('PECN-2654', 'PECaN-2654', 4)).toEqual({ value: 'PECAN-2654', caret: 4 })
    expect(editCode('PECAN-2654', 'PECAN -2654', 6)).toEqual({ value: 'PECAN-2654', caret: 6 })
  })

  it('drops rejected characters without moving the caret past them', () => {
    expect(editCode('PECAN-26', 'PECAN-26x', 9)).toEqual({ value: 'PECAN-26', caret: 8 })
    expect(editCode('PECAN-2654', 'PECAN-26545', 11)).toEqual({ value: 'PECAN-2654', caret: 10 })
  })

  it('a pasted link becomes the code with the caret at the end', () => {
    expect(editCode('', 'https://boggle.example/r/pecan-2654', 35)).toEqual({ value: 'PECAN-2654', caret: 10 })
  })
})

describe('words', () => {
  it('knows current and legacy words', () => {
    expect(isKnownWord('PECAN')).toBe(true)
    expect(isKnownWord('MAHOGANY')).toBe(true) // from the original list: old rooms still exist
    expect(isKnownWord('PECKAN')).toBe(false)
  })

  it('suggests the closest word within two edits', () => {
    expect(suggestWord('PECKAN')).toBe('PECAN')
    expect(suggestWord('PEKAN')).toBe('PECAN')
    expect(suggestWord('MAPEL')).toBe('MAPLE') // a swap counts as one edit
    expect(suggestWord('CEEDAR')).toBe('CEDAR')
  })

  it('no suggestion for a known word, a far-off word, or a tie', () => {
    expect(suggestWord('PECAN')).toBeNull()
    expect(suggestWord('ZZZZZZZ')).toBeNull()
    expect(suggestWord('BEAK')).toBeNull() // BEAN and TEAK are both one edit away
  })
})
