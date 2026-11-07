import { useEffect, useRef, useSyncExternalStore } from 'react'
import { getAudio } from '../audio'
import type { Phase } from '../phase'
import { cueTimeline } from './cues'

// Re-plan when the server-clock estimate moves by more than this (the first estimate lands after mount).
const OFFSET_SLACK_MS = 15

type RoundTimes = { round: number; start_at: string | null; ends_at: string | null } | null

/** Schedules the round's cues on a household screen while the round is on screen. */
export function useRoundAudio(room: RoundTimes, phase: Phase, serverNowMs: () => number) {
  const engine = getAudio()
  const status = useSyncExternalStore(engine.subscribe, engine.status)
  const active = phase === 'countdown' || phase === 'playing' || phase === 'locked'
  const startAt = room?.start_at ?? null
  const endsAt = room?.ends_at ?? null
  const round = room?.round ?? null

  const offset = serverNowMs() - Date.now()
  const offsetRef = useRef(offset)
  if (Math.abs(offset - offsetRef.current) > OFFSET_SLACK_MS) offsetRef.current = offset
  const offsetKey = offsetRef.current

  useEffect(() => {
    if (!active || !startAt || !endsAt) return
    engine.schedule(cueTimeline({ start_at: startAt, ends_at: endsAt }), serverNowMs)
    return () => engine.cancelAll()
  }, [engine, active, startAt, endsAt, round, offsetKey, serverNowMs])

  return {
    status,
    muted: status === 'muted',
    unlock: () => void engine.unlock(),
    toggleMute: () => {
      const unmuting = engine.status() === 'muted'
      engine.setMuted(!unmuting)
      if (unmuting) void engine.unlock() // this tap is a gesture: use it
    },
  }
}
