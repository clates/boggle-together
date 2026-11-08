import { useEffect, useState } from 'react'
import { boardStats, type BoardStats } from './boardStats'
import { loadWordList } from './wordList'

/** Stats for a board once the word list has loaded and been searched; null until then, or if it cannot load. */
export function useBoardStats(board: readonly string[] | null): BoardStats | null {
  const [result, setResult] = useState<{ key: string; stats: BoardStats | null } | null>(null)
  const key = board ? board.join('|') : null

  useEffect(() => {
    if (!board || key === null) return
    let cancelled = false
    loadWordList().then(
      (words) => {
        // search after the screen has painted: it takes a few tens of milliseconds
        setTimeout(() => {
          if (!cancelled) setResult({ key, stats: boardStats(board, words) })
        }, 0)
      },
      () => {},
    )
    return () => {
      cancelled = true
    }
    // the board's contents, not its identity, decide when to search again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return result && result.key === key ? result.stats : null
}
