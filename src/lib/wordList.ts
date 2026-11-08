// The word list for the board solver: ~170,000 lowercase words (ENABLE, public domain), built by
// scripts/build-wordlist.mjs. It is a separate chunk, fetched only when a results screen wants it.
let loaded: Promise<string[]> | null = null

export function loadWordList(): Promise<string[]> {
  loaded ??= import('./wordlist.txt?raw').then(
    (m) => m.default.split('\n').filter(Boolean),
    (e) => {
      loaded = null // let a later results screen try again
      throw e
    },
  )
  return loaded
}
