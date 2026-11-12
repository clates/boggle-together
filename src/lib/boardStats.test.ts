import { describe, expect, it } from 'vitest'
import { boardStats, canTrace, scrabbleScore } from './boardStats'

// T E A M
// S R O N
// L I D P
// Qu U C H
const BOARD = ['T', 'E', 'A', 'M', 'S', 'R', 'O', 'N', 'L', 'I', 'D', 'P', 'Qu', 'U', 'C', 'H']

describe('scrabbleScore', () => {
  it('adds letter values, in any case', () => {
    expect(scrabbleScore('QUIZ')).toBe(10 + 1 + 1 + 10)
    expect(scrabbleScore('team')).toBe(1 + 1 + 1 + 3)
  })
})

describe('canTrace', () => {
  it('follows neighbouring tiles, diagonals included', () => {
    expect(canTrace(BOARD, 'TEAM')).toBe(true)
    expect(canTrace(BOARD, 'ROAM')).toBe(true)
    expect(canTrace(BOARD, 'TRAM')).toBe(true) // T to R is a diagonal step
    expect(canTrace(BOARD, 'TOAD')).toBe(false) // T and O are two tiles apart
  })
  it('never reuses a tile', () => {
    expect(canTrace(BOARD, 'TEET')).toBe(false)
  })
  it('reads the Qu tile as two letters', () => {
    expect(canTrace(BOARD, 'QUIL')).toBe(true) // Qu, I, L
    expect(canTrace(BOARD, 'QI')).toBe(false) // there is no lone Q
  })
  it('rejects a board of the wrong size or an empty word', () => {
    expect(canTrace(['A'], 'A')).toBe(false)
    expect(canTrace(BOARD, '')).toBe(false)
  })
})

describe('boardStats', () => {
  it('is null when nothing valid was typed', () => {
    expect(boardStats(BOARD, [])).toBeNull()
    expect(boardStats(BOARD, ['ZZZZ', 'to', 'XYLOPHONE'])).toBeNull()
  })

  it('ignores words that are not on the board, short words and repeats', () => {
    const s = boardStats(BOARD, ['team', 'TEAM', 'TEA', 'at', 'MAXIMUM'])!
    expect(s.wordCount).toBe(2)
  })

  it('finds the longest word (first alphabetically on a tie)', () => {
    expect(boardStats(BOARD, ['TEA', 'TEAM', 'MOAN'])!.longest).toBe('MOAN')
  })

  it('finds the highest Scrabble value, preferring the longer word on a tie', () => {
    const s = boardStats(BOARD, ['TEA', 'TEAM', 'MOAN'])!
    expect(s.exotic).toEqual({ word: 'MOAN', points: 3 + 1 + 1 + 1 })
    expect(boardStats(BOARD, ['QUIL'])!.exotic.points).toBe(13)
  })

  it('counts the busiest tile (first in reading order on a tie) by the number of different words it appears in', () => {
    const s = boardStats(BOARD, ['TEAM', 'TEA', 'TEAR'])!
    // T, E and A are each in all three words: the first of them in reading order wins
    const first = Math.min(...['T', 'E', 'A'].map((t) => BOARD.indexOf(t)))
    expect(s.busiestTile).toEqual({ tile: BOARD[first], cell: first, words: 3 })
  })

  it('counts two tiles with the same letter apart', () => {
    // SAD can only use A(0); ANT, TAN, EAT and TEA can only use A(10). Per letter that would be
    // "A: 5 words", but no single A tile is in more than 4.
    // A D X X
    // S X X X
    // X X A N
    // X X E T
    const board = ['A', 'D', 'X', 'X', 'S', 'X', 'X', 'X', 'X', 'X', 'A', 'N', 'X', 'X', 'E', 'T']
    const s = boardStats(board, ['SAD', 'ANT', 'TAN', 'EAT', 'TEA'])!
    expect(s.wordCount).toBe(5)
    expect(s.busiestTile).toEqual({ tile: 'A', cell: 10, words: 4 })
  })
})

