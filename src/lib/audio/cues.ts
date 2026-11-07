// When each sound cue of a round sounds, in server epoch ms. Everything is derived from the room's
// start_at / ends_at, so the 2 s / 12 s test rounds and the 5 s / 180 s real rounds work the same.

export type CueKind = 'tick' | 'go' | 'chime-low' | 'chime-high' | 'mini-tick' | 'buzzer'
export type Cue = { atMs: number; kind: CueKind }

const S = 1000
const COUNTDOWN_TICKS = [3, 2, 1] // seconds before start
const CHIME_AT = 60 * S // before the end
const CHIME_HIGH_AFTER = 350 // low note 200 ms + 150 ms gap
const LAST_TICKS = 10 // one per second for the final 10 s

export function cueTimeline(room: { start_at: string; ends_at: string }): Cue[] {
  const start = Date.parse(room.start_at)
  const end = Date.parse(room.ends_at)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return []

  const cues: Cue[] = COUNTDOWN_TICKS.map((s) => ({ atMs: start - s * S, kind: 'tick' }))
  cues.push({ atMs: start, kind: 'go' })
  if (end - CHIME_AT > start) {
    cues.push({ atMs: end - CHIME_AT, kind: 'chime-low' }, { atMs: end - CHIME_AT + CHIME_HIGH_AFTER, kind: 'chime-high' })
  }
  for (let s = LAST_TICKS; s >= 1; s--) {
    const atMs = end - s * S
    if (atMs > start) cues.push({ atMs, kind: 'mini-tick' })
  }
  cues.push({ atMs: end, kind: 'buzzer' })

  // a cue sharing an instant with an earlier one would just stack on it: keep the first
  const seen = new Set<number>()
  return cues
    .sort((a, b) => a.atMs - b.atMs)
    .filter((c) => !seen.has(c.atMs) && (seen.add(c.atMs), true))
}
