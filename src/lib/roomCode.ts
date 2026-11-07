// Room codes look like PECAN-2654: a word from ROOM_WORDS, a hyphen, four digits. They are mostly
// read out loud ("pecan 2654"), so input is forgiving: any case, any separator (or none), pasted
// links or messages. The hyphen is shown automatically and never has to be typed.

/** The words create_room picks from. Must equal the list in supabase/migrations/0005_room_code_words.sql (tested). */
export const ROOM_WORDS: readonly string[] = [
  'OAK', 'ELM', 'ASH', 'BIRCH', 'MAPLE', 'SPRUCE', 'WILLOW', 'HAZEL', 'LARCH', 'ASPEN',
  'LINDEN', 'HOLLY', 'LAUREL', 'REDWOOD', 'TEAK', 'PALM', 'BAMBOO', 'BONSAI', 'SAPLING', 'STUMP',
  'BARK', 'WALNUT', 'PECAN', 'CASHEW', 'NUTMEG', 'ACORN', 'HUSK', 'CHERRY', 'FIG', 'OLIVE',
  'MANGO', 'LEMON', 'LIME', 'ORANGE', 'PEACH', 'GRAPE', 'KIWI', 'DATE', 'CLOVER', 'TULIP',
  'DAISY', 'LILAC', 'IRIS', 'POPPY', 'LOTUS', 'HEATHER', 'BLUEBELL', 'BRAMBLE', 'CACTUS', 'FERN',
  'MOSS', 'IVY', 'BLOSSOM', 'BUD', 'LEAF', 'POLLEN', 'NECTAR', 'SAGE', 'MINT', 'DILL',
  'CHIVE', 'FENNEL', 'GINGER', 'PEPPER', 'MUSTARD', 'RADISH', 'BEAN', 'SQUASH', 'PUMPKIN', 'KALE',
  'ONION', 'GARLIC', 'PARSNIP', 'CABBAGE', 'SPINACH', 'OKRA', 'YAM', 'MUSHROOM', 'WHEAT', 'BARLEY',
  'RICE', 'COTTON', 'FLAX', 'COFFEE', 'SPROUT', 'BRANCH', 'GARDEN', 'MEADOW', 'ORCHARD', 'GROVE',
  'FOREST', 'HEDGE', 'HARVEST', 'SOIL', 'MULCH', 'COMPOST', 'PEBBLE', 'SHOVEL', 'BUCKET', 'WAGON',
]

/** The original 0001 list. Rooms made before 0005 still carry these words, so they are valid, never "corrected". */
export const LEGACY_ROOM_WORDS: readonly string[] = [
  'OAK', 'ELM', 'ASH', 'BIRCH', 'MAPLE', 'PINE', 'CEDAR', 'FIR', 'SPRUCE', 'WILLOW', 'ALDER', 'BEECH',
  'HAZEL', 'ROWAN', 'YEW', 'LARCH', 'POPLAR', 'ASPEN', 'CHERRY', 'PLUM', 'APPLE', 'PEAR', 'FIG', 'OLIVE',
  'LINDEN', 'HOLLY', 'JUNIPER', 'HEMLOCK', 'SEQUOIA', 'REDWOOD', 'BALSA', 'TEAK', 'EBONY', 'MAHOGANY', 'WALNUT', 'PECAN',
  'CHESTNUT', 'HICKORY', 'SYCAMORE', 'CYPRESS', 'MAGNOLIA', 'DOGWOOD', 'BAOBAB', 'BANYAN', 'MANGO', 'LEMON', 'LIME', 'ORANGE',
  'PEACH', 'APRICOT', 'ACACIA', 'BAMBOO', 'PALM', 'COCOA', 'MULBERRY', 'LOCUST', 'TAMARACK', 'BUCKEYE', 'ELDER', 'SUMAC',
  'GINKGO', 'CATALPA', 'MESQUITE', 'LAUREL',
]

const KNOWN = new Set([...ROOM_WORDS, ...LEGACY_ROOM_WORDS])
export const MAX_WORD_LENGTH = Math.max(...[...KNOWN].map((w) => w.length))
export const DIGITS = 4

export const isKnownWord = (word: string) => KNOWN.has(word.toUpperCase())
export const isComplete = (code: string) => /^[A-Z]+-\d{4}$/.test(code)

const isLetter = (c: string) => c >= 'A' && c <= 'Z'
const isDigit = (c: string) => c >= '0' && c <= '9'
const isSeparator = (c: string) => !isLetter(c) && !isDigit(c)

type Parsed = { letters: string; digits: string; separator: boolean; whole: boolean }

/** Letters before the first digit, then digits; anything else is dropped. */
function simple(upper: string): Parsed {
  let letters = ''
  let digits = ''
  let separator = false
  for (const c of upper) {
    if (digits === '' && isLetter(c)) {
      if (letters.length < MAX_WORD_LENGTH) letters += c
      separator = false
    } else if (isDigit(c) && letters !== '') {
      if (digits.length < DIGITS) digits += c
    } else if (digits === '' && letters !== '' && isSeparator(c)) {
      separator = true
    }
  }
  return { letters, digits, separator, whole: false }
}

/**
 * The first "letters, separators, 4+ digits" in `s` from `from`, in one linear pass (a regex with
 * a leading [A-Z]+ is quadratic on long letter runs, and the route param is parsed every render).
 */
