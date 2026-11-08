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

  it('counts the busiest tile (alphabetical on a tie) by the number of different words it appears in', () => {
    const s = boardStats(BOARD, ['TEAM', 'TEA', 'TEAR'])!
    expect(s.busiestTile).toEqual({ tile: 'A', words: 3 })
  })
})