describe('Boggle rules, checked against an independent search', () => {
  // Reference: list every path on the board (no tile twice, each step to one of the 8 neighbours),
  // written as plain coordinates so it shares no logic with canTrace.
  function allWords(board: string[], maxLen: number, cells?: Map<string, Set<number>>): Set<string> {
    const found = new Set<string>()
    const extend = (path: number[], text: string) => {
      if (text.length >= 1) found.add(text)
      if (cells) for (const c of path) cells.set(text, (cells.get(text) ?? new Set()).add(c))
      if (text.length >= maxLen) return
      const [r, c] = [Math.floor(path[path.length - 1] / 4), path[path.length - 1] % 4]
      for (let r2 = 0; r2 < 4; r2++)
        for (let c2 = 0; c2 < 4; c2++) {
          const touching = Math.max(Math.abs(r - r2), Math.abs(c - c2)) === 1
          const cell = r2 * 4 + c2
          if (touching && !path.includes(cell)) extend([...path, cell], text + board[cell].toUpperCase())
        }
    }
    for (let i = 0; i < 16; i++) extend([i], board[i].toUpperCase())
    return found
  }

  // a small seeded random generator so a failure can be reproduced
  const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)

  it('canTrace agrees with the reference on random boards, for real paths and for near-misses', () => {
    const rand = rng(42)
    const letters = 'AAEEIOURSTLNDCMPHQ'
    for (let b = 0; b < 25; b++) {
      const board = Array.from({ length: 16 }, () => {
        const ch = letters[Math.floor(rand() * letters.length)]
        return ch === 'Q' ? 'Qu' : ch
      })
      const real = allWords(board, 5)
      for (const w of real) expect(canTrace(board, w), `${board.join('')} ${w}`).toBe(true)
      for (let i = 0; i < 400; i++) {
        const len = 3 + Math.floor(rand() * 3)
        let w = ''
        for (let k = 0; k < len; k++) w += letters[Math.floor(rand() * 17)] // no Q: a lone Q is never spellable
        expect(canTrace(board, w), `${board.join('')} ${w}`).toBe(real.has(w))
      }
    }
  })

  it('does not wrap around the edges', () => {
    // A at the end of row 0, B at the start of row 1: far apart on the board though next to each other in the list
    const board = ['X', 'X', 'X', 'A', 'B', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X']
    expect(canTrace(board, 'AB')).toBe(false)
    expect(canTrace(board, 'XA')).toBe(true)
  })

  it('may use two different tiles that show the same letter, but not one tile twice', () => {
    const board = ['A', 'D', 'X', 'X', 'A', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X']
    expect(canTrace(board, 'ADA')).toBe(true) // A(0) D(1) A(4), both A tiles touch D
    expect(canTrace(['A', 'D', ...Array(14).fill('X')], 'ADA')).toBe(false) // only one A tile
  })

  it('longest word and the busiest tile are the true answers, found by brute force', () => {
    const rand = rng(7)
    const letters = 'AAEEIOURSTLNDCMPH'
    for (let b = 0; b < 15; b++) {
      const board = Array.from({ length: 16 }, () => letters[Math.floor(rand() * letters.length)])
      const cells = new Map<string, Set<number>>() // word -> every cell on some path for it
      const words = [...allWords(board, 6, cells)].filter((w) => w.length >= 3)
      // type a mix of real paths and impossible words of every length
      const typed = [...words.filter(() => rand() < 0.15), 'ZZZZZZZZZZ', 'AAAAAAAAAAAAAAAA', 'QUITE']
      const s = boardStats(board, typed)
      const valid = [...new Set(typed.filter((w) => w.length >= 3 && words.includes(w)))]
      if (valid.length === 0) {
        expect(s).toBeNull()
        continue
      }
      expect(s!.longest.length).toBe(Math.max(...valid.map((w) => w.length)))
      expect(valid).toContain(s!.longest)
      const count = (cell: number) => valid.filter((w) => cells.get(w)!.has(cell)).length
      const best = Math.max(...board.map((_, cell) => count(cell)))
      expect(s!.busiestTile.words).toBe(best)
      expect(count(s!.busiestTile.cell)).toBe(best)
      expect(s!.busiestTile.tile).toBe(board[s!.busiestTile.cell])
    }
  })

  it('credits a Qu tile, not a U tile, for the U inside Qu', () => {
    // Qu A U / E . . : QUA and QUE use Qu; EAU uses the real U tile. U is used once, never three times.
    const board = ['Qu', 'A', 'U', 'X', 'E', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X']
    const s = boardStats(board, ['QUA', 'QUE', 'EAU'])!
    expect(s.wordCount).toBe(3)
    // Qu (QUA, QUE) and A (QUA, EAU) tie at 2, and Qu comes first; the U tile is only in EAU
    expect(s.busiestTile).toEqual({ tile: 'QU', cell: 0, words: 2 })
    expect(boardStats(board, ['QUA', 'QUE', 'EAU', 'QUAE'])!.busiestTile).toEqual({ tile: 'QU', cell: 0, words: 3 })
  })
})