function findCode(s: string, from: number, sepOk: (c: string) => boolean): { start: number; word: string; digits: string } | null {
  let ws = -1 // start of the candidate word, -1 if none
  let we = -1
  for (let i = from; i < s.length; i++) {
    const c = s[i]
    if (isLetter(c)) {
      if (we !== i) ws = i // a new run unless it continues the candidate
      we = i + 1
    } else if (isDigit(c)) {
      let j = i
      while (j < s.length && isDigit(s[j])) j++
      if (ws >= 0 && j - i >= DIGITS) return { start: ws, word: s.slice(ws, we), digits: s.slice(i, i + DIGITS) }
      ws = we = -1
      i = j - 1
    } else if (!sepOk(c)) {
      ws = we = -1
    }
  }
  return null
}

const anySep = () => true
const linkSep = (c: string) => c !== '/' && c !== '?' && c !== '#'

/** A whole code inside a link or a message, if there is one. */
function whole(upper: string, plain: Parsed): Parsed | null {
  const at = upper.indexOf('/R/')
  const link = at >= 0 ? findCode(upper, at + 3, linkSep) : null
  if (link && link.start === at + 3) return { letters: link.word.slice(0, MAX_WORD_LENGTH), digits: link.digits, separator: false, whole: true }
  const m = findCode(upper, 0, anySep)
  if (!m) return null
  // "pe can 2654" is PECAN; "Code: lime-6014" is LIME. Prefer whichever reading is a real word.
  const word = isKnownWord(plain.letters) || (!isKnownWord(m.word) && plain.letters.length < MAX_WORD_LENGTH) ? plain.letters : m.word
  return { letters: word.slice(0, MAX_WORD_LENGTH), digits: m.digits, separator: false, whole: true }
}

/** Longest input looked at; a pasted message or link is far shorter, and this bounds the work. */
const MAX_INPUT = 1000

/**
 * Uppercase plain text: URL escapes decoded (a link may carry pecan%202654), and full-width or
 * other compatibility forms folded by NFKC (ＰＥＣＡＮ２６５４). Never throws.
 */
function prepare(raw: string): string {
  let s = raw.slice(0, MAX_INPUT)
  if (s.includes('%')) {
    try {
      s = decodeURIComponent(s)
    } catch {
      // malformed: decode the ASCII escapes one by one, anything else becomes a separator
      s = s.replace(/%([0-9A-Fa-f]{2})/g, (_, h: string) => {
        const code = parseInt(h, 16)
        return code < 0x80 ? String.fromCharCode(code) : ' '
      })
    }
  }
  return s.normalize('NFKC').toUpperCase()
}

function parse(raw: string): Parsed {
  const upper = prepare(raw)
  const plain = simple(upper)
  return whole(upper, plain) ?? plain
}

const show = (p: Parsed, keepTrailingHyphen = true) =>
  p.letters === '' ? '' : p.digits !== '' ? `${p.letters}-${p.digits}` : p.separator && keepTrailingHyphen ? `${p.letters}-` : p.letters

/** The display form of whatever was typed or pasted: PECAN, PECAN-, PECAN-26, PECAN-2654. */
export function normalizeCode(raw: string): string {
  return show(parse(raw))
}

/**
 * One keystroke (or paste) in the code field. `prev` is what the field showed, `raw` and `caret`
 * are the browser's new value and selection. Returns what to show and where to put the caret.
 */
export function editCode(prev: string, raw: string, caret: number, inputType = ''): { value: string; caret: number } {
  const deleting = raw.length < prev.length
  // The browser removed the hyphen between word and digits (it would only come back): take the
  // letter before it (backspace) or the digit after it (delete). A trailing hyphen just goes.
  const h = prev.indexOf('-')
  if (deleting && h > 0 && h < prev.length - 1 && raw === prev.slice(0, h) + prev.slice(h + 1)) {
    if (inputType === 'deleteContentForward') return editCode(prev, prev.slice(0, h) + prev.slice(h + 2), h)
    return editCode(prev, prev.slice(0, h - 1) + prev.slice(h + 1), h - 1)
  }

  const p = parse(raw)
  const value = show(p, !deleting)
  if (p.whole && raw.length - prev.length > 1) return { value, caret: value.length }

  // Map the caret: count the kept letters and digits before it in the raw value.
  const before = simple(prepare(raw.slice(0, caret)))
  const letters = Math.min(before.letters.length, p.letters.length)
  const digits = Math.min(before.digits.length, p.digits.length)
  const hyphen = value.includes('-')
  const pastHyphen = hyphen && (digits > 0 || (letters === p.letters.length && before.separator))
  return { value, caret: letters + (pastHyphen ? 1 : 0) + digits }
}

/** Optimal string alignment distance: insertions, deletions, substitutions and adjacent swaps. */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return d[a.length][b.length]
}

/** "Did you mean PECAN?": the one current word within two edits, or null if none, a tie, or already a known word. */
export function suggestWord(word: string): string | null {
  const w = word.toUpperCase()
  if (w === '' || isKnownWord(w)) return null
  let best: string | null = null
  let bestD = 3
  let tie = false
  for (const candidate of ROOM_WORDS) {
    const dist = distance(w, candidate)
    if (dist < bestD) {
      best = candidate
      bestD = dist
      tie = false
    } else if (dist === bestD) {
      tie = true
    }
  }
  return best && !tie ? best : null
}
