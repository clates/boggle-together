import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeWordsClient, type Row } from './fakeWordsClient'
import { useRoundWords } from './useRoundWords'

afterEach(() => vi.useRealTimers())

describe('useRoundWords', () => {
  it('does nothing until enabled', () => {
    const { client, queries } = fakeWordsClient(() => ({ data: [], error: null }))
    const { result } = renderHook(() => useRoundWords('ABCD', 1, false, client))
    expect(result.current.status).toBe('idle')
    expect(queries).toHaveLength(0)
  })

  it('loads this room and round, grouped by participant', async () => {
    const { client, queries } = fakeWordsClient(() => ({
      data: [
        { participant_id: 'a', word: 'CAT' },
        { participant_id: 'b', word: 'DOG' },
        { participant_id: 'a', word: 'ANT' },
      ],
      error: null,
    }))
    const { result } = renderHook(() => useRoundWords('ABCD', 3, true, client))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.byParticipant).toEqual({ a: ['CAT', 'ANT'], b: ['DOG'] })
    expect(queries[0]).toMatchObject({ table: 'words', filters: { room_code: 'ABCD', round: 3 } })
  })

  it('pages past 1000 rows', async () => {
    const all: Row[] = Array.from({ length: 1500 }, (_, i) => ({ participant_id: 'p' + (i % 7), word: 'W' + i }))
    const { client } = fakeWordsClient((q) => ({ data: all.slice(q.from, q.to + 1), error: null }))
    const { result } = renderHook(() => useRoundWords('ABCD', 1, true, client))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(Object.values(result.current.byParticipant).flat()).toHaveLength(1500)
  })

  it('reports an error and retries on request', async () => {
    let fail = true
    const { client } = fakeWordsClient(() => (fail ? { data: null, error: { message: 'boom' } } : { data: [{ participant_id: 'a', word: 'CAT' }], error: null }))
    const { result } = renderHook(() => useRoundWords('ABCD', 1, true, client))
    await waitFor(() => expect(result.current.status).toBe('error'))
    fail = false
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.byParticipant).toEqual({ a: ['CAT'] })
  })

  it('refetches once about 2.5 s later to catch late words', async () => {
    vi.useFakeTimers()
    let rows: Row[] = [{ participant_id: 'a', word: 'CAT' }]
    const { client, queries } = fakeWordsClient(() => ({ data: rows, error: null }))
    const { result } = renderHook(() => useRoundWords('ABCD', 1, true, client))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(result.current.byParticipant).toEqual({ a: ['CAT'] })
    rows = [...rows, { participant_id: 'a', word: 'DOG' }]
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2600)
    })
    expect(result.current.byParticipant).toEqual({ a: ['CAT', 'DOG'] })
    const n = queries.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000)
    })
    expect(queries.length).toBe(n)
  })

  it('keeps loaded words if the late refetch fails', async () => {
    vi.useFakeTimers()
    let fail = false
    const { client } = fakeWordsClient(() => (fail ? { data: null, error: { message: 'x' } } : { data: [{ participant_id: 'a', word: 'CAT' }], error: null }))
    const { result } = renderHook(() => useRoundWords('ABCD', 1, true, client))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    fail = true
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2600)
    })
    expect(result.current.status).toBe('ready')
    expect(result.current.byParticipant).toEqual({ a: ['CAT'] })
  })
})
