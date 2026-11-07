import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Client } from './supabase'
import { useRoom } from './useRoom'

type Row = Record<string, unknown>

function makeFake(opts: { userId?: string } = {}) {
  const db = {
    userId: opts.userId ?? 'u1',
    skewMs: 0, // server clock minus Date.now()
    rooms: new Map<string, Row>(),
    participants: [] as Row[],
    members: new Set<string>(), // codes the user belongs to
    board: null as string[] | null,
    boardCalls: 0,
    handlers: [] as (() => void)[],
    signIns: 0,
  }
  const rpc = vi.fn(async (name: string, args: Row = {}) => {
    const code = String(args.p_code ?? '')
    switch (name) {
      case 'server_now':
        return { data: new Date(Date.now() + db.skewMs).toISOString(), error: null }
      case 'room_exists':
        return { data: db.rooms.has(code), error: null }
      case 'join_room':
        db.members.add(code)
        db.participants.push({ room_code: code, id: db.userId, kind: args.p_kind, name: args.p_name, ready: false, pens_down: false })
        return { data: null, error: null }
      case 'get_board':
        db.boardCalls++
        return { data: db.board, error: null }
      case 'set_ready':
        return { data: null, error: { message: 'Round already in progress' } }
      case 'submit_word':
        return { data: null, error: { message: 'Too late' } }
      default:
        return { data: null, error: null }
    }
  })
  const from = (table: string) => ({
    select: () => ({
      eq: (_col: string, code: string) => {
        const visible = db.members.has(code)
        if (table === 'rooms') {
          const r = visible ? (db.rooms.get(code) ?? null) : null
          return Object.assign(Promise.resolve({ data: r ? [r] : [], error: null }), {
            maybeSingle: async () => ({ data: r, error: null }),
          })
        }
        const rows = visible ? db.participants.filter((p) => p.room_code === code) : []
        return Promise.resolve({ data: rows, error: null })
      },
    }),
  })
  const channel = () => {
    const ch = {
      on: (_t: string, _f: unknown, cb: () => void) => (db.handlers.push(cb), ch),
      subscribe: () => ch,
    }
    return ch
  }
  const client = {
    auth: {
      getSession: async () => ({ data: { session: db.signIns ? { user: { id: db.userId } } : null } }),
      signInAnonymously: async () => {
        db.signIns++
        return { data: { user: { id: db.userId } }, error: null }
      },
    },
    rpc,
    from,
    channel,
    removeChannel: vi.fn(),
  }
  return { db, client: client as unknown as Client, rpc }
}

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

function room(overrides: Row = {}): Row {
  return { code: 'OAK-01', round: 1, start_at: null, ends_at: null, results_at: null, ...overrides }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T12:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('useRoom', () => {
  it('reaches playing at the server start_at even when the local clock is 10 minutes slow', async () => {
    const f = makeFake()
    f.db.skewMs = 10 * 60 * 1000
    const serverNow = Date.now() + f.db.skewMs
    f.db.rooms.set('OAK-01', room({ round: 1, start_at: new Date(serverNow + 3000).toISOString(), ends_at: new Date(serverNow + 183000).toISOString() }))
    f.db.members.add('OAK-01')
    f.db.participants.push({ room_code: 'OAK-01', id: 'u1', kind: 'household', name: 'A', ready: true, pens_down: false })
    f.db.board = null
    const { result } = renderHook(() => useRoom('OAK-01', f.client))
    await flush()
    expect(result.current.status).toBe('ready')
    expect(result.current.phase).toBe('countdown')
    await advance(2700)
    expect(result.current.phase).toBe('countdown')
    await advance(400)
    expect(result.current.phase).toBe('playing')
  })

  it('reports not-found for an unknown code', async () => {
    const f = makeFake()
    const { result } = renderHook(() => useRoom('NOPE-00', f.client))
    expect(result.current.status).toBe('loading')
    await flush()
    expect(result.current.status).toBe('not-found')
  })

  it('gives the same me after unmount and remount with the same session', async () => {
    const f = makeFake()
    f.db.rooms.set('OAK-01', room())
    f.db.members.add('OAK-01')
    f.db.participants.push({ room_code: 'OAK-01', id: 'u1', kind: 'typist', name: 'T', ready: false, pens_down: false })
    const first = renderHook(() => useRoom('OAK-01', f.client))
    await flush()
    const me1 = first.result.current.me
    expect(me1?.id).toBe('u1')
    first.unmount()
    const second = renderHook(() => useRoom('OAK-01', f.client))
    await flush()
    expect(second.result.current.me).toEqual(me1)
    expect(f.db.signIns).toBe(1)
  })

  it('needs-join for a non-member of an existing room, then ready after join', async () => {
    const f = makeFake()
    f.db.rooms.set('OAK-01', room())
    const { result } = renderHook(() => useRoom('OAK-01', f.client))
    await flush()
    expect(result.current.status).toBe('needs-join')
    expect(result.current.me).toBeNull()
    await act(async () => { await result.current.join('household', 'Ann') })
    expect(f.rpc).toHaveBeenCalledWith('join_room', { p_code: 'OAK-01', p_kind: 'household', p_name: 'Ann' })
    expect(result.current.status).toBe('ready')
    expect(result.current.me?.name).toBe('Ann')
  })

  it('retries get_board every 250 ms until it is non-null', async () => {
    const f = makeFake()
    const now = Date.now()
    f.db.rooms.set('OAK-01', room({ start_at: new Date(now - 1000).toISOString(), ends_at: new Date(now + 100000).toISOString() }))
    f.db.members.add('OAK-01')
    f.db.participants.push({ room_code: 'OAK-01', id: 'u1', kind: 'typist', name: 'T', ready: false, pens_down: false })
    const { result } = renderHook(() => useRoom('OAK-01', f.client))
    await flush()
    expect(result.current.phase).toBe('playing')
    expect(result.current.board).toBeNull()
    const before = f.db.boardCalls
    await advance(750)
    expect(f.db.boardCalls).toBeGreaterThanOrEqual(before + 3)
    f.db.board = ['A', 'B']
    await advance(300)
    expect(result.current.board).toEqual(['A', 'B'])
    const calls = f.db.boardCalls
    await advance(1000)
    expect(f.db.boardCalls).toBe(calls)
  })

  it('swallows the stale set_ready error but surfaces others', async () => {
    const f = makeFake()
    f.db.rooms.set('OAK-01', room())
    f.db.members.add('OAK-01')
    f.db.participants.push({ room_code: 'OAK-01', id: 'u1', kind: 'household', name: 'A', ready: false, pens_down: false })
    const { result } = renderHook(() => useRoom('OAK-01', f.client))
    await flush()
    await expect(result.current.actions.setReady(true)).resolves.toBeUndefined()
    await expect(result.current.actions.submitWord('cat')).rejects.toThrow('Too late')
  })
})
