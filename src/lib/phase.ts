export type Phase = 'lobby' | 'countdown' | 'playing' | 'locked' | 'results'

export type RoomTimes = {
  start_at: string | null
  ends_at: string | null
  results_at: string | null
}

export function derivePhase(room: RoomTimes, serverNowMs: number): Phase {
  if (room.start_at === null) return 'lobby'
  if (room.results_at !== null) return 'results'
  if (serverNowMs < Date.parse(room.start_at)) return 'countdown'
  if (room.ends_at !== null && serverNowMs < Date.parse(room.ends_at)) return 'playing'
  return 'locked'
}

export function progress(room: RoomTimes, serverNowMs: number): number {
  if (room.start_at === null || room.ends_at === null) return 1
  const start = Date.parse(room.start_at)
  const end = Date.parse(room.ends_at)
  if (serverNowMs <= start) return 1
  if (serverNowMs >= end) return 0
  return Math.min(1, Math.max(0, (end - serverNowMs) / (end - start)))
}
