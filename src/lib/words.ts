export function normalizeWord(raw: string): string | null {
  const w = raw.trim().toUpperCase()
  return /^[A-Z]{3,20}$/.test(w) ? w : null
}

export function markShared(
  lists: Record<string, string[]>,
): Record<string, { word: string; shared: boolean }[]> {
  const counts = new Map<string, number>()
  for (const words of Object.values(lists)) {
    for (const w of new Set(words)) counts.set(w, (counts.get(w) ?? 0) + 1)
  }
  const out: Record<string, { word: string; shared: boolean }[]> = {}
  for (const [player, words] of Object.entries(lists)) {
    out[player] = [...new Set(words)]
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      .map((word) => ({ word, shared: (counts.get(word) ?? 0) >= 2 }))
  }
  return out
}
