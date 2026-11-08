// A few facts about the round, worked out in the browser from the board and the typed words.
// The app never checks words against a dictionary, so a typo could otherwise win "longest word":
// only words that can really be traced on the board (neighbouring tiles, no tile twice) count.

export type BoardStats = {
  /** how many different valid words were typed, across everyone */
  wordCount: number
  longest: string
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

/** Can the word be spelled by a path of touching tiles that uses each tile once? */
export function canTrace(board: readonly string[], word: string): boolean {
  const tiles = board.map((t) => t.toUpperCase())
  const target = word.toUpperCase()
  if (tiles.length !== SIZE * SIZE || target === '') return false
  const used = new Array<boolean>(tiles.length).fill(false)
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

/** Stats for the round, or null when nobody typed a word that can be found on the board. */
export function boardStats(board: readonly string[], typed: readonly string[]): BoardStats | null {
  const valid = [...new Set(typed.map((w) => w.toUpperCase()))].filter((w) => w.length >= MIN_LENGTH && canTrace(board, w)).sort()
  if (valid.length === 0) return null

  let longest = valid[0]
  let exotic = { word: valid[0], points: scrabbleScore(valid[0]) }
  for (const w of valid) {
    if (w.length > longest.length) longest = w
    const points = scrabbleScore(w)
    if (points > exotic.points || (points === exotic.points && w.length > exotic.word.length)) exotic = { word: w, points }
  }

  // words that use a tile: a tile counts once per word however often it appears in it
  const tiles = [...new Set(board.map((t) => t.toUpperCase()))].sort()
  let busiest = { tile: tiles[0], words: -1 }
  for (const tile of tiles) {
    const words = valid.filter((w) => w.includes(tile)).length
    if (words > busiest.words) busiest = { tile, words }
  }
  return { wordCount: valid.length, longest, busiestTile: busiest, exotic }
}
