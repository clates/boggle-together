import { isServerRejection } from './rpcError'

export const RETRY_DELAYS_MS = [500, 1000, 2000]
export const ATTEMPT_TIMEOUT_MS = 8000

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Timed out')), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e: unknown) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

/**
 * Sends, retrying network failures and timeouts with backoff (safe for idempotent RPCs such as
 * submit_word, where a duplicate is ignored). A server rejection is thrown at once.
 */
export async function sendWithRetry(
  send: () => Promise<void>,
  { onRetry, delays = RETRY_DELAYS_MS, timeoutMs = ATTEMPT_TIMEOUT_MS }: { onRetry?: () => void; delays?: number[]; timeoutMs?: number } = {},
): Promise<void> {
  for (let i = 0; ; i++) {
    try {
      await withTimeout(send(), timeoutMs)
      return
    } catch (e) {
      if (isServerRejection(e) || i >= delays.length) throw e
      onRetry?.()
      await sleep(delays[i])
    }
  }
}
