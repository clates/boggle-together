// Facts about a board, worked out in the browser from the board and a word list: what is the longest
// word hiding on it, the highest-scoring one, which tile shows up in the most words. A word counts
// only if it can really be traced on the board (neighbouring tiles, no tile twice, Qu is one tile).

export type BoardStats = {
  /** how many different words can be found on the board */
  wordCount: number
  longest: string
  /** how many other words are exactly as long */
  longestOthers: number
  /** the tile that shows up in the most different words, and how many */
  busiestTile: { tile: string; words: number }
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

/** The tiles a traceable word is made of. Only multi-letter tiles (Qu) can make this ambiguous, and Q exists nowhere else. */
function tilesOf(word: string, tiles: readonly string[]): string[] {
  const multi = tiles.filter((t) => t.length > 1)
  const out: string[] = []
  for (let i = 0; i < word.length; ) {
    const long = multi.find((t) => word.startsWith(t, i))
    const tile = long ?? word[i]
    out.push(tile)
    i += tile.length
  }
  return out
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

  // Words that use a tile, each word counted once per tile. A word is read as the tiles it is made of:
  // the Qu tile swallows its own U, so QUIT uses Qu, I and T but never a separate U tile.
  const tiles = [...new Set(board.map((t) => t.toUpperCase()))].sort()
  const uses = new Map<string, number>(tiles.map((t) => [t, 0]))
  for (const w of valid) for (const tile of new Set(tilesOf(w, tiles))) uses.set(tile, (uses.get(tile) ?? 0) + 1)
  let busiest = { tile: tiles[0], words: -1 }
  for (const tile of tiles) if ((uses.get(tile) ?? 0) > busiest.words) busiest = { tile, words: uses.get(tile) ?? 0 }
  const longestOthers = valid.filter((w) => w.length === longest.length).length - 1
  return { wordCount: valid.length, longest, longestOthers, busiestTile: busiest, exotic }
}
