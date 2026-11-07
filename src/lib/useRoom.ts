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

async function sampleClock(client: Client): Promise<number | null> {
  const samples: ClockSample[] = []
  for (let i = 0; i < CLOCK_SAMPLES; i++) {
    const sentMs = Date.now()
    const { data, error } = await client.rpc('server_now')
    const receivedMs = Date.now()
    if (error || typeof data !== 'string') continue
    samples.push({ sentMs, receivedMs, serverMs: Date.parse(data) })
  }
  return samples.length ? estimateOffset(samples) : null
}

let topicCounter = 0

type Loaded =
  | { kind: 'absent'; uid: string; exists: boolean }
  | { kind: 'present'; uid: string; room: RoomRow; participants: Participant[] }

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
  const reloadRef = useRef<() => Promise<void>>(async () => {})

  const serverNowMs = useCallback(() => Date.now() + offsetRef.current, [])

  // Room state: load, realtime, reload on SUBSCRIBED / event / tab visible. Only the latest load applies.
  useEffect(() => {
    let cancelled = false
    let reqId = 0
    let attempts = 0
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let channel: ReturnType<Client['channel']> | undefined
    let authSub: { unsubscribe: () => void } | undefined
    setStatus('loading')
    setRoom(null)
    setParticipants([])

    const fetchState = async (): Promise<Loaded> => {
      const id = await ensureSession(client)
      const r = await client.from('rooms').select('*').eq('code', code).maybeSingle()
      if (r.error) throw new Error(r.error.message)
      if (!r.data) {
        const ex = await client.rpc('room_exists', { p_code: code })
        if (ex.error) throw new Error(ex.error.message)
        return { kind: 'absent', uid: id, exists: !!ex.data }
      }
      const p = await client.from('participants').select('*').eq('room_code', code)
      if (p.error) throw new Error(p.error.message)
      return { kind: 'present', uid: id, room: r.data as RoomRow, participants: (p.data ?? []) as Participant[] }
    }

    const run = async (): Promise<void> => {
      const my = ++reqId
      clearTimeout(retryTimer)
      try {
        const res = await fetchState()
        if (cancelled || my !== reqId) return
        attempts = 0
        setUid(res.uid)
        if (res.kind === 'absent') {
          setRoom(null)
          setParticipants([])
          setStatus(res.exists ? 'needs-join' : 'not-found')
          return
        }
        setRoom(res.room)
        setParticipants(res.participants)
        setStatus(res.participants.some((p) => p.id === res.uid) ? 'ready' : 'needs-join')
      } catch {
        if (cancelled || my !== reqId) return
        const delay = Math.min(1000 * 2 ** attempts, 5000)
        attempts++
        retryTimer = setTimeout(run, delay)
      }
    }
    reloadRef.current = run

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void run()
    }
    document.addEventListener('visibilitychange', onVisibility)

    // Subscribe only after the session exists, with its token on the realtime client.
    const setup = async () => {
      try {
        await ensureSession(client)
        const { data } = await client.auth.getSession()
        if (cancelled) return
        const token = data.session?.access_token
        if (token) client.realtime?.setAuth(token)
        const sub = client.auth.onAuthStateChange?.((_e, session) => {
          if (session?.access_token) client.realtime?.setAuth(session.access_token)
        })
        authSub = sub?.data.subscription
        channel = client
          .channel(`room:${code}:${++topicCounter}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `code=eq.${code}` }, () => void run())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `room_code=eq.${code}` }, () => void run())
          .subscribe((s) => {
            if (s === 'SUBSCRIBED') void run()
          })
      } catch {
        if (!cancelled) retryTimer = setTimeout(setup, 1000)
      }
    }
    // Backstop: Realtime can silently drop changes (e.g. cold start), so poll every 5 s while visible.
    const poll = setInterval(() => {
      if (document.visibilityState !== 'hidden') void run()
    }, 5000)
    void run()
    void setup()

    return () => {
      cancelled = true
      clearTimeout(retryTimer)
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisibility)
      authSub?.unsubscribe()
      if (channel) void client.removeChannel(channel)
    }
  }, [client, code])

  // clock sync on mount and when the tab becomes visible again after being hidden
  useEffect(() => {
    let cancelled = false
    let wasHidden = false
    let established = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const sync = () => {
      clearTimeout(timer)
      sampleClock(client).then(
        (o) => {
          if (cancelled) return
          if (o !== null) {
            established = true
            setOffset(o)
          } else if (!established) timer = setTimeout(sync, 2000)
        },
        () => {
          if (!cancelled && !established) timer = setTimeout(sync, 2000)
        },
      )
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
      clearTimeout(timer)
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
      await reloadRef.current()
    },
    [client, code],
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
