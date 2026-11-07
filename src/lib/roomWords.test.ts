import { describe, expect, it } from 'vitest'
import { LEGACY_ROOM_WORDS, MAX_WORD_LENGTH, ROOM_WORDS } from './roomCode'

// Every migration as text, keyed by path, so the client lists can be checked against the SQL.
const migrations = import.meta.glob('../../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

function wordsIn(sql: string): string[] {
  const m = sql.match(/v_words\s+text\[\]\s*:=\s*array\[([\s\S]*?)\];/)
  if (!m) throw new Error('no v_words array found')
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1])
}

const defining = Object.keys(migrations)
  .sort()
  .filter((path) => /create\s+(or\s+replace\s+)?function\s+public\.create_room\s*\(/i.test(migrations[path]))

describe('room-code words match the database', () => {
  it('ROOM_WORDS equals the list in the latest migration that defines create_room', () => {
    const latest = defining[defining.length - 1]
    expect(latest).toMatch(/0005_room_code_words\.sql$/)
    expect([...ROOM_WORDS]).toEqual(wordsIn(migrations[latest]))
  })

  it('LEGACY_ROOM_WORDS equals the original 0001 list (rooms made before 0005 still use them)', () => {
    expect(defining[0]).toMatch(/0001_schema\.sql$/)
    expect([...LEGACY_ROOM_WORDS]).toEqual(wordsIn(migrations[defining[0]]))
  })

  it('the list is about 100 unique uppercase words and includes PECAN', () => {
    expect(ROOM_WORDS.length).toBeGreaterThanOrEqual(90)
    expect(ROOM_WORDS.length).toBeLessThanOrEqual(110)
    expect(new Set(ROOM_WORDS).size).toBe(ROOM_WORDS.length)
    for (const w of ROOM_WORDS) expect(w).toMatch(/^[A-Z]+$/)
    expect(ROOM_WORDS).toContain('PECAN')
  })

  it('MAX_WORD_LENGTH fits the longest word, old or new', () => {
    expect(MAX_WORD_LENGTH).toBe(Math.max(...[...ROOM_WORDS, ...LEGACY_ROOM_WORDS].map((w) => w.length)))
  })
})
