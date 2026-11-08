// Builds src/lib/wordlist.txt for the board solver from the ENABLE word list (public domain).
//   curl -L -o enable1.txt https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt
//   node scripts/build-wordlist.mjs enable1.txt
// Keeps words of 3 to 16 letters (a board has 16 tiles), a to z only, with every q followed by u (the Qu tile
// is the only Q on a board), and drops the words in scripts/wordlist-blocklist.txt.
import { readFileSync, writeFileSync } from 'node:fs'

const [src] = process.argv.slice(2)
if (!src) throw new Error('usage: node scripts/build-wordlist.mjs <enable1.txt>')
const blocked = new Set(
  readFileSync(new URL('./wordlist-blocklist.txt', import.meta.url), 'utf8')
    .split('\n')
    .map((l) => l.trim().toLowerCase())
    .filter((l) => l && !l.startsWith('#')),
)
// words that are never fine, whatever they are built into (checked as a substring)
const NEVER = ['fuck', 'shit', 'cunt', 'nigg', 'faggot', 'whore', 'bitch', 'cocksuck', 'bollock', 'wank']
const words = readFileSync(src, 'utf8')
  .split('\n')
  .map((w) => w.trim().toLowerCase())
  .filter((w) => /^[a-z]{3,16}$/.test(w) && !/q(?!u)/.test(w) && !blocked.has(w) && !NEVER.some((n) => w.includes(n)))
writeFileSync(new URL('../src/lib/wordlist.txt', import.meta.url), words.join('\n') + '\n')
console.log(`${words.length} words`)
