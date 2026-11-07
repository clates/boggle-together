import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RpcError, isServerRejection } from './rpcError'
import { RETRY_DELAYS_MS, sendWithRetry } from './retry'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('isServerRejection', () => {
  it('is true only for errors with a Postgres code', () => {
    expect(isServerRejection(new RpcError('Too late', 'P0001'))).toBe(true)
    expect(isServerRejection(new RpcError('TypeError: Failed to fetch', ''))).toBe(false)
    expect(isServerRejection(new TypeError('Failed to fetch'))).toBe(false)
    expect(isServerRejection(new Error('Too late'))).toBe(false)
  })
})

describe('sendWithRetry', () => {
  it('backs off 500 ms, 1 s, 2 s on network errors, then succeeds', async () => {
    expect(RETRY_DELAYS_MS).toEqual([500, 1000, 2000])
    const send = vi
      .fn()
      .mockRejectedValueOnce(new RpcError('FetchError: offline', ''))
      .mockRejectedValueOnce(new RpcError('FetchError: offline', ''))
      .mockRejectedValueOnce(new RpcError('FetchError: offline', ''))
      .mockResolvedValueOnce(undefined)
    const onRetry = vi.fn()
    const done = vi.fn()
    void sendWithRetry(send, { onRetry }).then(done)
    await vi.advanceTimersByTimeAsync(0)
    expect(send).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(499)
    expect(send).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(send).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(send).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(1999)
    expect(send).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(1)
    expect(send).toHaveBeenCalledTimes(4)
    expect(done).toHaveBeenCalled()
    expect(onRetry).toHaveBeenCalledTimes(3)
  })

  it('gives up after 3 retries with the last network error', async () => {
    const send = vi.fn().mockRejectedValue(new RpcError('FetchError: offline', ''))
    const p = sendWithRetry(send)
    const caught = p.catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(3500)
    expect(send).toHaveBeenCalledTimes(4)
    expect(await caught).toBeInstanceOf(RpcError)
  })

  it('does not retry a server rejection', async () => {
    const send = vi.fn().mockRejectedValue(new RpcError('Too late', 'P0001'))
    const caught = sendWithRetry(send).catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(5000)
    expect(send).toHaveBeenCalledTimes(1)
    expect((await caught as Error).message).toBe('Too late')
  })

  it('treats an attempt that hangs as a network failure', async () => {
    const send = vi.fn().mockReturnValueOnce(new Promise(() => {})).mockResolvedValueOnce(undefined)
    const done = vi.fn()
    void sendWithRetry(send, { timeoutMs: 8000 }).then(done)
    await vi.advanceTimersByTimeAsync(8000)
    expect(send).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(500)
    expect(send).toHaveBeenCalledTimes(2)
    expect(done).toHaveBeenCalled()
  })
})
