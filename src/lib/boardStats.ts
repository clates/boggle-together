// Facts about a board, worked out in the browser from the board and a word list: what is the longest
// word hiding on it, the highest-scoring one, which tile (one cell, not every tile with that letter)
// shows up in the most words. A word counts only if it can really be traced on the board (neighbouring tiles, no tile twice, Qu is one tile).

export type BoardStats = {
  /** how many different words can be found on the board */
  wordCount: number
  longest: string
  /** how many other words are exactly as long */
  longestOthers: number
  /** the tile (one cell, 0-15 in reading order) that shows up in the most different words, and how many */
  busiestTile: { tile: string; cell: number; words: number }
  /** the word with the highest Scrabble value */
  exotic: { word: string; points: number }
}


const SIZE = 4
const MIN_LENGTH = 3

const POINTS: Record<string, number> = {
  A: 1, E: 1, I: 1, O: 1, U: 1, L: 1, N: 1, S: 1, T: 1, R: 1,
  D: 2, G: 2,
  B: 3, C: 3, M: 3, P: 3,
  F: 4, H: 4, V: 4, W: 4, Y: 4,
  K: 5,
  J: 8, X: 8,
  Q: 10, Z: 10,
}

/** Scrabble value of a word (a Qu tile is worth Q + U). */
export function scrabbleScore(word: string): number {
  let sum = 0
  for (const ch of word.toUpperCase()) sum += POINTS[ch] ?? 0
  return sum
}

/** A checker for one board: can a word be spelled by a path of touching tiles that uses each tile once? */
function tracer(board: readonly string[]): (word: string) => boolean {
  const tiles = board.map((t) => t.toUpperCase())
  if (tiles.length !== SIZE * SIZE) return () => false
  const used = new Array<boolean>(tiles.length).fill(false)
  return (word) => {
    const target = word.toUpperCase()
    if (target === '') return false
    const walk = (cell: number, at: number): boolean => {
      const tile = tiles[cell]
      if (used[cell] || !target.startsWith(tile, at)) return false
      const next = at + tile.length
      if (next === target.length) return true
      used[cell] = true
      const row = Math.floor(cell / SIZE)
      const col = cell % SIZE
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const r = row + dr
          const c = col + dc
          if ((dr === 0 && dc === 0) || r < 0 || r >= SIZE || c < 0 || c >= SIZE) continue
          if (walk(r * SIZE + c, next)) {
            used[cell] = false
            return true
          }
        }
      used[cell] = false
      return false
    }
    return tiles.some((_, cell) => walk(cell, 0))
  }
}

/** Can the word be spelled by a path of touching tiles that uses each tile once? */
export function canTrace(board: readonly string[], word: string): boolean {
  return tracer(board)(word)
}

/** Every word from the list (3 letters or more) that can be found on the board, once each, in order. */
export function findWords(board: readonly string[], words: readonly string[]): string[] {
  const trace = tracer(board)
  // a word with a letter the board does not have cannot be found: skip the path search for it
  const letters = new Set(board.join('').toUpperCase())
  const found = new Set<string>()
  for (const raw of words) {
    if (raw.length < MIN_LENGTH) continue
    const w = raw.toUpperCase()
    if (found.has(w)) continue
    let possible = true
    for (const ch of w) if (!letters.has(ch)) { possible = false; break }
    if (possible && trace(w)) found.add(w)
  }
  return [...found].sort()
}

/**
 * Every cell some path for the word goes through. A word can often be traced more than one way (two
 * A tiles, say), and each of those tiles is part of it. The Qu tile covers its own U, so QUIT never
 * touches a separate U tile.
 */
function cellsOf(board: readonly string[], word: string): Set<number> {
  const tiles = board.map((t) => t.toUpperCase())
  const target = word.toUpperCase()
  const cells = new Set<number>()
  const path: number[] = []
  const walk = (cell: number, at: number) => {
    const tile = tiles[cell]
    if (path.includes(cell) || !target.startsWith(tile, at)) return
    path.push(cell)
    const next = at + tile.length
    if (next === target.length) for (const c of path) cells.add(c)
    else {
      const row = Math.floor(cell / SIZE)
      const col = cell % SIZE
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const r = row + dr
          const c = col + dc
          if ((dr !== 0 || dc !== 0) && r >= 0 && r < SIZE && c >= 0 && c < SIZE) walk(r * SIZE + c, next)
        }
    }
    path.pop()
  }
  for (let cell = 0; cell < tiles.length; cell++) walk(cell, 0)
  return cells
}

/** Stats for the board from a word list, or null when no word on the list can be found on it. */
export function boardStats(board: readonly string[], words: readonly string[]): BoardStats | null {
  const valid = findWords(board, words)
  if (valid.length === 0) return null

  let longest = valid[0]
  let exotic = { word: valid[0], points: scrabbleScore(valid[0]) }
  for (const w of valid) {
    if (w.length > longest.length) longest = w
    const points = scrabbleScore(w)
    if (points > exotic.points || (points === exotic.points && w.length > exotic.word.length)) exotic = { word: w, points }
  }

  // Words that use each tile (cell), each word counted once per tile. Two tiles with the same letter
  // are counted apart: a word only counts for the ones it can really be traced through.
  const uses = new Array<number>(board.length).fill(0)
  for (const w of valid) for (const cell of cellsOf(board, w)) uses[cell]++
  let busiest = 0
  for (let cell = 1; cell < uses.length; cell++) if (uses[cell] > uses[busiest]) busiest = cell
  const busiestTile = { tile: board[busiest].toUpperCase(), cell: busiest, words: uses[busiest] }
  const longestOthers = valid.filter((w) => w.length === longest.length).length - 1
  return { wordCount: valid.length, longest, longestOthers, busiestTile, exotic }
}
