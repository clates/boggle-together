import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { estimateOffset, type ClockSample } from './clock'
import { derivePhase, type Phase } from './phase'
import { ensureSession, supabase, type Client } from './supabase'

export type RoomRow = {
  code: string
  round: number
  start_at: string | null
  ends_at: string | null
  results_at: string | null
  [key: string]: unknown
}

export type Participant = {
  room_code: string
  id: string
  kind: 'household' | 'typist'
  name: string
  ready: boolean
  pens_down: boolean
  [key: string]: unknown
}

export type RoomStatus = 'loading' | 'not-found' | 'needs-join' | 'ready'

const CLOCK_SAMPLES = 5
const BOARD_RETRY_MS = 250
const TICK_MS = 100
const BENIGN = 'Round already in progress'

async function sampleClock(client: Client): Promise<number> {
  const samples: ClockSample[] = []
  for (let i = 0; i < CLOCK_SAMPLES; i++) {
    const sentMs = Date.now()
    const { data, error } = await client.rpc('server_now')
    const receivedMs = Date.now()
    if (error || typeof data !== 'string') continue
    samples.push({ sentMs, receivedMs, serverMs: Date.parse(data) })
  }
  return estimateOffset(samples)
}

export function useRoom(code: string, client: Client = supabase) {
  const [status, setStatus] = useState<RoomStatus>('loading')
  const [room, setRoom] = useState<RoomRow | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [uid, setUid] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [boardState, setBoardState] = useState<{ round: number; letters: string[] } | null>(null)
  const [, setTick] = useState(0)
  const offsetRef = useRef(0)
  offsetRef.current = offset

  const serverNowMs = useCallback(() => Date.now() + offsetRef.current, [])

  const load = useCallback(async () => {
    const id = await ensureSession(client)
    const { data: roomRow } = await client.from('rooms').select('*').eq('code', code).maybeSingle()
    if (!roomRow) {
      const { data: exists } = await client.rpc('room_exists', { p_code: code })
      setUid(id)
      setRoom(null)
      setParticipants([])
      setStatus(exists ? 'needs-join' : 'not-found')
      return
    }
    const { data: parts } = await client.from('participants').select('*').eq('room_code', code)
    const list = (parts ?? []) as Participant[]
    setUid(id)
    setRoom(roomRow as RoomRow)
    setParticipants(list)
    setStatus(list.some((p) => p.id === id) ? 'ready' : 'needs-join')
  }, [client, code])

  // initial load and realtime
  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    const run = () => {
      load().catch(() => {
        if (!cancelled) setStatus((s) => (s === 'loading' ? 'not-found' : s))
      })
    }
    run()
    const channel = client
      .channel(`room:${code}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `code=eq.${code}` }, run)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `room_code=eq.${code}` }, run)
      .subscribe()
    return () => {
      cancelled = true
      client.removeChannel(channel)
    }
  }, [client, code, load])

  // clock sync on mount and when the tab becomes visible again after being hidden
  useEffect(() => {
    let cancelled = false
    let wasHidden = false
    const sync = () => {
      sampleClock(client).then((o) => {
        if (!cancelled) setOffset(o)
      }, () => {})
    }
    sync()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') wasHidden = true
      else if (wasHidden) {
        wasHidden = false
        sync()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [client])

  const phase: Phase = room ? derivePhase(room, serverNowMs()) : 'lobby'

  // re-render ticks while the clock matters
  const ticking = phase === 'countdown' || phase === 'playing'
  useEffect(() => {
    if (!ticking) return
    const t = setInterval(() => setTick((n) => n + 1), TICK_MS)
    return () => clearInterval(t)
  }, [ticking])

  // board: retry until the server releases it
  const round = room?.round ?? null
  const wantBoard = status === 'ready' && round !== null && (phase === 'playing' || phase === 'locked' || phase === 'results')
  const haveBoard = boardState !== null && boardState.round === round
  useEffect(() => {
    if (!wantBoard || haveBoard || round === null) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const attempt = async () => {
      const { data } = await client.rpc('get_board', { p_code: code })
      if (cancelled) return
      if (Array.isArray(data)) setBoardState({ round, letters: data as string[] })
      else timer = setTimeout(attempt, BOARD_RETRY_MS)
    }
    attempt().catch(() => {
      if (!cancelled) timer = setTimeout(attempt, BOARD_RETRY_MS)
    })
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [client, code, round, wantBoard, haveBoard])

  const board = haveBoard ? boardState.letters : null
  const me = useMemo(() => participants.find((p) => p.id === uid) ?? null, [participants, uid])

  const call = useCallback(
    async (fn: string, args: Record<string, unknown>) => {
      const { error } = await client.rpc(fn, { p_code: code, ...args })
      if (error) {
        if (error.message === BENIGN) return
        throw new Error(error.message)
      }
    },
    [client, code],
  )

  const join = useCallback(
    async (kind: 'household' | 'typist', name: string) => {
      const { error } = await client.rpc('join_room', { p_code: code, p_kind: kind, p_name: name })
      if (error) throw new Error(error.message)
      await load()
    },
    [client, code, load],
  )

  const actions = useMemo(
    () => ({
      setReady: (b: boolean) => call('set_ready', { p_ready: b }),
      startAnyway: () => call('start_anyway', {}),
      submitWord: (w: string) => call('submit_word', { p_word: w }),
      pensDown: () => call('pens_down', {}),
      showResults: () => call('show_results', {}),
    }),
    [call],
  )

  return { status, room, participants, me, phase, serverNowMs, board, actions, join }
}
