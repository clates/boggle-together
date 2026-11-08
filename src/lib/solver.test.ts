import { describe, expect, it } from 'vitest'
import { boardStats, findWords } from './boardStats'
import wordlist from './wordlist.txt?raw'

const WORDS = wordlist.split('\n').filter(Boolean)

// Reference solver, written differently from findWords: a trie of the whole word list, walked from every
// tile in every direction, so nothing but the list and the Boggle rules decides what is found.
type Trie = { next: Map<string, Trie>; end: boolean }
function buildTrie(words: string[]): Trie {
  const root: Trie = { next: new Map(), end: false }
  for (const w of words) {
    let node = root
    for (const ch of w.toUpperCase()) {
      let child = node.next.get(ch)
      if (!child) node.next.set(ch, (child = { next: new Map(), end: false }))
      node = child
    }
    node.end = true
  }
  return root
}
const TRIE = buildTrie(WORDS)

function reference(board: string[]): string[] {
  const found = new Set<string>()
  const seen = new Set<number>()
  const visit = (cell: number, node: Trie, text: string) => {
    let at: Trie | undefined = node
    for (const ch of board[cell].toUpperCase()) at = at?.next.get(ch)
    if (!at) return
    const word = text + board[cell].toUpperCase()
    if (at.end && word.length >= 3) found.add(word)
    seen.add(cell)
    const [r, c] = [Math.floor(cell / 4), cell % 4]
    for (let r2 = Math.max(0, r - 1); r2 <= Math.min(3, r + 1); r2++)
      for (let c2 = Math.max(0, c - 1); c2 <= Math.min(3, c + 1); c2++) if (!seen.has(r2 * 4 + c2)) visit(r2 * 4 + c2, at, word)
    seen.delete(cell)
  }
  for (let i = 0; i < 16; i++) visit(i, TRIE, '')
  return [...found].sort()
}

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)

describe('the word list', () => {
  it('is plain lowercase words of 3 to 16 letters, with no stray Q and nothing offensive', () => {
    expect(WORDS.length).toBeGreaterThan(150_000)
    for (const w of WORDS) {
      expect(w).toMatch(/^[a-z]{3,16}$/)
      expect(w).not.toMatch(/q(?!u)/)
    }
    const set = new Set(WORDS)
    for (const w of ['fuck', 'shit', 'cunt', 'bitch', 'whore', 'nigger', 'fag', 'faggot', 'slut', 'rapist']) expect(set.has(w), w).toBe(false)
    expect(WORDS.filter((w) => /fuck|shit|cunt|nigg|whore|bitch/.test(w))).toEqual([])
    for (const w of ['fox', 'meet', 'tone', 'tote', 'yet', 'quiet']) expect(set.has(w), w).toBe(true)
  })
})

describe('the solver finds exactly the words Boggle allows', () => {
  it('matches an independent trie search on many random boards, Qu tiles included', () => {
    const rand = rng(2026)
    const faces = 'AAAEEEIIOOUUSSTTRRNNLLDCMPHBFGYWKVXJZ'.split('')
    for (let b = 0; b < 40; b++) {
      const board = Array.from({ length: 16 }, () => (rand() < 0.07 ? 'Qu' : faces[Math.floor(rand() * faces.length)]))
      expect(findWords(board, WORDS), board.join('')).toEqual(reference(board))
    }
  })

  it('finds the words the player named on their own board, and agrees with the reference', () => {
    // Y E X O / N T F O / O Y M H / T E E G, from a real game
    const board = 'YEXONTFOOYMHTEEG'.split('')
    const found = findWords(board, WORDS)
    expect(found).toEqual(reference(board))
    for (const w of ['TONE', 'MEET', 'TOTE', 'FOX', 'YET']) expect(found).toContain(w)
    expect(found).not.toContain('FOXY') // no Y touches the X
  })

  it('stats are the true maxima over everything found', () => {
    const board = 'YEXONTFOOYMHTEEG'.split('')
    const found = reference(board)
    const s = boardStats(board, WORDS)!
    expect(s.wordCount).toBe(found.length)
    expect(s.longest.length).toBe(Math.max(...found.map((w) => w.length)))
    expect(found).toContain(s.longest)
    expect(s.longestOthers).toBe(found.filter((w) => w.length === s.longest.length).length - 1)
    const points = (w: string) => [...w].reduce((n, ch) => n + ('AEIOULNSTR'.includes(ch) ? 1 : 'DG'.includes(ch) ? 2 : 'BCMP'.includes(ch) ? 3 : 'FHVWY'.includes(ch) ? 4 : ch === 'K' ? 5 : 'JX'.includes(ch) ? 8 : 10), 0)
    expect(s.exotic.points).toBe(Math.max(...found.map(points)))
    expect(points(s.exotic.word)).toBe(s.exotic.points)
  })
})
