import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type Client = SupabaseClient

/**
 * Adds `keepalive: true` to RPC POSTs, so a word typed just before the page unloads (tab closed,
 * phone locked) is still delivered. Other requests are passed through unchanged.
 */
export function keepaliveFetch(base: typeof fetch = (...args) => fetch(...args)): typeof fetch {
  return (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (method === 'POST' && url.includes('/rest/v1/rpc/')) return base(input, { ...init, keepalive: true })
    return base(input, init)
  }
}

export function makeClient(url: string, key: string, baseFetch?: typeof fetch): Client {
  return createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true },
    global: { fetch: keepaliveFetch(baseFetch) },
  })
}

export const supabase: Client = makeClient(
  import.meta.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321',
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'missing-anon-key',
)

const inflight = new WeakMap<object, Promise<string>>()

/** Signs in anonymously if there is no stored session; returns the user id. Safe to call concurrently. */
export function ensureSession(client: Client = supabase): Promise<string> {
  let p = inflight.get(client)
  if (!p) {
    p = (async () => {
      const { data } = await client.auth.getSession()
      if (data.session) return data.session.user.id
      const { data: s, error } = await client.auth.signInAnonymously()
      if (error || !s.user) throw error ?? new Error('Anonymous sign-in failed')
      return s.user.id
    })()
    p.catch(() => inflight.delete(client))
    inflight.set(client, p)
  }
  return p
}
